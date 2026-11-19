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
  await check('补付核对晚到已付款，中途刷新仍为待付款', async () => {
    const lookup=deferred();
    let reads=0;
    const h=harness('order/detail',{
      payOrder:async()=>{throw timeout();},
      getOrderDetail:async()=>++reads===2 ? lookup.promise : {data:order('pending')},
    });
    await h.page.loadOrder('old-order');
    const paying=h.page.onPayOrder();
    await turn();
    assert.equal(reads,2);
    await h.page.loadOrder('old-order',{silent:true});
    lookup.resolve({data:order('shipping')});
    await paying;
    assert.equal(h.page.data.order.status,'shipping');
    assert.equal(h.page.data.order.actionFlags.canPay,false);
    assert.equal(h.page.data.order.actionFlags.canCancel,false);
  });
  for (const action of ['取消','确认收货']) {
    await check(action+'成功后详情暂时返回旧状态', async () => {
      const receipt=action==='确认收货';
      const stale=receipt?'shipped':'pending';
      let calls=0, reads=0;
      const submit=async()=>{calls++;};
      const h=harness('order/detail',{
        getOrderDetail:async()=>{reads++;return {data:order(stale)};},
        cancelOrder:submit, confirmReceipt:submit,
        getOrderLogistics:async()=>({data:{steps:[]}}),
      });
      await h.page.loadOrder('old-order');
      const actionDone=receipt?h.page.onConfirmReceipt():h.page.onCancelOrder();
      h.prompts[0].success({confirm:true});
      await actionDone;
      assert.equal(calls,1);
      assert.equal(reads,2);
      assert.equal(h.page.data.order.status,receipt?'completed':'cancelled');
    });
  }
  await check('确认收货成功且刷新超时，仍显示原请求返回的物流', async () => {
    const track=deferred();
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>{if(++reads>1)throw timeout();return {data:order('shipped')};},
      confirmReceipt:async()=>({}),
      getOrderLogistics:()=>track.promise,
    });
    await h.page.loadOrder('old-order');
    const done=h.page.onConfirmReceipt();
    h.prompts[0].success({confirm:true});
    await done;
    track.resolve({data:{steps:[{desc:'已签收'}]}});
    await turn();
    assert.equal(h.page.data.order.status,'completed');
    assert.equal(h.page.data.logisticsList[0]?.desc,'已签收',h.page.data.logisticsMessage);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
