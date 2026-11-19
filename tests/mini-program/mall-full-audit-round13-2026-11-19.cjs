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
(async () => {
  await check('退款驳回后夹杂旧待发货详情，仍拒绝驳回前的申请', async () => {
    const states=[
      {...order('shipping'),shippingAddress:{refund_rejected_at:'2026-11-19T10:00:00Z'}},
      order('shipping'),
      {...order('refund_pending'),shippingAddress:{refund_applied_at:'2026-11-19T09:00:00Z'}},
      {...order('refund_pending'),shippingAddress:{refund_applied_at:'2026-11-19T11:00:00Z'}},
    ];
    const h=harness('order/detail',{getOrderDetail:async()=>({data:states.shift()})});
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('old-order',{silent:true});
    assert.equal(h.page.data.order.status,'shipping');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canRefund],['shipping',true]);
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canRefund],['refund_pending',false]);
  });
  await check('已退款订单不能被旧待付款详情恢复支付和取消', async () => {
    let reads=0;
    const h=harness('order/detail',{getOrderDetail:async()=>({data:order(++reads===1?'refunded':'pending')})});
    await h.page.loadOrder('old-order');
    assert.equal(h.page.data.order.status,'refunded');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canPay,h.page.data.order.actionFlags.canCancel],['refunded',false,false]);
  });
  await check('同订单换运单后，旧运单轨迹不会回填', async () => {
    let reads=0, requests=0;
    const old=deferred(), current=deferred();
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:{...order('shipped'),shippingAddress:{tracking_number:++reads===1?'OLD':'NEW'}}}),
      getOrderLogistics:()=>++requests===1?old.promise:current.promise,
    });
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('old-order',{silent:true});
    current.resolve({data:{steps:[{desc:'新运单已揽收'}]}});
    await turn();
    old.resolve({data:{steps:[{desc:'旧运单已签收'}]}});
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'新运单已揽收');
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
