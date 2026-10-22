const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
const results = [];
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
async function test(name, fn) { try { await fn(); results.push({name, status:'PASS'}); } catch(e) { results.push({name, status:'FAIL', actual:e.message}); } }
function harness(file, api, storage = new Map()) {
  let p; const payments = [], toasts = [], routes = [];
  const wx = {getStorageSync:k=>storage.get(k), setStorageSync:(k,v)=>storage.set(k,v), removeStorageSync:k=>storage.delete(k),
    showLoading(){}, hideLoading(){}, showToast:o=>toasts.push(o.title), navigateTo:o=>routes.push(o.url), requestPayment:o=>payments.push(o)};
  const ctx = {wx, module:{exports:{}}, require:()=>({}), console:{error(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'stores/session-store.js'),'utf8'),ctx);
  const store = ctx.module.exports; store.setAccessToken('fixture-original');
  vm.runInNewContext(fs.readFileSync(path.join(root,'pages',file),'utf8'),{wx, Page:o=>p=o, console:{error(){}}, setTimeout(){},
    require:s=>s.includes('api/index')?api:s.includes('session-store')?store:s.includes('date-time')?{formatChinaDateTime:x=>x}:{}});
  p.data = JSON.parse(JSON.stringify(p.data)); p.setData = o=>Object.assign(p.data,o);
  return {p,store,payments,toasts,routes};
}
function checkout(api, storage) { const h=harness('product/detail.js',api,storage); Object.assign(h.p.data,{product:{id:1},quantity:1,contactName:'fixture',phone:'13800138001',detailAddress:'fixture'}); return h; }
async function until(fn) { for(let i=0;i<30&&!fn();i++) await Promise.resolve(); assert.ok(fn(),'expected phase not reached'); }
(async()=>{
  for(const code of [400,401,403,404,422]) await test('MALL-10 explicit rejection permits retry '+code,async()=>{
    let creates=0; const h=checkout({createOrder:async()=>{creates++;throw Object.assign(Error('rejected'),{statusCode:code});}});
    await h.p.submitOrder(); await h.p.submitOrder(); assert.equal(creates,2); assert.equal(h.p.data.isSubmitting,false);
  });
  for(const code of [408,500]) await test('MALL-10 uncertain response blocks retry '+code,async()=>{
    let creates=0; const h=checkout({createOrder:async()=>{creates++;throw Object.assign(Error('uncertain'),{statusCode:code});}});
    await h.p.submitOrder(); await h.p.submitOrder(); assert.equal(creates,1); assert.equal(h.routes[0],'/pages/order/index'); assert.equal(h.p.data.isSubmitting,false);
  });
  await test('MALL-10 reopening same checkout after unknown commit must not create another order',async()=>{
    let commits=0; const api={createOrder:async()=>{commits++;throw Error('response lost after simulated commit');}};
    const storage=new Map();
    const first=checkout(api,storage); await first.p.submitOrder(); first.p.onUnload();
    const reopened=checkout(api,storage); await reopened.p.submitOrder();
    assert.equal(commits,1,'simulated committed orders after page recreation='+commits);
  });
  await test('MALL-10 storage failure prevents sending create',async()=>{
    let creates=0;
    const storage=new Map(); storage.set=(key,value)=>{if(key.startsWith('product_checkout_v1:'))throw Error('storage full'); return Map.prototype.set.call(storage,key,value);};
    const h=checkout({createOrder:async()=>{creates++;return {data:{id:1}};}},storage);
    await h.p.submitOrder(); assert.equal(creates,0); assert.equal(h.p.data.isSubmitting,false);
  });
  await test('MALL-10 late success survives unload and reuses order on reopen',async()=>{
    let creates=0; const d=gate(), storage=new Map();
    const api={createOrder:()=>{creates++;return d.promise;},getOrderDetail:async()=>({data:{id:9,status:'pending'}})};
    const first=checkout(api,storage); const pending=first.p.submitOrder(); first.p.onUnload();
    d.resolve({data:{id:9}}); await pending;
    const reopened=checkout(api,storage); await reopened.p.submitOrder();
    assert.equal(creates,1); assert.equal(reopened.routes[0],'/pages/order/detail?id=9'); assert.equal(first.payments.length,0);
  });
  await test('MALL-10 unresolved attempt is isolated by account',async()=>{
    let creates=0; const storage=new Map([['account_cache_owner','A']]);
    const api={createOrder:async()=>{creates++;throw Error('lost response');}};
    await checkout(api,storage).p.submitOrder();
    storage.set('account_cache_owner','B'); await checkout(api,storage).p.submitOrder();
    storage.set('account_cache_owner','A'); await checkout(api,storage).p.submitOrder();
    assert.equal(creates,2);
  });
  await test('MALL-11 account change during native payment skips confirmation',async()=>{
    let confirms=0; const h=harness('order/detail.js',{payOrder:async()=>({data:{}}),confirmOrderPayment:async()=>confirms++});
    h.p.data.order={id:1,actionFlags:{canPay:true}}; const task=h.p.onPayOrder(); await until(()=>h.payments.length===1);
    h.store.setAccessToken('fixture-new'); h.payments[0].success(); await task;
    assert.equal(confirms,0); assert.equal(h.p.paymentInProgress,false); assert.ok(!h.toasts.some(s=>s.includes('支付已提交')));
  });
  await test('MALL-11 logout during confirmation skips success and reload',async()=>{
    const d=gate(); let confirms=0,loads=0; const h=harness('order/detail.js',{payOrder:async()=>({data:{}}),confirmOrderPayment:()=>{confirms++;return d.promise;}});
    h.p.loadOrder=async()=>loads++; h.p.data.order={id:1,actionFlags:{canPay:true}};
    const task=h.p.onPayOrder(); await until(()=>h.payments.length===1); h.payments[0].success(); await until(()=>confirms===1);
    h.store.setAccessToken(''); d.resolve({}); await task;
    assert.equal(loads,0); assert.equal(h.p.paymentInProgress,false); assert.ok(!h.toasts.some(s=>s.includes('支付已提交')));
  });
  await test('MALL-11 unchanged account completes confirmation and reload',async()=>{
    let confirms=0,loads=0; const h=harness('order/detail.js',{payOrder:async()=>({data:{}}),confirmOrderPayment:async()=>confirms++});
    h.p.loadOrder=async()=>loads++; h.p.data.order={id:1,actionFlags:{canPay:true}};
    const task=h.p.onPayOrder(); await until(()=>h.payments.length===1); h.payments[0].success(); await task;
    assert.equal(confirms,1); assert.equal(loads,1); assert.equal(h.p.paymentInProgress,false); assert.ok(h.toasts.some(s=>s.includes('支付已提交')));
  });
  console.log(JSON.stringify({scope:'Actual pages/session store; mocked API/wx; page recreation and delayed callbacks; no real transaction',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
  process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
