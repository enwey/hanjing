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
  for (const [current, stale] of [['refunding','refund_pending'],['refunded','refunding']]) {
    await check('退款详情不能从 '+current+' 回退到 '+stale, async () => {
      let reads=0;
      const h=harness('order/detail',{getOrderDetail:async()=>({data:order(++reads===1?current:stale)})});
      await h.page.loadOrder('old-order');
      assert.equal(h.page.data.order.status,current);
      await h.page.loadOrder('old-order',{silent:true});
      assert.equal(h.page.data.order.status,current);
    });
  }
  await check('已发货详情刷新成功而物流刷新超时，仍保留已展示轨迹', async () => {
    let reads=0;
    const tracking=deferred();
    const h=harness('order/detail',{
      getOrderDetail:async()=>({data:order('shipped')}),
      getOrderLogistics:async()=>++reads===1?{data:{steps:[{desc:'已揽收'}]}}:tracking.promise,
    });
    await h.page.loadOrder('old-order');
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc,'已揽收');
    await h.page.loadOrder('old-order',{silent:true});
    const during=h.page.data.logisticsList[0]?.desc;
    assert.equal(reads,2);
    tracking.resolve(Promise.reject(timeout()));
    await turn();
    assert.deepEqual([h.page.data.order.status,during,h.page.data.logisticsList[0]?.desc],['shipped','已揽收','已揽收']);
  });
  await check('物流成功刷新替换轨迹，切换订单时不沿用旧轨迹', async () => {
    const refresh = deferred(), other = deferred();
    let requests = 0;
    const h = harness('order/detail', {
      getOrderDetail: async id => ({data:order('shipped', id)}),
      getOrderLogistics: async () => {
        requests++;
        if (requests === 1) return {data:{steps:[{desc:'已揽收'}]}};
        return requests === 2 ? refresh.promise : other.promise;
      },
    });
    await h.page.loadOrder('old-order');
    await turn();
    await h.page.loadOrder('old-order', {silent:true});
    assert.equal(h.page.data.logisticsList[0]?.desc, '已揽收');
    refresh.resolve({data:{steps:[{desc:'运输中'}]}});
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc, '运输中');
    await h.page.loadOrder('other-order', {silent:true});
    assert.equal(h.page.data.logisticsList.length, 0);
    other.resolve({data:{steps:[{desc:'已签收'}]}});
    await turn();
    assert.equal(h.page.data.logisticsList[0]?.desc, '已签收');
  });
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
