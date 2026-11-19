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
  for (const refreshFirst of [true, false]) {
    await check('补付超时和详情刷新交错，刷新先发起=' + refreshFirst, async () => {
      const payment = deferred(), refresh = deferred(), reconcile = deferred();
      let reads = 0;
      const h = harness('order/detail', {
        payOrder: () => payment.promise,
        getOrderDetail: async () => {
          if (++reads === 1) return { data: order('pending') };
          return (reads === 2) === refreshFirst ? refresh.promise : reconcile.promise;
        },
        confirmOrderPayment: async () => { throw http(409); },
      });
      await h.page.loadOrder('old-order');
      const paying = h.page.onPayOrder();
      let refreshing;
      if (refreshFirst) refreshing = h.page.loadOrder('old-order', { silent: true });
      payment.resolve(Promise.reject(timeout()));
      await turn();
      assert.equal(reads, refreshFirst ? 3 : 2);
      if (!refreshFirst) refreshing = h.page.loadOrder('old-order', { silent: true });
      if (refreshFirst) {
        reconcile.resolve({ data: order('pending') });
        await paying;
        refresh.resolve({ data: order('shipping') });
        await refreshing;
      } else {
        refresh.resolve(Promise.reject(timeout()));
        await refreshing;
        reconcile.resolve({ data: order('shipping') });
        await paying;
      }
      assert.equal(h.page.data.order.status, 'shipping');
      assert.equal(h.page.data.order.actionFlags.canPay, false);
      assert.equal(h.page.data.order.actionFlags.canCancel, false);
    });
  }
  await check('退款成功响应晚于已退款详情，刷新超时后保留已退款', async () => {
    const refund = deferred();
    let reads = 0, submits = 0;
    const h = harness('order/detail', {
      getOrderDetail: async () => {
        if (++reads > 2) throw timeout();
        return {data:order(reads === 1 ? 'shipping' : 'refunded')};
      },
      applyRefund: () => { submits++; return refund.promise; },
    });
    await h.page.loadOrder('old-order');
    const submitting = h.page.onApplyRefund();
    h.prompts[0].success({tapIndex:0});
    await turn();
    assert.equal(submits,1);
    await h.page.loadOrder('old-order',{silent:true});
    assert.equal(h.page.data.order.status,'refunded');
    refund.resolve({});
    await submitting;
    assert.equal(h.page.data.order.status,'refunded');
  });
  await check('确认收货成功后，先前的物流请求不覆盖新详情', async () => {
    const tracking = deferred();
    let reads = 0, tracks = 0;
    const h = harness('order/detail', {
      getOrderDetail: async () => ({data:order(++reads===1?'shipped':'completed')}),
      getOrderLogistics: async () => ++tracks===1 ? tracking.promise : {data:{steps:[{desc:'已签收'}]}},
      confirmReceipt: async () => ({}),
    });
    await h.page.loadOrder('old-order');
    const confirming=h.page.onConfirmReceipt();
    h.prompts[0].success({confirm:true});
    await confirming;
    tracking.resolve({data:{steps:[{desc:'运输中'}]}});
    await turn();
    assert.equal(h.page.data.order.status,'completed');
    assert.equal(h.page.data.logisticsList[0]?.desc,'已签收');
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
