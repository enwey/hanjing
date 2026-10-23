const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/mall-order-regression-03.cjs','utf8');
const box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'\nmodule.exports={checkout,gate};',box);
const {checkout,gate}=box.module.exports,results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
(async()=>{
 await test('MALL-10 reopened page recovers after original late success',async()=>{
   const storage=new Map(),d=gate();let creates=0,queries=0;
   const api={createOrder:()=>{creates++;return d.promise;},getOrderDetail:async()=>{queries++;return {data:{id:9,status:'pending'}};}};
   const old=checkout(api,storage),task=old.p.submitOrder();old.p.onUnload();
   const reopened=checkout(api,storage);await reopened.p.submitOrder();
   d.resolve({data:{id:9}});await task;
   assert.ok([...storage.values()].some(v=>v&&v.id===9),'late success was not saved');
   await reopened.p.submitOrder();
   assert.equal(creates,1);assert.equal(queries,1,'expected known-order lookup after late success; actual='+queries);
   assert.equal(reopened.routes.at(-1),'/pages/order/detail?id=9');
 });
 await test('MALL-10 reopened page recovers after original explicit rejection',async()=>{
   const storage=new Map(),d=gate();let creates=0;
   const api={createOrder:async()=>{creates++;if(creates===1)await d.promise;throw Object.assign(Error('rejected'),{statusCode:400});}};
   const old=checkout(api,storage),task=old.p.submitOrder();old.p.onUnload();
   const reopened=checkout(api,storage);await reopened.p.submitOrder();
   d.resolve();await task;
   assert.ok(![...storage.keys()].some(k=>k.startsWith('product_checkout_v1:')),'rejection did not remove persisted guard');
   await reopened.p.submitOrder();assert.equal(creates,2,'expected retry after confirmed rejection; actual='+creates);
 });
 await test('control cancelled persisted order permits new create',async()=>{
   const storage=new Map([['product_checkout_v1:unresolved:1',{id:9}]]);let creates=0;
   const h=checkout({getOrderDetail:async()=>({data:{id:9,status:'cancelled'}}),createOrder:async()=>{creates++;throw Object.assign(Error('rejected'),{statusCode:400});}},storage);
   await h.p.submitOrder();assert.equal(creates,1);
 });
 await test('control completed order clears persisted record after lookup',async()=>{
   const storage=new Map([['product_checkout_v1:unresolved:1',{id:9}]]);let creates=0;
   const api={getOrderDetail:async()=>({data:{id:9,status:'completed'}}),createOrder:async()=>{creates++;throw Object.assign(Error('rejected'),{statusCode:400});}};
   const h=checkout(api,storage);await h.p.submitOrder();assert.equal(creates,0);assert.equal(h.routes.at(-1),'/pages/order/detail?id=9');
   await checkout(api,storage).p.submitOrder();assert.equal(creates,1);
 });
 console.log(JSON.stringify({scope:'Actual page/session source; shared simulated storage; delayed creation responses; no real transactions',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
 process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
