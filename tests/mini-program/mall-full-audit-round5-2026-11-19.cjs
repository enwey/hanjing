const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/mall-full-audit-2026-11-18.cjs', 'utf8');
const context = { require, __dirname, module: { exports: {} }, setImmediate };
vm.runInNewContext(source.slice(0, source.indexOf('const results = '))
  .replace('requestSubscribe: async () => {}', 'requestSubscribe: api.subscribeFixture || (async () => {})') +
  '\nmodule.exports = { harness, deferred, turn, order, timeout };', context);
const { harness, deferred, turn, order, timeout } = context.module.exports;
const http = code => Object.assign(Error('HTTP ' + code), { statusCode: code });
const results = [];
async function check(name, test) {
  try { await test(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); }
}
function checkout(h) {
  Object.assign(h.page.data, { product: { id: 1, price: 1000 }, quantity: 1,
    contactName: '测试', phone: '13800138001', detailAddress: '测试地址', showCheckout: true });
}

(async () => {
  await check('分类请求尚未返回时显示已到达的商品', async () => {
    const category = deferred();
    const h = harness('product/index', {
      getProductCategories: () => category.promise,
      getProducts: async () => ({ data: [{ id: 1, name: '商品', price: 1000 }] }),
      getMemberInfo: async () => null,
    });
    const loading = h.page.loadProducts();
    await turn();
    const countDuringWait = h.page.data.visibleProducts.length;
    category.resolve(Promise.reject(timeout()));
    await loading;
    assert.equal(h.page.data.visibleProducts.length, 1);
    assert.equal(countDuringWait, 1, '商品已返回，分类挂起期间列表仍为空');
  });
  await check('无会员请求时游客商品正常显示', async () => {
    const h = harness('product/index', {
      getProductCategories: async () => ({ data: [] }),
      getProducts: async () => ({ data: [{ id: 1, name: '商品', price: 1000 }] }),
      getMemberInfo: async () => assert.fail('游客不应请求会员信息'),
    });
    h.switchAccount(false);
    await h.page.loadProducts();
    assert.equal(h.page.data.visibleProducts.length, 1);
  });
  await check('确认支付后直接建单，结算过程不发起订阅', async () => {
    let subscribes = 0;
    let creates = 0;
    const h = harness('product/detail', {
      subscribeFixture: async () => { subscribes++; },
      createOrder: async () => { creates++; return { data: { id: 9, payAmount: 0 } }; },
    });
    checkout(h);
    await h.page.submitOrder();
    assert.equal(creates, 1);
    assert.equal(subscribes, 0);
    assert.ok(h.routes.includes('/pages/order/detail?id=9'));
  });
  await check('建单超时且后来核实无订单时存在重新下单路径', async () => {
    const storage = new Map();
    const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key,value),
      removeStorageSync: key => storage.delete(key) };
    let creates = 0;
    const api = { createOrder: async () => { if (++creates === 1) throw timeout(); return { data: { id: 9, payAmount: 0 } }; },
      getOrders: async () => ({ data: [] }) };
    const first = harness('product/detail', api, wx);
    checkout(first);
    await first.page.submitOrder();
    first.page.onUnload();
    const orders = harness('order/index', api, wx);
    await orders.page.loadOrders();
    assert.equal(orders.page.data.orders.length, 0);
    const next = harness('product/detail', api, wx);
    checkout(next);
    await next.page.submitOrder();
    assert.equal(creates, 2, '确认列表没有订单并重新进入后，仍只跳转订单列表：' + next.routes.join(', '));
  });
  await check('两页同时提交时只允许首个建单请求，旧版未知标记保持保护', async () => {
    const storage = new Map();
    const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key) };
    wx.checkoutRequestSet = new Set();
    const pending = deferred();
    let creates = 0;
    const api = { createOrder: () => { creates++; return pending.promise; } };
    const first = harness('product/detail', api, wx);
    const second = harness('product/detail', api, wx);
    checkout(first);
    checkout(second);
    const creating = first.page.submitOrder();
    await turn();
    await second.page.submitOrder();
    assert.equal(creates, 1);
    const checkoutKey = [...storage.keys()].find(key => key.startsWith('product_checkout_v1:'));
    pending.resolve(Promise.reject(timeout()));
    await creating;
    storage.set(checkoutKey, { uncertain: true });
    await second.page.submitOrder();
    assert.equal(creates, 1);
  });
  for (const code of [401, 403]) {
    await check(`补付接口直接返回 ${code} 后清除已不可访问的订单`, async () => {
      const h = harness('order/detail', {
        getOrderDetail: async () => { if (++reads === 1) return { data: order('pending') }; throw http(code); },
        payOrder: async () => { throw http(code); },
      });
      let reads = 0;
      await h.page.loadOrder('old-order');
      await h.page.onPayOrder();
      assert.equal(h.page.data.order, null, '仍保留待付款订单和操作，详情读取次数 ' + reads);
    });
  }
  await check('同一订单新刷新已显示已付款，迟到的旧补付核对不可回退状态', async () => {
    const late = deferred();
    let reads = 0;
    const h = harness('order/detail', {
      payOrder: async () => { throw timeout(); },
      getOrderDetail: async () => {
        if (++reads === 1) return { data: order('pending') };
        if (reads === 2) return late.promise;
        return { data: order('shipping') };
      },
      confirmOrderPayment: async () => { throw http(409); },
    });
    await h.page.loadOrder('old-order');
    const paying = h.page.onPayOrder();
    await turn();
    assert.equal(reads, 2);
    await h.page.loadOrder('old-order', { silent: true });
    assert.equal(h.page.data.order.status, 'shipping');
    late.resolve({ data: order('pending') });
    await paying;
    assert.equal(h.page.data.order.status, 'shipping', '状态回退到 ' + h.page.data.order.status);
    assert.equal(h.page.data.order.actionFlags.canPay, false);
  });
  await check('取消被拒绝且刷新查到已发货时展示退款和确认收货', async () => {
    let reads = 0;
    const h = harness('order/detail', {
      getOrderDetail: async () => ({ data: order(++reads === 1 ? 'pending' : 'shipped') }),
      cancelOrder: async () => { throw http(409); },
      getOrderLogistics: async () => ({ data: { steps: [] } }),
    });
    await h.page.loadOrder('old-order');
    const cancelling = h.page.onCancelOrder();
    h.prompts[0].success({ confirm: true });
    await cancelling;
    assert.equal(h.page.data.order.actionFlags.canCancel, false);
    assert.equal(h.page.data.order.actionFlags.canPay, false);
    assert.equal(h.page.data.order.actionFlags.canConfirmReceipt, true);
    assert.equal(h.page.data.order.actionFlags.canRefund, true);
  });
  const passed = results.filter(x => x.status === 'PASS').length;
  console.log(JSON.stringify({ total: results.length, passed, failed: results.length - passed, results }, null, 2));
  process.exitCode = +(passed !== results.length);
})();
