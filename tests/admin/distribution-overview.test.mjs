import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../hanjing-clinic-backend/routes/admin.js',import.meta.url),'utf8');
const route=source.slice(source.indexOf("app.get('/api/admin/distribution/leaderboard'"),source.indexOf('// ----------------------------------------',source.indexOf("app.get('/api/admin/distribution/leaderboard'")));
async function request(rows){let handler,result;const user={id:88};vm.runInNewContext(route,{app:{get:(path,auth,fn)=>{handler=fn;}},authenticateToken(){},readScopedPromoters:async actor=>{assert.equal(actor,user);return rows;}});await handler({user},{json:body=>{result=JSON.parse(JSON.stringify(body));}});return result.data;}
test('leaderboard keeps invitations separate from zero orders after cleanup',async()=>{
 const [row]=await request([{id:1,total_orders:0,total_commission:0,invitees_l1_count:4,invitees_l2_count:3}]);assert.equal(row.total_orders,0);assert.equal(row.invites,7);
});
test('leaderboard returns real order count, top five and deterministic ties',async()=>{
 const data=await request([7,6,5,4,3,2,1].map(id=>({id,total_orders:String(id+10),total_commission:id===7?100:0,invitees_l1_count:1,invitees_l2_count:0})));
 assert.deepEqual(data.map(r=>r.id),[7,1,2,3,4]);assert.equal(data[0].total_orders,17);
});
test('empty scope gives no leaderboard entries',async()=>assert.deepEqual(await request([]),[]));
const overviewRoute=source.slice(source.indexOf("app.get('/api/admin/distribution/overview'"),source.indexOf("app.get('/api/admin/distribution/commissions'"));
test('period overview returns current values from the same scoped comparisons and rejects invalid ranges',async()=>{
 for(const range of ['today','week','month','invalid']) {
  let handler,result,status=200,calls=0;
  const user={id:88};
  vm.runInNewContext(overviewRoute,{app:{get:(path,auth,fn)=>handler=fn},authenticateToken(){},readDistributionTrends:async(actor,value)=>{
   calls++;assert.equal(actor,user);assert.equal(value,range);
   return {periodLabel:'本期',...Object.fromEntries(['totalCommission','activePromoters','promotedOrders','invitedUsers'].map((k,i)=>[k,{current:i+1,previous:10,percent:-90}]))};
  }});
  const res={status:code=>{status=code;return res},json:body=>result=body};
  await handler({user,query:{range}},res);
  if(range==='invalid'){assert.equal(status,400);assert.equal(calls,0)}
  else {assert.equal(status,200);assert.equal(calls,1);for(const key of ['totalCommission','activePromoters','promotedOrders','invitedUsers'])assert.equal(result.data[key],result.data.trends[key].current)}
 }
});
