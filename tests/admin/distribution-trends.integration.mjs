import {test} from 'node:test';
import assert from 'node:assert/strict';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';

test('distribution growth uses scoped records and complete Shanghai days', {timeout:120000},async t=>{
 const schema='hanjing_test_trends_'+Date.now();let db;
 const conn=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD||'root'});
 try {
  await conn.query(`CREATE DATABASE ${schema}`);await conn.query(`USE ${schema}`);await conn.query("SET time_zone='+08:00'");
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root',DB_NAME:schema});
  db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
  const {comparePeriods,readDistributionTrends,distributionPeriod}=await import('../../hanjing-clinic-backend/distribution-trends.js');
  await t.test('percentage handles increase, decrease, flat and zero denominator',()=>{
   assert.equal(comparePeriods(300,100).percent,200);assert.equal(comparePeriods(50,100).percent,-50);assert.equal(comparePeriods(0,100).percent,-100);assert.equal(comparePeriods(0,0).percent,0);assert.equal(comparePeriods(1,0).percent,100);assert.equal(comparePeriods(4,3).percent,33.3);
  });
  await conn.query("INSERT INTO users(id,openid,nickname) VALUES(1,'trend-1','One'),(2,'trend-2','Two'),(3,'trend-3','Three')");
  await conn.query("INSERT INTO distributors(id,user_id,nickname,invite_code) VALUES(1,1,'One','TREND')");
  await conn.query("INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount) VALUES(1,'TREND1',2,100,100),(2,'TREND2',3,100,100)");
  for(const [order,amount,days,status] of [[1,100,30,'settled'],[1,200,1,'settled'],[2,100,60,'settled'],[2,999,0,'settled'],[2,999,61,'settled'],[2,999,1,'refunded']]){
   await conn.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,status,created_at) VALUES(?,1,'Fixture',100,?,?,DATE_SUB(CURDATE(),INTERVAL ? DAY))",[order,amount,status,days]);
  }
  await conn.query("INSERT INTO distribution_relationships(parent_user_id,child_user_id,level,created_at) VALUES(1,2,1,DATE_SUB(CURDATE(),INTERVAL 30 DAY)),(1,3,1,DATE_SUB(CURDATE(),INTERVAL 60 DAY))");
  const all={effective_data_scope:{type:'system'}};
  await t.test('date boundaries, refunded exclusion, distinct orders and active invitations',async()=>{
   const r=await readDistributionTrends(all);assert.deepEqual(r.totalCommission,{current:300,previous:100,percent:200});assert.deepEqual(r.promotedOrders,{current:1,previous:1,percent:0});assert.deepEqual(r.invitedUsers,{current:1,previous:1,percent:0});assert.deepEqual(r.activePromoters,{current:1,previous:1,percent:0});
  });
  await t.test('unrelated staff cannot see other scopes in trends',async()=>{
   const r=await readDistributionTrends({id:999,effective_data_scope:{type:'self'}});for(const k of ['totalCommission','promotedOrders','invitedUsers','activePromoters'])assert.deepEqual(r[k],{current:0,previous:0,percent:0});
  });
  await t.test('currently disabled promoters are excluded from period activity',async()=>{
   await conn.query("UPDATE distributors SET status='inactive' WHERE id=1");const r=await readDistributionTrends(all);assert.equal(r.activePromoters.current,0);assert.equal(r.activePromoters.previous,0);assert.equal(r.invitedUsers.current,1);
  });

  await t.test('calendar boundaries include year rollover, Monday and leap month',()=>{
   assert.deepEqual(distributionPeriod('2026-01-01','today'),{periodStart:'2026-01-01',periodEnd:'2026-01-02',previousStart:'2025-12-31',periodLabel:'今日'});
   assert.deepEqual(distributionPeriod('2026-01-01','week'),{periodStart:'2025-12-29',periodEnd:'2026-01-05',previousStart:'2025-12-22',periodLabel:'本周'});
   assert.deepEqual(distributionPeriod('2024-03-15','month'),{periodStart:'2024-03-01',periodEnd:'2024-04-01',previousStart:'2024-02-01',periodLabel:'本月'});
   assert.throws(()=>distributionPeriod('2026-01-01','invalid'));
  });
  for(const range of ['today','week','month']) await t.test(`${range}: exact period boundaries, distinct orders, invitations and scope`,async()=>{
   const [[{today}]]=await conn.query("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') AS today");
   const b=distributionPeriod(today,range);
   await conn.query('DELETE FROM distribution_orders');
   await conn.query('DELETE FROM distribution_relationships');
   await conn.query("UPDATE distributors SET status='active' WHERE id=1");
   for(const [order,amount,date,status] of [[1,100,b.previousStart,'settled'],[1,200,b.periodStart,'settled'],[1,100,b.periodStart,'settled'],[2,999,b.periodEnd,'settled'],[2,999,b.periodStart,'refunded']]){
    await conn.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,status,created_at) VALUES(?,1,'Fixture',100,?,?,?)",[order,amount,status,date]);
   }
   await conn.query("INSERT INTO distribution_relationships(parent_user_id,child_user_id,level,created_at) VALUES(1,2,1,?),(1,3,1,?)",[b.periodStart,b.previousStart]);
   const r=await readDistributionTrends(all,range);
   assert.equal(r.periodLabel,b.periodLabel);
   assert.deepEqual(r.totalCommission,{current:300,previous:100,percent:200});
   for(const key of ['promotedOrders','invitedUsers','activePromoters'])assert.deepEqual(r[key],{current:1,previous:1,percent:0});
   const hidden=await readDistributionTrends({id:999,effective_data_scope:{type:'self'}},range);
   for(const key of ['totalCommission','promotedOrders','invitedUsers','activePromoters'])assert.equal(hidden[key].current,0);
  });
 }finally{await db?.closePool();await conn.query(`DROP DATABASE ${schema}`);await conn.end();}
});
