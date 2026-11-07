import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

// This test process refuses all non-loopback requests except the explicitly mocked provider below.
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{const host=new URL(String(url)).hostname;if(!['127.0.0.1','localhost','[::1]'].includes(host))throw Error('测试禁止公网请求: '+host);return nativeFetch(url,options)};
const database = 'hanjing_test_mold_simple_' + Date.now();
const env = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8', timeout: 15000 }))[0].Config.Env;
const password = env.find(s => s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password });
const results = [], steps = [], financialEvidence = []; let db, server;
const check = async(name,action)=>{await action();financialEvidence.push({case:name,rows:await db.query('SELECT id,type,status,pay_amount,pay_at,collected_by_admin_id,collected_by_name,collection_source,refunded_by_admin_id,refunded_by_name,refund_requested_at,refund_at FROM orders')});results.push({name,status:'passed'});console.log('PASS',name)};
try {
  await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database, NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(16).toString('hex') });
  db = await import('../../hanjing-clinic-backend/db.js'); await db.initDB();
  // Only the isolated administrator/security bootstrap is initialized with SQL.
  // Stores, doctors, patients, schedules, bookings and records below use actual APIs.
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)", [JSON.stringify({ type: 'system', all_stores: false, store_ids: [] })]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'clinical-notify','unused','隔离管理员',9000)");
  const helpers = await import('../../hanjing-clinic-backend/helpers.js');
  let token = jwt.sign({ id: 9000, role: 'super_admin', token_version: 0 }, helpers.JWT_SECRET);
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
  const schedulePayload = { doctor_id: doctor.id, store_id: store.id, date, period: 'morning', start_time: '09:00:00', end_time: '12:00:00', slot_interval_minutes: 30, people_per_slot: 20 };
  await call('/api/admin/schedules', schedulePayload);
  const booking = async (time = '09:00-09:30') => call('/api/admin/appointments', { patient_id: patient.id, store_id: store.id, doctor_id: doctor.id, date, time, type: 'first', consult_fee: 0, deposit_amount: 0 });
  const product=await call('/api/admin/products',{name:'取模测试设备',category:'device',price:7000,stock:100,status:'on'});
  const o=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:7000,discount_amount:0,technician_id:9000});
  const c=await db.get('SELECT * FROM fulfillment_cases WHERE order_id=?',[o.order_id]);assert.ok(c);
  const path='/api/admin/fulfillment/cases/'+c.id+'/mold';
  const read=()=>call(path,undefined,'GET');
  const save=async(details,complete=true,revision)=>call(path,{details,complete,revision:revision??(await read()).profile?.revision??0});
  await check('单文本草稿可空，完成时拒绝空白和超长说明',async()=>{await save({description:''},false);await assert.rejects(()=>save({description:'   '}));await assert.rejects(()=>save({description:'字'.repeat(5001)}));assert.equal((await read()).profile.status,'draft')});
  const description='实体口模完整。\n制作要求：按医生处方制作，注意边缘打磨。';let first;
  await check('仅填写多行说明即可完成，自动编号及日期，进入待送厂',async()=>{await save({description});first=await read();assert.equal(first.profile.details.description,description);assert.ok(first.mold.mold_no);assert.match(first.profile.details.taken_date,/^\d{4}-\d{2}-\d{2}$/);const ready=await call('/api/admin/fulfillment/ready-molds',undefined,'GET');assert.ok(ready.some(r=>r.id===c.id&&r.details.description===description))});
  let batch;
  await check('生成批次并寄出，多行说明进入锁定制作清单',async()=>{batch=await call('/api/admin/fulfillment/batches',{factory_name:'隔离测试工厂',case_ids:[c.id]});await call('/api/admin/fulfillment/batches/'+batch.id+'/ship',{carrier:'测试快递',tracking_no:'TEST-ONLY',confirmed:true});const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');assert.equal(d.items[0].snapshot.mold.description,description);await assert.rejects(()=>save({description:'不能改已寄资料'}))});
  await check('重新取模保留说明，完成后生成新编号，旧批次快照不变',async()=>{const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');await call('/api/admin/fulfillment/batches/'+batch.id+'/items/'+d.items[0].id+'/progress',{action:'retake',feedback:'测试重取'});assert.equal((await read()).profile.details.description,description);await save({description:'重新取模：按最新处方制作。'});assert.notEqual((await read()).mold.mold_no,first.mold.mold_no);assert.equal((await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET')).items[0].snapshot.mold.description,description)});
  await check('历史结构化资料编辑为说明时保留参数和旧编号，过期版本拒绝覆盖',async()=>{const old={mold_no:'LEGACY-MOLD',storage_location:'A柜',taken_date:'2026-11-07',method:'实体口模',parameters:[{name:'测量值',value:'4',unit:'mm'}],wear_hours:8,wear_period:'夜间',requirements:'原制作要求',note:'旧备注',file_ids:[]};await save(old);const before=await read();await save({description:'取模说明已整理'});const after=await read();assert.equal(after.profile.details.storage_location,'A柜');assert.deepEqual(after.profile.details.parameters,old.parameters);assert.equal(after.mold.mold_no,'LEGACY-MOLD');await assert.rejects(()=>save({description:'过期修改'},true,before.profile.revision));});
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/mold-simple/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, financialEvidence, databaseDropped: true, boundaries: '隔离库；患者、设备、订单及交付前提通过实际API创建；取模、批次、寄出及重取均为实际HTTP接口；拒绝公网请求，无真实资金。' }, null, 2));
}
