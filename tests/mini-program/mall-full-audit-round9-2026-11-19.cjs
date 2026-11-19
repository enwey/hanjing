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
  await check('补付核对已付款后，下一次旧详情不得恢复支付', async () => {
    let reads=0;
    const h=harness('order/detail',{
      payOrder:async()=>{throw timeout();},
      getOrderDetail:async()=>({data:order(++reads===2?'shipping':'pending')}),
    });
    await h.page.loadOrder('old-order');
    await h.page.onPayOrder();
    assert.equal(h.page.data.order.status,'shipping');
    await h.page.loadOrder('old-order',{silent:true});
    assert.equal(h.page.data.order.status,'shipping');
    assert.equal(h.page.data.order.actionFlags.canPay,false);
    assert.equal(h.page.data.order.actionFlags.canCancel,false);
  });
  await check('补付核对先返回待发货，挂起的详情仍可更新为已发货', async () => {
    let reads=0;
    const reconciliation=deferred(), refresh=deferred();
    const h=harness('order/detail',{
      payOrder:async()=>{throw timeout();},
      getOrderDetail:async()=>++reads===1 ? {data:order('pending')} : reads===2 ? reconciliation.promise : refresh.promise,
      getOrderLogistics:async()=>({data:{steps:[]}}),
    });
    await h.page.loadOrder('old-order');
    const paying=h.page.onPayOrder();
    await turn();
    assert.equal(reads,2);
    const refreshing=h.page.loadOrder('old-order',{silent:true});
    assert.equal(reads,3);
    reconciliation.resolve({data:order('shipping')});
    await paying;
    refresh.resolve({data:order('shipped')});
    await refreshing;
    assert.equal(h.page.data.order.status,'shipped');
  });
  await check('退款申请成功后，旧详情不得恢复申请退款操作', async () => {
    let requests=0, reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>{reads++;return {data:order('shipping')};},
      applyRefund:async()=>{requests++;},
    });
    await h.page.loadOrder('old-order');
    const applying=h.page.onApplyRefund();
    h.prompts[0].success({tapIndex:0});
    await applying;
    assert.equal(requests,1);
    assert.equal(reads,2);
    assert.equal(h.page.data.order.status,'refund_pending');
    assert.equal(h.page.data.order.actionFlags.canRefund,false);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
