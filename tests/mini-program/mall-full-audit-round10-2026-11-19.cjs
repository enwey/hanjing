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
  await check('已发货后旧待发货详情不能隐藏物流', async () => {
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order(++reads===1?'shipped':'shipping')}),
      getOrderLogistics:async()=>({data:{steps:[{desc:'已揽收'}]}}),
    });
    await h.page.loadOrder('old-order');
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'已揽收');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status, h.page.data.logisticsList[0]?.desc],['shipped','已揽收']);
  });
  await check('退款已进入处理中后，旧待发货详情不能恢复退款操作', async () => {
    const states=['shipping','refunding','shipping'];
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order(states.shift())}),
      applyRefund:async()=>({}),
    });
    await h.page.loadOrder('old-order');
    const applying=h.page.onApplyRefund();
    h.prompts[0].success({tapIndex:0});
    await applying;
    assert.equal(h.page.data.order.status,'refunding');
    await h.page.loadOrder('old-order',{silent:true});
    assert.deepEqual([h.page.data.order.status, h.page.data.order.actionFlags.canRefund],['refunding',false]);
  });
  await check('确认收货后旧待发货详情不能回退或清空物流', async () => {
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order(++reads===1?'shipped':'shipping')}),
      getOrderLogistics:async()=>({data:{steps:[{desc:'已签收'}]}}),
      confirmReceipt:async()=>({}),
    });
    await h.page.loadOrder('old-order');
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'已签收');
    const confirming=h.page.onConfirmReceipt();
    h.prompts[0].success({confirm:true});
    await confirming;
    assert.deepEqual([h.page.data.order.status, h.page.data.logisticsList[0]?.desc],['completed','已签收']);
  });
  await check('退款被后台明确驳回后恢复订单状态与退款入口', async () => {
    let rejected = false;
    const h = harness('order/detail', {
      getOrderDetail: async () => ({data: rejected
        ? {...order('shipping'), shippingAddress: {refund_rejected_at: '2026-11-19T10:00:00Z'}}
        : order('refunding')}),
    });
    await h.page.loadOrder('old-order');
    rejected = true;
    await h.page.loadOrder('old-order', {silent:true});
    assert.deepEqual([h.page.data.order.status, h.page.data.order.actionFlags.canRefund], ['shipping', true]);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
