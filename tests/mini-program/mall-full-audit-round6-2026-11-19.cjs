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
  await check('MALL-R6-01 应用在建单响应前被关闭，重启后可以安全重试', async () => {
    const storage = new Map();
    const wx = {getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key)};
    const interrupted = harness('product/detail', {createOrder:()=>deferred().promise}, wx);
    checkout(interrupted);
    void interrupted.page.submitOrder();
    await turn();
    const key = [...storage.keys()].find(key=>key.startsWith('product_checkout_v1:'));
    const saved = storage.get(key);
    assert.ok(saved?.requestId);
    assert.equal(saved.retryable, undefined);
    // Start a new page runtime with only persisted storage, simulating process loss.
    const ids = [];
    const reopened = harness('product/detail', {createOrder:async ({requestId})=>{ids.push(requestId);return {data:{id:9,payAmount:0}};}}, wx);
    checkout(reopened);
    await reopened.page.submitOrder();
    assert.deepEqual(ids,[saved.requestId],`重启后发出的重试次数 ${ids.length}，跳转 ${reopened.routes.join(', ')}`);
  });
  await check('MALL-R6-02 旧核对先返回不能让仍在进行的新详情刷新失效', async () => {
    const older = deferred(), newer = deferred();
    let reads = 0;
    const h = harness('order/detail', {
      getOrderDetail:async()=> ++reads===1 ? {data:order('pending')} : reads===2 ? older.promise : newer.promise,
      payOrder:async()=>{throw timeout();}, confirmOrderPayment:async()=>{throw http(409);},
    });
    await h.page.loadOrder('old-order');
    const paying=h.page.onPayOrder();
    await turn();
    assert.equal(reads,2);
    const refreshing=h.page.loadOrder('old-order',{silent:true});
    assert.equal(reads,3);
    older.resolve({data:order('pending')});
    await paying;
    newer.resolve({data:order('shipping')});
    await refreshing;
    assert.equal(h.page.data.order.status,'shipping');
    assert.equal(h.page.data.order.actionFlags.canPay,false);
  });
  await check('MALL-R6-03 详情刷新超时时保留仍在途的物流结果', async () => {
    const tracking=deferred();
    let reads=0;
    const h=harness('order/detail',{
      getOrderDetail:async()=>{if(++reads===1)return {data:order('shipped')};throw timeout();},
      getOrderLogistics:()=>tracking.promise,
    });
    await h.page.loadOrder('old-order');
    await h.page.loadOrder('old-order',{silent:true});
    assert.equal(h.page.data.order.status,'shipped');
    tracking.resolve({data:{steps:[{time:'10:00',desc:'已揽收'}]}});
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'已揽收',h.page.data.logisticsMessage);
  });
  await check('分类慢成功时先展示默认分类，然后在同一轮加载内更新', async () => {
    const category=deferred();
    const h=harness('product/index',{
      getProductCategories:()=>category.promise,
      getProducts:async()=>({data:[{id:1,name:'商品',price:1000,category:'device'}]}),
      getMemberInfo:async()=>null,
    });
    const loading=h.page.loadProducts();
    await turn();
    assert.equal(h.page.data.visibleProducts.length,1);
    assert.equal(h.page.data.categories[1].label,'医疗器械');
    category.resolve({data:[{code:'device',name:'自定义器械'}]});
    await loading;
    assert.equal(h.page.data.categories[1].label,'自定义器械');
    assert.equal(h.page.data.visibleProducts.length,1);
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
