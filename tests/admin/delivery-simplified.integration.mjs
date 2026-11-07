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
const database = 'hanjing_test_delivery_simple_' + Date.now();
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
  const a=await booking();await call('/api/admin/appointments/'+a.id,{status:'checked_in'},'PUT');await call('/api/admin/appointments/'+a.id+'/complete-consultation',{medical_record:{diagnosis:'设备交付测试',prescription:'阻鼾器治疗',doctor_advice:'按时复查',doctor_id:doctor.id,store_id:store.id}});
  const product=await call('/api/admin/products',{name:'复查测试设备',category:'device',price:7000,stock:100,status:'on'});
  const createCase=async(mold=true)=>{const o=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,appointment_id:a.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:7000,discount_amount:0,technician_id:9000});const c=await db.get('SELECT * FROM fulfillment_cases WHERE order_id=?',[o.order_id]);if(mold)await call('/api/admin/fulfillment/cases/'+c.id+'/mold',{complete:true,revision:0,details:{description:'取模完整。\n按处方制作。'}});return c};
  const c1=await createCase(),c2=await createCase(),c3=await createCase(),unready=await createCase(false);let batch;
  const status=id=>db.get('SELECT * FROM fulfillment_cases WHERE id=?',[id]);
  await check('汇总即生成待回货清单和资料快照，无需寄出或工厂制作',async()=>{batch=await call('/api/admin/fulfillment/batches',{factory_name:'隔离测试工厂',case_ids:[c1.id,c2.id,c3.id]});const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');assert.equal(d.status,'exported');assert.equal(d.sent_at,null);assert.equal(d.items.length,3);assert.ok(d.items.every(i=>i.status==='awaiting_return'&&i.snapshot.mold.description.includes('按处方')));assert.equal((await status(c1.id)).status,'awaiting_return')});
  await check('批量回货必须明确确认，混入未就绪设备整体回滚',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/receipts',{case_ids:[c1.id]}));await assert.rejects(()=>call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,unready.id],confirmed:true}));assert.equal((await status(c1.id)).status,'awaiting_return');assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_device_receipts')).n,0)});
  await check('多选回货和单件确认不要求编号位置，重复点击不重复登记',async()=>{await call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,c2.id],confirmed:true});await call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,c2.id],confirmed:true});await call('/api/admin/fulfillment/cases/'+c3.id+'/device-receipt',{confirmed:true});const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');assert.ok(d.items.every(i=>i.status==='returned'));assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_device_receipts')).n,3);assert.equal((await status(c1.id)).status,'device_received')});
  const fitting={device_product_id:product.id,initial_advancement:4.5,start_date:date,next_adjust_date:date,note:'患者确认试戴'};
  await check('确认试戴必须设置参数及下次时间，失败不提前绑定设备或创建售后',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',{...fitting,next_adjust_date:''}));await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',{...fitting,initial_advancement:99}));assert.equal((await db.get('SELECT COUNT(*) n FROM patient_devices')).n,0);assert.equal((await db.get('SELECT COUNT(*) n FROM after_sales_tickets')).n,0)});
  let fitted,ticket;
  await check('回货后直接确认试戴，参数与设备绑定一致，复查进入售后',async()=>{fitted=await call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',fitting);const device=await db.get('SELECT * FROM patient_devices WHERE id=?',[fitted.patient_device_id]);assert.equal(device.patient_id,patient.id);assert.equal(device.device_product_id,product.id);assert.equal(Number(device.initial_advancement),4.5);const list=await call('/api/admin/after-sales-tickets',undefined,'GET');ticket=list.find(t=>t.id===fitted.after_sales_ticket_id);assert.ok(ticket);assert.equal(ticket.patient_device_id,device.id);assert.equal(ticket.issue_type,'微调复查');assert.ok(String(ticket.next_service_date).includes(date));assert.equal(ticket.assigned_technician_id,9000);assert.ok(ticket.follow_up_task_id);assert.equal((await status(c1.id)).status,'fitted')});
  await check('重复确认试戴不会重复绑定、重复创建复查和售后',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',fitting));for(const table of ['patient_devices','after_sales_tickets','follow_up_tasks'])assert.equal((await db.get('SELECT COUNT(*) n FROM '+table)).n,1)});
  await check('售后处理复查并解决，同步结束对应随访安排',async()=>{await call('/api/admin/after-sales-tickets/'+ticket.id,{status:'processing',expected_status:'assigned',expected_technician_id:9000},'PUT');await call('/api/admin/after-sales-tickets/'+ticket.id,{status:'resolved',expected_status:'processing',expected_technician_id:9000,resolution:'已完成微调复查',adjusted_advancement:4.5,expected_advancement:4.5,needs_follow_up:false,next_adjust_date:null},'PUT');assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=?',[ticket.follow_up_task_id])).status,'completed')});
  await check('仅查看交付权限不能批量确认回货',async()=>{await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9003,'只读交付','delivery_read',?)",[JSON.stringify({type:'system',store_ids:[]})]);await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9003,'fulfillment:view')");await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9003,'read-delivery','unused','只读人员',9003)");const limited=jwt.sign({id:9003,role:'delivery_read',token_version:0},helpers.JWT_SECRET);const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/fulfillment/receipts',{method:'POST',headers:{Authorization:'Bearer '+limited,'Content-Type':'application/json'},body:JSON.stringify({case_ids:[c3.id],confirmed:true})});assert.equal(r.status,403)});
  await check('旧寄出和工厂制作接口已退出流程',async()=>{for(const path of ['/batches/'+batch.id+'/ship','/batches/'+batch.id+'/items/1/progress']){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/fulfillment'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert.ok([403,404].includes(r.status))}});
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/delivery-simplified/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, financialEvidence, databaseDropped: true, boundaries: '隔离库实际HTTP：患者、预约、诊疗病历、设备订单、取模、汇总、回货、确认试戴、售后复查；无公网支付与真实资金，临时库清理。' }, null, 2));
}
