const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const payment = require('../../mp-weixin-rewrite/common/utils/order-payment');
const root = path.resolve(__dirname, '../../mp-weixin-rewrite');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const turn = () => new Promise(resolve => setImmediate(resolve));
const timeout = () => Object.assign(new Error('请求超时'), { statusCode: 408 });
const order = (status, id = 'old-order') => ({
  id, status, payMethod: 'wechat', orderNo: id,
  shippingAddress: { express_company: '测试快递', tracking_number: 'TRACK001' },
  items: [{ productId: 1, productName: '测试商品', quantity: 2, price: 1000 }],
});

function harness(file, api, extraWx = {}) {
  let page;
  let generation = 1;
  let loggedIn = true;
  const toasts = [], prompts = [], routes = [];
  const storage = new Map();
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showLoading() {}, hideLoading() {},
    showToast: ({ title }) => toasts.push(title),
    showModal: prompt => prompts.push(prompt),
    showActionSheet: prompt => prompts.push(prompt),
    navigateTo: ({ url }) => routes.push(url),
    ...extraWx,
  };
  const dependencies = {
    'api/index': api,
    'stores/session-store': { getLoginGeneration: () => generation, isLoggedIn: () => loggedIn },
    'utils/date-time': { formatChinaDateTime: value => value },
    'utils/subscribe': { requestSubscribe: async () => {}, refreshSubscribeSettings: async () => {} },
    'utils/order-payment': payment,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages', file + '.js'), 'utf8'), {
    wx, Page: config => { page = config; }, setTimeout: callback => callback(),
    console: { error() {} },
    require: name => Object.entries(dependencies).find(([suffix]) => name.endsWith(suffix))?.[1] || {},
  });
  page.setData = (data, callback) => { Object.assign(page.data, data); callback?.(); };
  return { page, toasts, prompts, routes, switchAccount(nextLoggedIn = true) { generation++; loggedIn = nextLoggedIn; } };
}

const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); }
}

(async () => {
  for (const [label, categoryError, expected] of [
    ['分类 404 时仍展示商品', { statusCode: 404 }, 1],
    ['分类超时时仍应能读商品', timeout(), 1],
  ]) {
    await check(label, async () => {
      const h = harness('product/index', {
        getProductCategories: async () => { throw categoryError; },
        getProducts: async () => ({ data: [{ id: 1, name: '商品', price: 1000 }] }),
        getMemberInfo: async () => null,
      });
      await h.page.loadProducts();
      assert.equal(h.page.data.products.length, expected);
      assert.deepEqual(Array.from(h.page.data.categories, item => item.key), ['all', 'device', 'accessory', 'service']);
    });
  }
  await check('分类请求等待期间先加载商品，分类恢复后使用实际分类', async () => {
    const firstCategory = deferred();
    let productsRequested = 0;
    let categoriesRequested = 0;
    const h = harness('product/index', {
      getProductCategories: async () => {
        categoriesRequested++;
        if (categoriesRequested === 1) {
          await firstCategory.promise;
          throw new Error('request:fail timeout');
        }
        return { data: [{ code: 'device', name: '自定义器械' }] };
      },
      getProducts: async () => {
        productsRequested++;
        return { data: [{ id: 1, name: '商品', price: 1000, category: 'device' }] };
      },
      getMemberInfo: async () => null,
    });
    const pending = h.page.loadProducts();
    try { assert.equal(productsRequested, 1); }
    finally { firstCategory.resolve(); await pending; }
    assert.equal(h.page.data.visibleProducts.length, 1);
    assert.equal(h.page.data.categories[1].label, '医疗器械');
    await h.page.loadProducts({ silent: true });
    assert.equal(h.page.data.categories[1].label, '自定义器械');
  });
  await check('商品详情暂时超时保留已加载商品', async () => {
    let fail = false;
    const h = harness('product/detail', {
      getProductDetail: async () => {
        if (fail) throw timeout();
        return { data: { id: 1, name: '商品', price: 1000 } };
      },
      getMemberInfo: async () => null,
    });
    await h.page.loadProduct(1);
    fail = true;
    await h.page.loadProduct(1, { silent: true });
    assert.equal(h.page.data.product.id, '1');
  });
  await check('实际地址选择回填姓名电话和详细地址', async () => {
    const h = harness('product/detail', {}, {
      getSetting: options => options.success({ authSetting: { 'scope.address': true } }),
      chooseAddress: options => options.success({
        userName: '测试人', telNumber: '13800138001', provinceName: '广东省',
        cityName: '广州市', countyName: '越秀区', detailInfo: '测试路一号',
      }),
    });
    await h.page.chooseWxAddress();
    assert.equal(h.page.data.contactName, '测试人');
    assert.equal(h.page.data.phone, '13800138001');
    assert.match(h.page.data.detailAddress, /测试路一号/);
    assert.equal(h.page.validateAddress(true), true);
  });
  await check('换号后忽略旧结算页返回的微信地址', async () => {
    let choose;
    const h = harness('product/detail', {}, {
      getSetting: options => options.success({ authSetting: { 'scope.address': true } }),
      chooseAddress: options => { choose = options; },
    });
    const pending = h.page.chooseWxAddress();
    await turn();
    assert.ok(choose);
    h.switchAccount();
    choose.success({ userName: '旧账号收货人', telNumber: '13800138001', detailInfo: '旧收货地址' });
    await pending;
    assert.equal(h.page.data.contactName, '', '旧地址回调在会话变化后仍回填');
  });
  for (const [amount, mode] of [[0, 'free'], [1200, 'paid'], [1200, 'cancel']]) {
    await check('结算 ' + mode, async () => {
      const calls = [];
      const h = harness('product/detail', {
        createOrder: async input => {
          calls.push('create');
          assert.equal(input.items[0].quantity, 2);
          return { data: { id: 7, payAmount: amount } };
        },
        payOrder: async () => { calls.push('prepay'); return { data: {} }; },
        confirmOrderPayment: async () => { calls.push('confirm'); },
      }, {
        requestPayment: options => {
          calls.push('native');
          if (mode === 'cancel') options.fail({ errMsg: 'requestPayment:fail cancel' });
          else options.success({});
        },
      });
      Object.assign(h.page.data, { product: { id: 1, price: amount / 2 }, quantity: 2, contactName: '测试', phone: '13800138001', detailAddress: '测试地址' });
      await h.page.submitOrder();
      assert.deepEqual(calls, mode === 'free' ? ['create'] : mode === 'cancel' ? ['create', 'prepay', 'native'] : ['create', 'prepay', 'native', 'confirm']);
      assert.equal(h.routes.at(-1), mode === 'cancel' ? undefined : '/pages/order/detail?id=7');
    });
  }
  for (const flow of ['product/detail', 'order/detail']) {
    for (const mode of ['native-timeout', 'confirmation-timeout']) {
      await check('已付款超时核对 ' + flow + ' ' + mode, async () => {
        let status = 'pending';
        const h = harness(flow, {
          createOrder: async () => ({ data: { id: 7, payAmount: 1200 } }),
          payOrder: async () => ({ data: {} }),
          confirmOrderPayment: async () => { status = 'shipping'; throw timeout(); },
          getOrderDetail: async () => ({ data: order(status, '7') }),
        }, {
          requestPayment: options => {
            if (mode === 'confirmation-timeout') return options.success({});
            status = 'shipping';
            options.fail({ errMsg: 'requestPayment:fail timeout' });
          },
        });
        if (flow === 'product/detail') {
          Object.assign(h.page.data, { product: { id: 1 }, contactName: '测试', phone: '13800138001', detailAddress: '测试地址' });
          await h.page.submitOrder();
          assert.equal(h.routes.at(-1), '/pages/order/detail?id=7');
        } else {
          h.page.data.order = h.page.normalizeOrder(order('pending', '7'));
          await h.page.onPayOrder();
          assert.equal(h.page.data.order.status, 'shipping');
          assert.equal(h.page.data.order.actionFlags.canPay, false);
          assert.equal(h.page.data.order.actionFlags.canCancel, false);
          assert.equal(h.page.data.order.actionFlags.canRefund, true);
        }
      });
    }
  }
  await check('订单列表换号后忽略旧请求', async () => {
    const response = deferred();
    const h = harness('order/index', { getOrders: () => response.promise });
    const pending = h.page.loadOrders();
    h.switchAccount();
    response.resolve({ data: [order('pending')] });
    await pending;
    assert.equal(h.page.data.visibleOrders.length, 0, '换号后仍展示旧请求返回的订单');
  });
  await check('订单详情换号后忽略旧请求', async () => {
    const response = deferred();
    const h = harness('order/detail', { getOrderDetail: () => response.promise });
    const pending = h.page.loadOrder('old-order');
    h.switchAccount();
    response.resolve({ data: order('paid') });
    await pending;
    assert.equal(h.page.data.order, null, '换号后仍展示旧请求返回的详情');
  });
  await check('订单列表普通超时保留数据，401 清理数据', async () => {
    let failure;
    const h = harness('order/index', { getOrders: async () => {
      if (failure) throw failure;
      return { data: [order('pending')] };
    } });
    await h.page.loadOrders();
    failure = timeout();
    await h.page.onShow();
    assert.equal(h.page.data.visibleOrders.length, 1);
    failure = Object.assign(Error('未授权'), { statusCode: 401 });
    await h.page.onShow();
    assert.equal(h.page.data.visibleOrders.length, 0);
  });
  await check('自提待到货订单显示中文状态且可从订单列表找到', async () => {
    const item = { ...order('processing'), shippingAddress: { deliveryMethod: 'pickup_pending' } };
    const list = harness('order/index', { getOrders: async () => ({ data: [item] }) });
    const detail = harness('order/detail', {});
    await list.page.loadOrders();
    assert.equal(list.page.data.visibleOrders.length, 1);
    const shown = [list.page.data.visibleOrders[0].statusLabel, detail.page.normalizeOrder(item).statusLabel];
    assert.deepEqual(shown, ['待到货', '待到货']);
  });
  for (const [mode, expected, action] of [
    ['cancel', 'cancelled', 'onCancelOrder'], ['refund', 'refund_pending', 'onApplyRefund'],
  ]) {
    await check('取消或退款超时后主动核对 ' + mode, async () => {
      let status = mode === 'cancel' ? 'pending' : 'shipped';
      const h = harness('order/detail', {
        [mode === 'cancel' ? 'cancelOrder' : 'applyRefund']: async () => { status = expected; throw timeout(); },
        getOrderDetail: async () => ({ data: order(status) }),
      });
      h.page.data.order = h.page.normalizeOrder(order(status));
      const pending = h.page[action]();
      h.prompts[0].success(mode === 'cancel' ? { confirm: true } : { tapIndex: 1 });
      await pending;
      assert.equal(h.page.data.order.status, expected);
      assert.ok(Object.values(h.page.data.order.actionFlags).every(value => !value));
    });
  }
  for (const [mode, message] of [['unavailable','尚未接入物流轨迹服务'], ['failed','物流信息加载失败']]) {
    await check('已发货物流 ' + mode, async () => {
      const h = harness('order/detail', {
        getOrderDetail: async () => ({ data: order('shipped') }),
        getOrderLogistics: async () => {
          if (mode === 'failed') throw timeout();
          return { data: { steps: [], message } };
        },
      });
      await h.page.loadOrder('old-order');
      await turn();
      assert.match(h.page.data.logisticsMessage, new RegExp(message));
      assert.equal(h.page.data.order.shippingAddress.tracking_number, 'TRACK001');
      assert.equal(h.page.data.order.actionFlags.canConfirmReceipt, true);
    });
  }
  for (const mode of ['success', 'write-timeout', 'detail-timeout', 'duplicate']) {
    await check('确认收货 ' + mode, async () => {
      let status = 'shipped', writes = 0;
      const hold = deferred();
      const h = harness('order/detail', {
        confirmReceipt: async () => {
          writes++;
          if (mode === 'duplicate') await hold.promise;
          status = 'completed';
          if (mode === 'write-timeout') throw timeout();
        },
        getOrderDetail: async () => {
          if (mode === 'detail-timeout') throw timeout();
          return { data: order(status) };
        },
        getOrderLogistics: async () => ({ data: { steps: [] } }),
      });
      h.page.data.order = h.page.normalizeOrder(order('shipped'));
      const first = h.page.onConfirmReceipt();
      h.prompts[0].success({ confirm: true });
      if (mode === 'duplicate') {
        await turn();
        await h.page.onConfirmReceipt();
        const second = h.prompts[1]?.success({ confirm: true });
        try { assert.equal(writes, 1); }
        finally { hold.resolve(); await Promise.all([first, second]); }
      } else {
        await first;
        assert.equal(status, 'completed');
        assert.equal(h.page.data.order?.status, 'completed', '实际显示：' + h.page.data.order?.status);
        assert.equal(h.page.data.order.actionFlags.canConfirmReceipt, false);
      }
    });
  }
  await check('换号后旧确认收货弹层不会提交', async () => {
    let writes = 0;
    const h = harness('order/detail', {
      confirmReceipt: async () => { writes++; },
      getOrderDetail: async () => ({ data: order('shipped') }),
      getOrderLogistics: async () => ({ data: { steps: [] } }),
    });
    h.page.data.order = h.page.normalizeOrder(order('shipped'));
    const pending = h.page.onConfirmReceipt();
    h.switchAccount();
    h.prompts[0].success({ confirm: true });
    await pending;
    assert.equal(writes, 0);
  });
  await check('换号后旧订单列表和详情在新请求挂起时已清空', async () => {
    const pending = deferred();
    let version = 0;
    const list = harness('order/index', { getOrders: async () => version ? pending.promise : { data: [order('pending')] } });
    const detail = harness('order/detail', { getOrderDetail: async () => version ? pending.promise : { data: order('pending') } });
    await list.page.loadOrders();
    await detail.page.loadOrder('old-order');
    list.switchAccount();
    detail.switchAccount();
    version++;
    const jobs = [list.page.loadOrders({ silent: true }), detail.page.loadOrder('old-order', { silent: true })];
    try {
      assert.equal(list.page.data.visibleOrders.length, 0);
      assert.equal(detail.page.data.order, null);
      list.page.openDetail({currentTarget:{dataset:{orderId:'old-order'}}});
      assert.equal(list.routes.length, 0);
    } finally {
      pending.resolve({data: order('pending','new-order')});
      await Promise.all(jobs);
    }
  });
  await check('换号后预填的收货地址不能用于提交', async () => {
    let creates = 0;
    const h = harness('product/detail', { createOrder: async () => { creates++; } });
    h.page.syncCheckoutSession();
    Object.assign(h.page.data, { product: { id: 1 }, contactName: '旧收货人', phone: '13800138001', detailAddress: '旧地址', showCheckout: true });
    h.switchAccount();
    await h.page.submitOrder();
    assert.equal(creates, 0);
    assert.equal(h.page.data.contactName, '');
    assert.equal(h.page.data.phone, '');
    assert.equal(h.page.data.detailAddress, '');
  });
  const failed = results.filter(result => result.status === 'FAIL').length;
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed, failed, results }, null, 2));
  process.exitCode = failed ? 1 : 0;
})();
