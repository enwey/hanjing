import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_visit_' + Date.now();
const env = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8', timeout: 15000 }))[0].Config.Env;
const password = env.find(s => s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password });
const results = [], steps = []; let db, server;
const check = async (name, action) => { await action(); results.push({ name, status: 'passed' }); console.log('PASS', name); };
try {
  await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database, NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(16).toString('hex') });
  db = await import('../../hanjing-clinic-backend/db.js'); await db.initDB();
  // Only the isolated administrator/security bootstrap is initialized with SQL.
  // Stores, doctors, patients, schedules, bookings and records below use actual APIs.
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)", [JSON.stringify({ type: 'system', all_stores: false, store_ids: [] })]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'clinical-notify','unused','隔离管理员',9000)");
  const helpers = await import('../../hanjing-clinic-backend/helpers.js');
  const token = jwt.sign({ id: 9000, role: 'super_admin', token_version: 0 }, helpers.JWT_SECRET);
  const app = express(); app.use(express.json()); app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const call = async (path, body, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json(); steps.push({ method, path, status: response.status });
    assert.equal(response.status, 200, JSON.stringify(json)); return json.data;
  };
  const store = await call('/api/admin/stores', { name: '通知测试门店', code: 'NTC', address: '隔离测试地址' });
  const doctor = await call('/api/admin/doctors', { name: '通知测试医生', title: '主任医师', specialty: '睡眠医学', store_ids: [store.id] });
  const patient = await call('/api/admin/patients', { name: '通知测试就诊人', phone: '13900001234', gender: '男', age: 40, store_id: store.id });
  const p = await db.get('SELECT * FROM patients WHERE id=?', [patient.id]);
  const date = (await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'%Y-%m-%d') day")).day;
  const schedulePayload = { doctor_id: doctor.id, store_id: store.id, date, period: 'morning', start_time: '09:00:00', end_time: '12:00:00', slot_interval_minutes: 30, people_per_slot: 5 };
  await call('/api/admin/schedules', schedulePayload);
  const booking = async (time = '09:00-09:30') => call('/api/admin/appointments', { patient_id: patient.id, store_id: store.id, doctor_id: doctor.id, date, time, type: 'first', consult_fee: 0, deposit_amount: 0 });
  const notice = async id => db.query("SELECT * FROM user_notifications WHERE business_type='appointment' AND business_id=? ORDER BY id", [id]);

  await check('正常签到保留签到时间，接诊和完成记录各自时间',async()=>{
    const a=await booking();const path='/api/admin/appointments/'+a.id;
    await call(path,{status:'confirmed'},'PUT');let row=await call(path,undefined,'GET');
    assert.equal(row.checkin_mode,'normal');assert.ok(row.checkin_at);const at=row.checkin_at;
    await call(path,{status:'checked_in'},'PUT');row=await call(path,undefined,'GET');assert.equal(row.checkin_mode,'normal');assert.equal(row.checkin_at,at);assert.ok(row.consultation_started_at);
    await call(path+'/complete-consultation',{medical_record:{diagnosis:'测试',doctor_advice:'测试',doctor_id:doctor.id,store_id:store.id}});row=await call(path,undefined,'GET');assert.equal(row.status,'completed');assert.ok(row.consultation_completed_at);
  });
  await check('未签到直接接诊仅记录已跳过，不生成签到时间',async()=>{
    const a=await booking();const path='/api/admin/appointments/'+a.id;
    await call(path,{status:'checked_in'},'PUT');let row=await call(path,undefined,'GET');
    assert.equal(row.checkin_mode,'skipped');assert.equal(row.checkin_at,null);assert.ok(row.consultation_started_at);
    await call(path,{status:'confirmed'},'PUT');await call(path,{status:'checked_in'},'PUT');await call(path,{status:'completed'},'PUT');
    row=await call(path,undefined,'GET');assert.equal(row.checkin_mode,'skipped');assert.equal(row.checkin_at,null);assert.ok(row.consultation_completed_at);
  });
  await check('未签到先叫号再接诊仍标记跳过签到',async()=>{
    const a=await booking();const path='/api/admin/appointments/'+a.id;
    await call(path,{status:'called'},'PUT');await call(path,{status:'checked_in'},'PUT');const row=await call(path,undefined,'GET');assert.equal(row.checkin_mode,'skipped');assert.equal(row.checkin_at,null);
  });
  await check('叫号后实际签到再接诊保留正常签到',async()=>{
    const a=await booking();const path='/api/admin/appointments/'+a.id;
    await call(path,{status:'called'},'PUT');await call(path,{status:'confirmed'},'PUT');await call(path,{status:'checked_in'},'PUT');const row=await call(path,undefined,'GET');assert.equal(row.checkin_mode,'normal');assert.ok(row.checkin_at);
  });

  await check('follow-up completion does not write appointment columns',async()=>{
    const task=await call('/api/admin/patients/'+patient.id+'/follow-ups',{follower_id:9000,title:'Timestamp audit',due_date:date});
    await call('/api/admin/patients/'+patient.id+'/follow-ups/records',{task_id:task.id,contact_type:'phone',summary:'Timestamp audit completed'});
    assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=?',[task.id])).status,'completed');
  });
  await check('offline order completion does not write appointment columns',async()=>{
    const product=await call('/api/admin/products',{name:'Timestamp audit service',category:'service',price:100,stock:10,status:'on'});
    const order=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:100,discount_amount:0,technician_id:9000});
    const id=order.order_id||order.id||order.orderId;
    await call('/api/admin/orders/'+id+'/complete',{});
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'completed');
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/appointment-visit-timeline/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
