const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function commission({paid=10000,enabled=true,relations=[{parent_user_id:1,level:1},{parent_user_id:2,level:2}],items=[{price:10000,quantity:1,is_distribution_snapshot:1,commission_rate_level1_snapshot:10,commission_rate_level2_snapshot:5}]}={}){
 const entries=[];const src=read('hanjing-clinic-backend/routes/client.js');const a=src.indexOf('export async function createPendingDistributionCommission'),b=src.indexOf('export async function cancelPendingProductOrder',a);
 const ctx=vm.createContext({maskPhone:()=>'',refreshDistributorLevel:async()=>{},getDistributionFeatureConfig:async()=>({enableDistribution:enabled})});vm.runInContext(src.slice(a,b).replace('export ',''),ctx);
 const conn={execute:async(sql,args)=>{
  if(sql.includes('FROM distribution_relationships'))return [relations];
  if(sql.includes('FROM users'))return [[{nickname:'fixture'}]];
  if(sql.includes('FROM distributors'))return [[{id:args[0],level:'silver'}]];
  if(sql.includes('FROM order_items'))return [items];
  if(sql.startsWith('SELECT id FROM distribution_orders'))return [entries.filter(e=>e.promoter===args[1]&&e.level===(sql.includes('= 1')?1:2))];
  if(sql.includes('INSERT INTO distribution_orders')){entries.push({id:entries.length+1,promoter:args[1],amount:args[4],level:sql.includes("1, 'pending'")?1:2});return [{insertId:entries.length}];}
  if(sql.includes('UPDATE distributors'))return [{affectedRows:1}];
  throw Error('Unexpected SQL '+sql);
 }};
 return {entries,run:()=>ctx.createPendingDistributionCommission(conn,{id:9,pay_amount:paid},3)};
}
function page(file,api){let p;const toasts=[],storage=new Map();const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),showLoading(){},hideLoading(){},showToast:o=>toasts.push(o.title),requestPayment:o=>o.fail({errMsg:'requestPayment:fail cancel'}),navigateTo(){}};
 vm.runInNewContext(read('mp-weixin-rewrite/pages/'+file),{Page:o=>p=o,wx,console:{error(){}},setTimeout(){},require:s=>s.includes('api/index')?api:s.includes('date-time')?{formatChinaDate:x=>x}:{isLoggedIn:()=>true,getRevision:()=>0,getLoginGeneration:()=>0}});
 p.data=JSON.parse(JSON.stringify(p.data));p.setData=(o,cb)=>{Object.assign(p.data,o);if(cb)cb();};return {p,toasts};}
(async()=>{
 await test('commission two levels use snapshot rates',async()=>{const h=commission();await h.run();assert.deepEqual(h.entries.map(e=>e.amount),[1000,500]);});
 await test('commission discount apportioned by actual paid amount',async()=>{const h=commission({paid:5000});await h.run();assert.deepEqual(h.entries.map(e=>e.amount),[500,250]);});
 await test('zero paid amount produces no commission',async()=>{const h=commission({paid:0});await h.run();assert.equal(h.entries.length,0);});
 await test('non-distribution item produces no commission',async()=>{const h=commission({items:[{price:10000,quantity:1,is_distribution_snapshot:0}]});await h.run();assert.equal(h.entries.length,0);});
 await test('zero snapshot rates stay zero',async()=>{const h=commission({items:[{price:10000,quantity:1,is_distribution_snapshot:1,commission_rate_snapshot:10,commission_rate_level1_snapshot:0,commission_rate_level2_snapshot:0}]});await h.run();assert.equal(h.entries.length,0);});
 await test('repeated sequential generation does not duplicate commissions',async()=>{const h=commission();await h.run();await h.run();assert.equal(h.entries.length,2);});
 await test('total commissions capped by paid amount',async()=>{const h=commission({items:[{price:10000,quantity:1,is_distribution_snapshot:1,commission_rate_level1_snapshot:90,commission_rate_level2_snapshot:90}]});await h.run();assert.equal(h.entries.reduce((s,e)=>s+e.amount,0),10000);});
 await test('no promoter relationship produces no commission',async()=>{const h=commission({relations:[]});await h.run();assert.equal(h.entries.length,0);});
 await test('POC-01 global distribution disabled prevents new commission',async()=>{const h=commission({enabled:false});await h.run();assert.equal(h.entries.length,0,'disabled feature still generated '+JSON.stringify(h.entries));});
 await test('POC-02 cancelled payment retries existing order',async()=>{let creates=0;const paidIds=[];const h=page('product/detail.js',{getOrderDetail:async()=>({data:{status:'pending'}}),createOrder:async()=>({data:{id:++creates}}),payOrder:async id=>{paidIds.push(id);return {data:{}};}});Object.assign(h.p.data,{product:{id:1},quantity:1,contactName:'Test',phone:'13800138001',detailAddress:'Fixture address'});await h.p.submitOrder();await h.p.submitOrder();assert.equal(creates,1,'created orders='+creates+', payment ids='+paidIds);assert.deepEqual(paidIds,[1,1]);});
 for(const status of ['cancelled','paid','pending'])await test('POC-02 changed checkout with original status '+status,async()=>{let creates=0;const paidIds=[];const h=page('product/detail.js',{getOrderDetail:async()=>({data:{status}}),createOrder:async()=>({data:{id:++creates}}),payOrder:async id=>{paidIds.push(id);return {data:{}};}});Object.assign(h.p.data,{product:{id:1},quantity:1,contactName:'Test',phone:'13800138001',detailAddress:'Fixture address'});await h.p.submitOrder();h.p.data.quantity=2;await h.p.submitOrder();assert.equal(creates,status==='cancelled'?2:1);assert.deepEqual(paidIds,status==='cancelled'?[1,2]:[1]);});
 await test('invalid checkout address cannot create order',async()=>{let creates=0;const h=page('product/detail.js',{createOrder:async()=>creates++});h.p.data.product={id:1};await h.p.submitOrder();assert.equal(creates,0);});
 await test('POC-03 late promotion order response cannot overwrite newer result',async()=>{let ra,rb,calls=0;const a=new Promise(r=>ra=r),b=new Promise(r=>rb=r);const h=page('distribution/orders/index.js',{getDistributionOrders:()=>++calls===1?a:b});const first=h.p.loadPage();const second=h.p.loadPage();rb({data:[{id:'new',buyerName:'fixture',status:'pending'}]});await second;ra({data:[{id:'old',buyerName:'fixture',status:'pending'}]});await first;assert.equal(h.p.data.orders[0].id,'new');});
 const refundSource=read('hanjing-clinic-backend/refunds.js');
 async function refundCase(status,fromStatus='paid'){
  const writes=[];const conn={execute:async(sql,args)=>{
   if(sql.includes('FROM fulfillment_cases')||sql.includes('FROM fulfillment_fittings'))return [[]];
   if(sql.includes('FROM order_items'))return [[{product_id:5,quantity:2,category:'device'}]];
   if(sql.includes('SELECT * FROM distribution_orders'))return [[{id:1,distributor_id:7,commission_amount:1000,status}]];
   if(sql.includes('COUNT(DISTINCT'))return [[{count:0}]];
   if(sql.startsWith('UPDATE ')||sql.startsWith('INSERT ')){writes.push({sql,args});return [{affectedRows:1}];}
   throw Error('Unexpected SQL '+sql);
  }};
  const rctx=vm.createContext({syncUserMembership:async()=>{},businessError:message=>Error(message)});
  vm.runInContext(refundSource.slice(refundSource.indexOf('function addressOf'),refundSource.indexOf('async function paymentTradeNo'))+refundSource.slice(refundSource.indexOf('async function settleRefund'),refundSource.indexOf('export async function registerOfflineRefund')),rctx);
  await rctx.settleRefund(conn,{id:9,user_id:3,order_no:'fixture',pay_amount:10000,shipping_address:{refund_from_status:fromStatus}},new Date(),'fixture');return writes;
 }
 await test('refund pending commission subtracts total but not available',async()=>{const w=await refundCase('pending');const a=w.find(x=>x.sql.includes('total_commission = total_commission -')).args;assert.equal(a[0],1000);assert.equal(a[1],0);assert.ok(w.some(x=>x.sql.includes("distribution_orders SET status = 'refunded'")));});
 await test('refund settled commission subtracts total and available',async()=>{const w=await refundCase('settled');const a=w.find(x=>x.sql.includes('total_commission = total_commission -')).args;assert.equal(a[0],1000);assert.equal(a[1],1000);});
 await test('refund undelivered unfitted goods restores stock',async()=>{const w=await refundCase('pending');assert.equal(w.find(x=>x.sql.includes('stock = stock +')).args[0],2);});
 await test('refund shipped goods does not automatically restore stock',async()=>{const w=await refundCase('pending','shipped');assert.equal(w.find(x=>x.sql.includes('stock = stock +')).args[0],0);});
 const ledger=read('hanjing-clinic-backend/distribution-ledger.js');const ctx=vm.createContext({query:async()=>[],transaction:async fn=>fn({})});vm.runInContext(ledger.replace(/^import .*;\r?\n/,'').replace(/export /g,''),ctx);
 await test('ledger excludes reserved and paid withdrawals',async()=>{let i=0;const conn={execute:async()=>[i++===0?[{total:1500,settled:1000,frozen:500}]:[{paid:200,reserved:300}]]};const r=await ctx.readCommissionLedger(conn,1,1);assert.equal(r.available,500);assert.equal(r.frozen,500);});
 await test('ledger debt remains visible after refund',async()=>{let i=0;const conn={execute:async()=>[i++===0?[{total:0,settled:0,frozen:0}]:[{paid:100,reserved:0}]]};assert.equal((await ctx.readCommissionLedger(conn,1,1)).available,-100);});
 await test('withdrawal masks encrypted account field',()=>{assert.equal(ctx.publicWithdrawAccount({accountNoEncrypted:'fixture',last4:'1234'}).accountNoEncrypted,undefined);});
 console.log(JSON.stringify({scope:'Actual source functions/pages with mocked SQL/wx/API; no external payments, SMS or business writes',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
