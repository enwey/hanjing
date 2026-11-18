const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const existing = fs.readFileSync(__dirname + '/mall-full-audit-2026-11-18.cjs', 'utf8');
const context = { require, __dirname, module: { exports: {} }, setImmediate };
vm.runInNewContext(existing.slice(0, existing.indexOf('const results = ')) +
  '\nmodule.exports={harness,turn,order};', context);
const { harness, turn, order } = context.module.exports;
const results = [];
const httpError = (statusCode, message) => Object.assign(Error(message), { statusCode });

async function check(name, test) {
  try {
    await test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

(async () => {
  for (const [name, action, apiMethod, initial, latest, code, choice] of [
    ['取消时发现已付款', 'onCancelOrder', 'cancelOrder', 'pending', 'shipping', 409, { confirm: true }],
    ['补付时订单已付款', 'onPayOrder', 'payOrder', 'pending', 'shipping', 400],
    ['他处已申请退款', 'onApplyRefund', 'applyRefund', 'shipped', 'refund_pending', 409, { tapIndex: 1 }],
    ['他处已确认收货', 'onConfirmReceipt', 'confirmReceipt', 'shipped', 'completed', 400, { confirm: true }],
  ]) {
    await check(name + '后读取实际状态和按钮', async () => {
      let reads = 0;
      const h = harness('order/detail', {
        [apiMethod]: async () => { throw httpError(code, '订单状态已变更，请刷新后查看'); },
        getOrderDetail: async () => { reads++; return { data: order(latest) }; },
        getOrderLogistics: async () => ({ data: { steps: [] } }),
      });
      h.page.data.order = h.page.normalizeOrder(order(initial));
      const actionResult = h.page[action]();
      if (choice) h.prompts[0].success(choice);
      await actionResult;
      assert.equal(h.page.data.order.status, latest,
        '服务端已是 ' + latest + '，页面仍为 ' + h.page.data.order.status + '，读取次数 ' + reads);
    });
  }
  for (const code of [401, 403, 404, 408]) {
    await check('订单详情静默刷新 HTTP ' + code, async () => {
      let calls = 0;
      const h = harness('order/detail', { getOrderDetail: async () => {
        if (++calls > 1) throw httpError(code, code === 404 ? '订单未找到' : '失败');
        return { data: order('pending') };
      } });
      await h.page.loadOrder('old-order');
      await h.page.loadOrder('old-order', { silent: true });
      if (code === 408) {
        assert.equal(h.page.data.order.id, 'old-order');
      } else {
        assert.equal(h.page.data.order, null, '明确不可访问后仍保留旧订单及支付、取消入口');
      }
    });
  }
  for (const serverAmount of [1000, 1500]) {
    await check('结算确认 1000 分，建单返回 ' + serverAmount + ' 分', async () => {
      let prepay = 0, native = 0;
      const h = harness('product/detail', {
        createOrder: async () => ({ data: { id: 7, payAmount: serverAmount } }),
        payOrder: async () => { prepay++; return { data: { package: 'prepay-fixture' } }; },
      }, {
        requestPayment: options => {
          native++;
          options.fail({ errMsg: 'requestPayment:fail cancel' });
        },
      });
      Object.assign(h.page.data, {
        product: { id: 1, price: 1000 }, quantity: 1, contactName: '测试',
        phone: '13800138001', detailAddress: '测试地址', showCheckout: true,
      });
      assert.equal(h.page.getTotalPayAmount(), 1000);
      await h.page.submitOrder();
      const expected = serverAmount === 1000 ? 1 : 0;
      assert.equal(native, expected, '建单金额上调后，未经重新确认仍调起微信支付');
      assert.equal(prepay, expected);
      if (!expected) {
        assert.equal(h.routes.at(-1), '/pages/order/detail?id=7');
        assert.match(h.toasts.at(-1), /金额已变化/);
      }
    });
  }
  await check('支付参数返回更高金额时不调起微信', async () => {
    let native = 0;
    const h = harness('product/detail', {
      createOrder: async () => ({ data: { id: 7, payAmount: 1000 } }),
      payOrder: async () => ({ data: { payAmount: 1500, package: 'prepay-fixture' } }),
    }, { requestPayment: () => { native++; } });
    Object.assign(h.page.data, {
      product: { id: 1, price: 1000 }, quantity: 1, contactName: '测试',
      phone: '13800138001', detailAddress: '测试地址', showCheckout: true,
    });
    await h.page.submitOrder();
    assert.equal(native, 0);
    assert.equal(h.routes.at(-1), '/pages/order/detail?id=7');
  });
  await check('物流失败后已发货订单仍可确认收货和申请退款', async () => {
    const h = harness('order/detail', {
      getOrderDetail: async () => ({ data: order('shipped') }),
      getOrderLogistics: async () => { throw httpError(504, '轨迹查询超时'); },
    });
    await h.page.loadOrder('old-order');
    await turn();
    assert.equal(h.page.data.order.shippingAddress.tracking_number, 'TRACK001');
    assert.match(h.page.data.logisticsMessage, /加载失败/);
    assert.equal(h.page.data.order.actionFlags.canConfirmReceipt, true);
    assert.equal(h.page.data.order.actionFlags.canRefund, true);
  });
  const failed = results.filter(result => result.status === 'FAIL').length;
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed, failed, results }, null, 2));
  process.exitCode = failed ? 1 : 0;
})();
