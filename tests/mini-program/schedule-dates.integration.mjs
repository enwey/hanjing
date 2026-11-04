import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
const source=readFileSync(new URL('../../hanjing-clinic-backend/routes/client.js',import.meta.url),'utf8');
const start=source.indexOf("app.get('/api/v1/schedules/dates'");
const route=source.slice(start,source.indexOf('// 11. Schedules',start));
const slots=source.slice(source.indexOf('function buildScheduleSlots('),source.indexOf('function getSlotStatusPriority('));
test('schedule date selection with real SQL and fixed Shanghai clock',async t=>{
 const db=await mysql.createConnection({host:'127.0.0.1',user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root',dateStrings:true});
 const schema='hanjing_test_schedule_dates_'+Date.now();
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE doctor_schedules(id INT PRIMARY KEY,doctor_id INT,store_id INT,date DATE,status VARCHAR(30),start_time TIME,end_time TIME,people_per_slot INT,slot_interval_minutes INT)');
  await db.query('CREATE TABLE appointments(schedule_id INT,appointment_time VARCHAR(30),status VARCHAR(30))');
  let handler;
  vm.runInNewContext(slots+route,{app:{get:(_path,fn)=>handler=fn},getBookingDateWindow:async()=>({today:{getHours:()=>10,getMinutes:()=>30},todayStr:'2026-11-05',maxDateStr:'2026-11-12'}),getBookingIntervalMinutes:async()=>30,formatDate:s=>s,APPOINTMENT_SLOT_STATUSES_SQL:"'pending_payment','pending','confirmed','checked_in','called','in_progress','completed'",query:async(sql,params)=>(await db.query(sql,params))[0]});
  async function read(query={doctorId:'1',storeId:'1'}){let status=200,body;const res={status:s=>{status=s;return res},json:b=>body=b};await handler({query},res);return {status,body:JSON.parse(JSON.stringify(body))};}
  await t.test('missing parameters return 400',async()=>assert.equal((await read({})).status,400));
  await t.test('no schedules returns empty list',async()=>{const r=await read();assert.equal(r.status,200);assert.deepEqual(r.body.data,[])});
  await db.query("INSERT INTO doctor_schedules VALUES(1,1,1,'2026-11-06','available','09:00','10:00',1,30),(2,1,1,'2026-11-05','available','09:00','10:30',1,30),(3,1,1,'2026-11-13','available','09:00','10:00',1,30),(4,2,1,'2026-11-07','available','09:00','10:00',1,30),(5,1,2,'2026-11-08','available','09:00','10:00',1,30),(6,1,1,'2026-11-09','unavailable','09:00','10:00',1,30)");
  await t.test('existing future schedules succeed; expired, other doctor/store, disabled and outside-window schedules excluded',async()=>{const r=await read();assert.equal(r.status,200);assert.deepEqual(r.body.data,['2026-11-06'])});
  await db.query("INSERT INTO doctor_schedules VALUES(7,1,1,'2026-11-05','available','11:00','11:30',1,30)");
  await t.test('today with remaining slots is included once',async()=>{const r=await read();assert.equal(r.status,200);assert.deepEqual(r.body.data,['2026-11-05','2026-11-06'])});
  await db.query("INSERT INTO appointments VALUES(1,'09:00-09:30','confirmed'),(1,'09:30-10:00','pending_payment'),(7,'11:00-11:30','cancelled')");
  await t.test('fully booked date excluded, cancelled appointment does not consume slot',async()=>{const r=await read();assert.equal(r.status,200);assert.deepEqual(r.body.data,['2026-11-05'])});
 }finally{await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
});
