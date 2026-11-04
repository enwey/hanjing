import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
const source=readFileSync(new URL('../../hanjing-clinic-backend/routes/admin.js',import.meta.url),'utf8');
const start=source.indexOf("app.get('/api/admin/appointments/:id/pre-exam'");
const route=source.slice(start,source.indexOf('// Bind distributor to patient',start));
test('pre-exam read with real SQL and scope checks',async t=>{
 const db=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD||'root'});
 const schema='hanjing_test_pre_exam_'+Date.now();
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query('CREATE TABLE appointments(id INT PRIMARY KEY,doctor_id INT,store_id INT,patient_id INT,appointment_date DATE)');
  await db.query('CREATE TABLE appointment_pre_exams(id INT PRIMARY KEY,appointment_id INT,height INT)');
  await db.query("INSERT INTO appointments VALUES(1,1,1,10,'2026-11-01'),(2,1,1,10,'2026-11-05'),(3,1,1,11,'2026-11-05'),(4,2,2,12,'2026-11-05')");
  await db.query('INSERT INTO appointment_pre_exams VALUES(1,1,175),(2,4,180)');
  let handler;
  vm.runInNewContext(route,{app:{get:(path,auth,fn)=>handler=fn},authenticateToken(){},appointmentReadScope:user=>({sql:'a.store_id=?',params:[user.store]}),get:async(sql,params)=>(await db.execute(sql,params))[0][0],console:{error(){}}});
  async function read(id,store=1){let status=200,body;const res={status:code=>{status=code;return res},json:data=>body=data};await handler({params:{id:String(id)},user:{store}},res);return {status,body}}
  await t.test('existing appointment returns its saved vitals',async()=>{const r=await read(1);assert.equal(r.status,200);assert.equal(r.body.data.height,175)});
  await t.test('missing current vitals falls back to same patient history',async()=>{const r=await read(2);assert.equal(r.status,200);assert.equal(r.body.data.appointment_id,1)});
  await t.test('no vitals returns success without invented data',async()=>{const r=await read(3);assert.equal(r.status,200);assert.equal(r.body.data,undefined)});
  await t.test('out of scope appointment is rejected',async()=>assert.equal((await read(4)).status,404));
  await t.test('missing appointment is rejected',async()=>assert.equal((await read(999)).status,404));
 } finally {await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end()}
});
