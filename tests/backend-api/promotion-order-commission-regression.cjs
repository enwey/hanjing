const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function harness(file, api) {
  let page, revision=0; const toasts=[], payments=[], storage=new Map();
  const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),showLoading(){},hideLoading(){},showToast:o=>toasts.push(o.title),navigateTo(){},requestPayment:o=>{payments.push(o);o.fail({errMsg:'requestPayment:fail cancel'});}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../mp-weixin-rewrite/pages',file),'utf8'),{
    Page:p=>page=p, wx, console:{error(){}}, setTimeout(){}, require:s=>s.includes('api/index')?api:s.includes('date-time')?{formatChinaDate:x=>x}:{isLoggedIn:()=>true,getRevision:()=>revision,getLoginGeneration:()=>revision}
  });
  page.data=JSON.parse(JSON.stringify(page.data));page.setData=(v,cb)=>{Object.assign(page.data,v);if(cb)cb();};
  return {page,toasts,payments,changeSession:()=>revision++};
}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function checkout(api){const h=harness('product/detail.js',api);Object.assign(h.page.data,{product:{id:1},quantity:1,contactName:'fixture',phone:'13800138001',detailAddress:'fixture'});return h;}
(async()=>{
 for(const exit of ['onHide','onUnload'])await test('POC-03 ignores response after '+exit,async()=>{
  const d=deferred(),h=harness('distribution/orders/index.js',{getDistributionOrders:()=>d.promise});const p=h.page.loadPage();h.page[exit]();d.resolve({data:[{id:'late'}]});await p;assert.equal(h.page.data.orders.length,0);
 });
 await test('POC-03 stale failure does not change newer success or toast',async()=>{
  const d=deferred();let calls=0;const h=harness('distribution/orders/index.js',{getDistributionOrders:()=>++calls===1?d.promise:Promise.resolve({data:[{id:'new'}]})});const p=h.page.loadPage();await h.page.loadPage();d.reject(Error('old failure'));await p;assert.equal(h.page.data.orders[0].id,'new');assert.equal(h.toasts.length,0);
 });
 await test('POC-02 detail lookup failure never creates another order',async()=>{
  let creates=0;const h=checkout({createOrder:async()=>({data:{id:++creates}}),payOrder:async()=>({data:{}}),getOrderDetail:async()=>{throw Error('network');}});await h.page.submitOrder();await h.page.submitOrder();assert.equal(creates,1);assert.equal(h.payments.length,1);assert.equal(h.page.data.isSubmitting,false);
 });
 await test('POC-02 concurrent retry while querying detail remains locked',async()=>{
  let creates=0,queries=0;const d=deferred();const h=checkout({createOrder:async()=>({data:{id:++creates}}),payOrder:async()=>({data:{}}),getOrderDetail:()=>{queries++;return d.promise;}});await h.page.submitOrder();const a=h.page.submitOrder(),b=h.page.submitOrder();d.resolve({data:{status:'pending'}});await Promise.all([a,b]);assert.equal(creates,1);assert.equal(queries,1);assert.equal(h.payments.length,2);
 });
 await test('POC-02 changed session during detail lookup prevents payment',async()=>{
  let creates=0;const d=deferred();const h=checkout({createOrder:async()=>({data:{id:++creates}}),payOrder:async()=>({data:{}}),getOrderDetail:()=>d.promise});await h.page.submitOrder();const p=h.page.submitOrder();h.changeSession();d.resolve({data:{status:'pending'}});await p;assert.equal(creates,1);assert.equal(h.payments.length,1);
 });
 console.log(JSON.stringify({scope:'Isolated source regression, mocked wx/API only',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
