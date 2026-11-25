const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const src=fs.readFileSync(__dirname+'/mall-order-regression-03.cjs','utf8');const box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(src.slice(0,src.indexOf('\n(async()=>{'))+'\nmodule.exports={checkout,gate};',box);
const {checkout,gate}=box.module.exports;
const key='product_checkout_v1:unresolved:1';
const failure=(statusCode,message)=>Object.assign(Error(message),{statusCode});
test('an unavailable cached order does not trap subsequent checkout',async()=>{
 let creates=0;const storage=new Map([[key,{id:9}]]);const api={getOrderDetail:async()=>{throw failure(404,'订单未找到')},createOrder:async()=>{creates++;return {data:{id:10,payAmount:0}}}};
 const h=checkout(api,storage);h.p.getTotalPayAmount=()=>0;await h.p.submitOrder();assert.equal(creates,0);assert.equal(storage.has(key),false);assert.ok(h.toasts.some(x=>x.includes('重新下单')));await h.p.submitOrder();assert.equal(creates,1);
});
test('network and unrecognized 404 errors do not clear checkout protection',async()=>{
 for(const error of [failure(500,'服务不可用'),failure(404,'页面不存在'),failure(403,'无权访问')]){const storage=new Map([[key,{id:9}]]);let creates=0;const h=checkout({getOrderDetail:async()=>{throw error},createOrder:async()=>{creates++}},storage);await h.p.submitOrder();assert.equal(storage.get(key).id,9);assert.equal(creates,0);}
});
test('late missing-order reply cannot erase a newer checkout',async()=>{
 let reject;const pending=new Promise((resolve,fail)=>{reject=fail});const storage=new Map([[key,{id:9}]]);const h=checkout({getOrderDetail:()=>pending},storage);const task=h.p.submitOrder();await Promise.resolve();storage.set(key,{id:10});reject(failure(404,'订单未找到'));await task;assert.equal(storage.get(key).id,10);
});
