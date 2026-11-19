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
  await check('退款明确驳回后，旧退款申请详情不能重新锁定订单', async () => {
    const snapshots=[
      order('refund_pending'),
      {...order('shipping'),shippingAddress:{refund_rejected_at:'2026-11-19T10:00:00Z'}},
      {...order('refund_pending'),shippingAddress:{refund_applied_at:'2026-11-19T09:00:00Z'}},
      {...order('refund_pending'),shippingAddress:{refund_applied_at:'2026-11-19T11:00:00Z'}},
    ];
    const h=harness('order/detail',{getOrderDetail:async()=>({data:snapshots.shift()})});
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canRefund],['shipping',true]);
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canRefund],['shipping',true]);
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canRefund],['refund_pending',false]);
  });
  await check('物流返回暂不可用时保留同运单已显示轨迹', async () => {
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order('shipped')}),
      getOrderLogistics:async()=>({data:++reads===1
        ? {available:true,steps:[{desc:'已揽收'}]}
        : {available:false,steps:[],message:'暂无物流轨迹信息'}}),
    });
    await h.page.loadOrder('old-order');
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'已揽收');
    await h.page.loadOrder('old-order',{silent:true});
    await turn();
    assert.equal(reads,2);
    assert.equal(h.page.data.logisticsList[0]?.desc,'已揽收');
  });
  await check('重新打开已完成订单，旧已发货详情不得恢复确认收货', async () => {
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order(++reads===1?'completed':'shipped')}),
      getOrderLogistics:async()=>({data:{steps:[{desc:'已签收'}]}}),
    });
    await h.page.loadOrder('old-order');
    assert.equal(h.page.data.order.status,'completed');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status,h.page.data.order.actionFlags.canConfirmReceipt],['completed',false]);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
