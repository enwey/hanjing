const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),results=[];
function loadHelper(file,exports){const src=read(file),box={require,__dirname:path.dirname(path.join(root,file)),module:{exports:{}},setImmediate};vm.runInNewContext(src.slice(0,src.indexOf('(async()=>{'))+'\nmodule.exports={'+exports+'};',box);return box.module.exports;}
const {backend}=loadHelper('tests/mini-program/promoter-binding.cjs','backend');
const {create}=loadHelper('tests/mini-program/mall-order.cjs','create');
const names={1:'A',2:'B',3:'C',4:'D',5:'E'};
const product=(price=10000,r1=10,r2=5,on=1,quantity=1)=>({price,quantity,is_distribution_snapshot:on,commission_rate_level1_snapshot:r1,commission_rate_level2_snapshot:r2});
async function chain(late=false){const h=backend({promoters:Object.entries(names).map(([id,code])=>({user_id:Number(id),code,status:'active'}))});for(const [code,id]of [['A',2],['B',3],['C',4],...(late?[['E',1]]:[])]){const r=await h.call(code,id);assert.equal(r.http,200);assert.equal(r.body.data.status,'bound');}return h;}
async function accrue(rows,buyer,items=[product()],enabled=true,paid=items.reduce((s,i)=>s+i.price*i.quantity,0)){
 const entries=[];const src=read('hanjing-clinic-backend/routes/client.js'),a=src.indexOf('export async function createPendingDistributionCommission'),b=src.indexOf('export async function cancelPendingProductOrder',a);
 const ctx=vm.createContext({maskPhone:()=>'',refreshDistributorLevel:async()=>{},getDistributionFeatureConfig:async()=>({enableDistribution:enabled})});vm.runInContext(src.slice(a,b).replace('export ',''),ctx);
 const conn={execute:async(sql,args)=>{
  if(sql.includes('FROM distribution_relationships')){
   if(sql.includes('upper_edge')){const direct=rows.find(r=>r.child===args[0]&&r.level===1);const upper=direct&&rows.find(r=>r.child===direct.parent&&r.level===1);return [[...(direct?[{parent_user_id:direct.parent,level:1}]:[]),...(upper?[{parent_user_id:upper.parent,level:2}]:[])]];}
   return [rows.filter(r=>r.child===args[0]).map(r=>({parent_user_id:r.parent,level:r.level}))];
  }
  if(sql.includes('FROM users'))return [[{nickname:names[args[0]]}]];
  if(sql.includes('FROM distributors'))return [[{id:args[0],level:'silver'}]];
  if(sql.includes('FROM order_items'))return [items];
  if(sql.startsWith('SELECT id FROM distribution_orders'))return [[]];
  if(sql.includes('INSERT INTO distribution_orders')){entries.push({recipient:names[args[1]],level:sql.includes("1, 'pending'")?1:2,amount:args[4]});return [{insertId:entries.length}];}
  if(sql.includes('UPDATE distributors'))return [{affectedRows:1}];
  throw Error('Unexpected SQL '+sql);
 }};await ctx.createPendingDistributionCommission(conn,{id:100+buyer,pay_amount:paid},buyer);return entries;
}
async function test(name,fn){try{const actual=await fn();results.push({name,status:'PASS',actual});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function expect(actual,expected){assert.equal(JSON.stringify(actual),JSON.stringify(expected));return actual;}
const entry=(recipient,level,amount)=>({recipient,level,amount});
(async()=>{
 const before=await chain(),after=await chain(true);
 await test('legacy missing level-two cache still earns current second-level commission',async()=>expect(await accrue(after.rows.filter(r=>!(r.child===2&&r.level===2)),2),[entry('A',1,1000),entry('E',2,500)]));
 for(const [buyer,expected] of [[1,[]],[2,[entry('A',1,1000)]],[3,[entry('B',1,1000),entry('A',2,500)]],[4,[entry('C',1,1000),entry('B',2,500)]]])await test('original chain buyer '+names[buyer],async()=>expect(await accrue(before.rows,buyer),expected));
 for(const [buyer,expected] of [[2,[entry('A',1,1000),entry('E',2,500)]],[3,[entry('B',1,1000),entry('A',2,500)]],[4,[entry('C',1,1000),entry('B',2,500)]]])await test('after A binds E buyer '+names[buyer],async()=>expect(await accrue(after.rows,buyer),expected));
 await test('BIND-RISK-01 E becomes B second parent',()=>{const actual=after.rows.filter(r=>r.child===2).map(r=>({parent:names[r.parent],level:r.level}));return expect(actual,[{parent:'A',level:1},{parent:'E',level:2}]);});
 for(const [name,items,enabled,paid,expected]of [
  ['product X 10%/5%',[product()],true,10000,[entry('B',1,1000),entry('A',2,500)]],
  ['product Y 20%/8%',[product(20000,20,8)],true,20000,[entry('B',1,4000),entry('A',2,1600)]],
  ['mixed X and Y',[product(),product(20000,20,8)],true,30000,[entry('B',1,5000),entry('A',2,2100)]],
  ['mixed X enabled Y disabled',[product(),product(20000,20,8,0)],true,30000,[entry('B',1,1000),entry('A',2,500)]],
  ['product disabled',[product(10000,10,5,0)],true,10000,[]],
  ['global disabled',[product()],false,10000,[]],
  ['both disabled',[product(10000,10,5,0)],false,10000,[]],
  ['level one zero',[product(10000,0,5)],true,10000,[entry('A',2,500)]],
  ['level two zero',[product(10000,10,0)],true,10000,[entry('B',1,1000)]],
  ['both rates zero',[product(10000,0,0)],true,10000,[]],
  ['quantity three',[product(10000,10,5,1,3)],true,30000,[entry('B',1,3000),entry('A',2,1500)]],
  ['half paid mixed items',[product(),product(20000,20,8)],true,15000,[entry('B',1,2500),entry('A',2,1050)]],
  ['unpaid',[product()],true,0,[]]
 ])await test(name,async()=>expect(await accrue(after.rows,3,items,enabled,paid),expected));
 for(const enabled of [0,1])await test('create order preserves per-product settings enabled='+enabled,async()=>{
  const h=await create({items:[{productId:1,quantity:2}],shippingAddress:{contactName:'fixture',phone:'13800138001',detailAddress:'fixture'}},{id:1,name:'X',price:10000,stock:10,status:'on',is_distribution:enabled,commission_rate:99,commission_rate_level1:12,commission_rate_level2:3});
  assert.equal(h.res.statusCode,200);const args=h.writes.find(x=>x.sql.includes('INSERT INTO order_items')).args;const actual=Array.from(args.slice(6));assert.deepEqual(actual,[enabled,12,12,3]);return actual;
 });
 console.log(JSON.stringify({scope:'Actual binding route -> resulting mocked relationships -> actual commission generator; actual create route snapshot check; no real DB/payments',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,relationships:{before:before.rows,after:after.rows},results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
