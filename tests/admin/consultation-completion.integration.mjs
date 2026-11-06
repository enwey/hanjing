import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_complete_' + Date.now();
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
  const first = await booking();
  const path='/api/admin/appointments/'+first.id;
  const payload={medical_record:{diagnosis:'验证诊断',doctor_advice:'验证医嘱',doctor_id:doctor.id,store_id:store.id}};
  await call(path,{status:'checked_in'},'PUT');
  await check('仅保存病历仍在接诊中',async()=>{await call(path+'/save-consultation',payload);assert.equal((await call(path,undefined,'GET')).status,'checked_in')});
  await check('结束看诊保存病历并进入完成终态，不产生收费订单',async()=>{
    const before=await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[first.id]);
    const result=await call(path+'/complete-consultation',payload);assert.ok(result.medicalRecordId);
    assert.equal((await call(path,undefined,'GET')).status,'completed');assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[first.id])).n,before.n);
  });
  await check('已完成筛选与计数包含刚结束的预约',async()=>{
    const result=await call('/api/admin/appointments?page=1&pageSize=30&status=completed',undefined,'GET');assert.equal(result.total,1);assert.equal(result.counts.completed,1);assert.equal(String(result.list[0].id),String(first.id));
  });
  await check('完成后不能重新接诊',async()=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({status:'checked_in'})});assert.equal(r.status,409);
  });
  let extraOrder;
  await check('额外收费创建独立订单且不改变已完成预约',async()=>{
    const product=await call('/api/admin/products',{name:'验证服务',category:'service',price:100,stock:10,status:'on'});
    extraOrder=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,appointment_id:first.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:100,discount_amount:0,technician_id:9000});
    assert.equal((await call(path,undefined,'GET')).status,'completed');
    const result=await call('/api/admin/appointments?page=1&pageSize=30&status=completed',undefined,'GET');assert.equal(result.total,1);assert.equal(result.counts.completed,1);
  });
  await check('旧前端结算请求不能再将完成预约改为arrived',async()=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({status:'arrived'})});assert.equal(r.status,409);assert.equal((await call(path,undefined,'GET')).status,'completed');
  });
  await check('额外订单退款不改变已完成预约',async()=>{
    const orderId=extraOrder.order_id||extraOrder.id||extraOrder.orderId;
    assert.ok(orderId,JSON.stringify(extraOrder));
    await call(`/api/admin/orders/${orderId}/offline-refund`,{amount:100,method:'cash',confirmed:true,reference:'TEST-REFUND',refunded_at:new Date().toISOString()});
    assert.equal((await call(path,undefined,'GET')).status,'completed');assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[orderId])).status,'refunded');
  });
  let second, secondOrder;
  await check('就诊中额外收费仍保持就诊中',async()=>{
    second=await booking('10:00-10:30');await call('/api/admin/appointments/'+second.id,{status:'checked_in'},'PUT');
    const product=await call('/api/admin/products',{name:'接诊中额外服务',category:'service',price:100,stock:10,status:'on'});
    secondOrder=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,appointment_id:second.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:100,discount_amount:0,technician_id:9000});
    assert.equal((await call('/api/admin/appointments/'+second.id,undefined,'GET')).status,'checked_in');
  });

  await check('不支持的部分退款被拒绝且不改变预约或订单',async()=>{
    const id=secondOrder.order_id||secondOrder.id||secondOrder.orderId;
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/${id}/offline-refund`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({amount:40,method:'cash',confirmed:true,reference:'TEST-PARTIAL',refunded_at:new Date().toISOString()})});
    assert.equal(r.status,400);assert.match((await r.json()).message,/仅支持全额退款/);
    assert.equal((await call('/api/admin/appointments/'+second.id,undefined,'GET')).status,'checked_in');
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'paid');
  });
  await check('就诊中全额退款仍保持就诊中',async()=>{
    const id=secondOrder.order_id||secondOrder.id||secondOrder.orderId;
    await call(`/api/admin/orders/${id}/offline-refund`,{amount:100,method:'cash',confirmed:true,reference:'TEST-ACTIVE-REFUND',refunded_at:new Date().toISOString()});
    assert.equal((await call('/api/admin/appointments/'+second.id,undefined,'GET')).status,'checked_in');
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'refunded');
  });
  await check('额外费用已退款仍可从列表结束诊疗进入已完成',async()=>{
    await call('/api/admin/appointments/'+second.id,{status:'completed'},'PUT');
    assert.equal((await call('/api/admin/appointments/'+second.id,undefined,'GET')).status,'completed');
  });
  await check('重复完成操作不会重开预约或新增收费',async()=>{
    const before=await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[second.id]);
    await call('/api/admin/appointments/'+second.id,{status:'completed'},'PUT');
    assert.equal((await call('/api/admin/appointments/'+second.id,undefined,'GET')).status,'completed');
    assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[second.id])).n,before.n);
  });

} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/appointment-cashier-separation/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
