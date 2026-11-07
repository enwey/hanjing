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
const database = 'hanjing_test_after_sales_' + Date.now();
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
  const createCase=async(mold=true,appointmentId=a.id)=>{const o=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,appointment_id:appointmentId,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:7000,discount_amount:0,technician_id:9000});const c=await db.get('SELECT * FROM fulfillment_cases WHERE order_id=?',[o.order_id]);if(mold)await call('/api/admin/fulfillment/cases/'+c.id+'/mold',{complete:true,revision:0,details:{description:'取模完整。\n按处方制作。'}});return c};
  const c1=await createCase(),c2=await createCase(),c3=await createCase(),unready=await createCase(false);let batch;
  const status=id=>db.get('SELECT * FROM fulfillment_cases WHERE id=?',[id]);
  await check('汇总即生成待回货清单和资料快照，无需寄出或工厂制作',async()=>{batch=await call('/api/admin/fulfillment/batches',{factory_name:'隔离测试工厂',case_ids:[c1.id,c2.id,c3.id]});const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');assert.equal(d.status,'exported');assert.equal(d.sent_at,null);assert.equal(d.items.length,3);assert.ok(d.items.every(i=>i.status==='awaiting_return'&&i.snapshot.mold.description.includes('按处方')));assert.equal((await status(c1.id)).status,'awaiting_return')});
  await check('批量回货必须明确确认，混入未就绪设备整体回滚',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/receipts',{case_ids:[c1.id]}));await assert.rejects(()=>call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,unready.id],confirmed:true}));assert.equal((await status(c1.id)).status,'awaiting_return');assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_device_receipts')).n,0)});
  await check('多选回货和单件确认不要求编号位置，重复点击不重复登记',async()=>{await call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,c2.id],confirmed:true});await call('/api/admin/fulfillment/receipts',{case_ids:[c1.id,c2.id],confirmed:true});await call('/api/admin/fulfillment/cases/'+c3.id+'/device-receipt',{confirmed:true});const d=await call('/api/admin/fulfillment/batches/'+batch.id,undefined,'GET');assert.ok(d.items.every(i=>i.status==='returned'));assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_device_receipts')).n,3);assert.equal((await status(c1.id)).status,'device_received')});
  const fitting={device_product_id:product.id,initial_advancement:4.5,start_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),next_adjust_date:date,note:'患者确认试戴'};
  await check('确认试戴必须设置参数及下次时间，失败不提前绑定设备或创建售后',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',{...fitting,next_adjust_date:''}));await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',{...fitting,initial_advancement:99}));assert.equal((await db.get('SELECT COUNT(*) n FROM patient_devices')).n,0);assert.equal((await db.get('SELECT COUNT(*) n FROM after_sales_tickets')).n,0)});
  let fitted,ticket;
  await check('回货后直接确认试戴，参数与设备绑定一致，复查进入售后',async()=>{fitted=await call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',fitting);const device=await db.get('SELECT * FROM patient_devices WHERE id=?',[fitted.patient_device_id]);assert.equal(device.patient_id,patient.id);assert.equal(device.device_product_id,product.id);assert.equal(Number(device.initial_advancement),4.5);const list=await call('/api/admin/after-sales-tickets',undefined,'GET');ticket=list.find(t=>t.id===fitted.after_sales_ticket_id);assert.ok(ticket);assert.equal(ticket.patient_device_id,device.id);assert.equal(ticket.issue_type,'微调复查');assert.ok(String(ticket.next_service_date).includes(date));assert.equal(ticket.assigned_technician_id,9000);assert.ok(ticket.follow_up_task_id);assert.equal((await status(c1.id)).status,'fitted')});
  await check('重复确认试戴不会重复绑定、重复创建复查和售后',async()=>{await assert.rejects(()=>call('/api/admin/fulfillment/cases/'+c1.id+'/fitting',fitting));for(const table of ['patient_devices','after_sales_tickets','follow_up_tasks'])assert.equal((await db.get('SELECT COUNT(*) n FROM '+table)).n,1)});
  const advance = (id,body) => call('/api/admin/after-sales-tickets/'+id,{expected_status:'processing',expected_technician_id:9000,...body},'PUT');
  await call('/api/admin/after-sales-tickets/'+ticket.id,{status:'processing',expected_status:'assigned',expected_technician_id:9000},'PUT');
  const resolvePayload={status:'resolved',resolution:'佩戴适应良好，调整前移量',adjusted_advancement:5.25,expected_advancement:4.5,needs_follow_up:true,next_adjust_date:date};
  await check('参数、复查选择及日期校验失败时事务无副作用',async()=>{
    for(const patch of [{adjusted_advancement:99},{adjusted_advancement:''},{adjusted_advancement:5.123},{needs_follow_up:null},{next_adjust_date:'2026-02-30'},{next_adjust_date:'2000-01-01'},{expected_advancement:3},{resolution:''}])await assert.rejects(()=>advance(ticket.id,{...resolvePayload,...patch}));
    assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,0);
    assert.equal((await db.get('SELECT COUNT(*) n FROM after_sales_tickets')).n,1);
    assert.equal((await db.get('SELECT status FROM after_sales_tickets WHERE id=?',[ticket.id])).status,'processing');
    assert.equal(Number((await db.get('SELECT current_advancement FROM patient_devices WHERE id=?',[fitted.patient_device_id])).current_advancement),4.5);
  });
  let nextTicket;
  await check('并发完成仅一次成功，本次记录、参数、下一次工单与随访原子保存',async()=>{
    const responses=await Promise.allSettled([advance(ticket.id,resolvePayload),advance(ticket.id,resolvePayload)]);
    assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);
    const result=responses.find(r=>r.status==='fulfilled').value;nextTicket=result.next_ticket_id;assert.ok(nextTicket);
    const old=await db.get('SELECT * FROM after_sales_tickets WHERE id=?',[ticket.id]);const snapshot=typeof old.adjustment_snapshot==='string'?JSON.parse(old.adjustment_snapshot):old.adjustment_snapshot;
    assert.equal(old.status,'resolved');assert.equal(snapshot.before_advancement,4.5);assert.equal(snapshot.adjusted_advancement,5.25);assert.equal(snapshot.next_ticket_id,nextTicket);assert.equal(snapshot.operator_name,'隔离管理员');
    const record=await db.get('SELECT * FROM device_adjustments WHERE id=?',[old.adjustment_id]);assert.equal(record.operator_id,null);assert.equal(record.operator_admin_id,9000);assert.equal(Number(record.adjusted_advancement),5.25);
    for(const table of ['patient_devices','treatment_records']){const row=await db.get("SELECT current_advancement,DATE_FORMAT(next_adjust_date,'%Y-%m-%d') next FROM "+table+' WHERE id=?',[table==='patient_devices'?fitted.patient_device_id:fitted.treatment_id]);assert.equal(Number(row.current_advancement),5.25);assert.equal(row.next,date)}
    const child=await db.get('SELECT * FROM after_sales_tickets WHERE id=?',[nextTicket]);assert.equal(child.parent_ticket_id,ticket.id);assert.equal(child.status,'assigned');assert.equal(child.assigned_technician_id,9000);assert.equal(child.patient_device_id,fitted.patient_device_id);
    assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=?',[ticket.follow_up_task_id])).status,'completed');
    assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=?',[child.follow_up_task_id])).status,'pending');
    assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,1);
  });
  await check('第二次微调可选择无需再复查，保留两次记录并清除下次日期',async()=>{
    await call('/api/admin/after-sales-tickets/'+nextTicket,{status:'processing',expected_status:'assigned',expected_technician_id:9000},'PUT');
    const result=await advance(nextTicket,{status:'resolved',resolution:'复查完成，无需再复查',adjusted_advancement:5.5,expected_advancement:5.25,needs_follow_up:false,next_adjust_date:null});assert.equal(result.next_ticket_id,null);
    assert.equal((await db.get('SELECT COUNT(*) n FROM after_sales_tickets')).n,2);assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,2);
    const d=await db.get('SELECT * FROM patient_devices WHERE id=?',[fitted.patient_device_id]);assert.equal(Number(d.current_advancement),5.5);assert.equal(d.next_adjust_date,null);
    assert.equal((await db.get('SELECT next_adjust_date FROM treatment_records WHERE id=?',[fitted.treatment_id])).next_adjust_date,null);
    assert.ok((await db.query('SELECT status FROM follow_up_tasks')).every(t=>t.status==='completed'));
    const history=await call('/api/admin/patients/'+patient.id+'/treatment',undefined,'GET');assert.equal(history.adjustments.length,2);assert.ok(history.adjustments.every(a=>a.operator_name==='隔离管理员'));
  });
  await check('已完成工单不能重复调整，归档不覆盖设备及历史复查安排',async()=>{
    await assert.rejects(()=>advance(ticket.id,resolvePayload));
    await call('/api/admin/after-sales-tickets/'+ticket.id,{status:'closed',expected_status:'resolved',expected_technician_id:9000},'PUT');
    assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,2);
    assert.equal(Number((await db.get('SELECT current_advancement FROM patient_devices WHERE id=?',[fitted.patient_device_id])).current_advancement),5.5);
  });
  await check('普通维修工单保持原处理方式',async()=>{const repair=await call('/api/admin/after-sales-tickets',{fulfillment_case_id:c1.id,issue_type:'设备维修',description:'检查设备',assigned_technician_id:9000});await call('/api/admin/after-sales-tickets/'+repair.id,{status:'processing',expected_status:'assigned',expected_technician_id:9000},'PUT');await advance(repair.id,{status:'resolved',resolution:'已完成检查'});assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,2)});
  await check('设备更换后旧工单不能修改新设备参数',async()=>{
    const oldTicket=await call('/api/admin/after-sales-tickets',{fulfillment_case_id:c1.id,patient_device_id:fitted.patient_device_id,issue_type:'微调复查',description:'旧设备复查',assigned_technician_id:9000});
    await call('/api/admin/after-sales-tickets/'+oldTicket.id,{status:'processing',expected_status:'assigned',expected_technician_id:9000},'PUT');
    const a2=await booking('10:00-10:30');await call('/api/admin/appointments/'+a2.id,{status:'checked_in'},'PUT');await call('/api/admin/appointments/'+a2.id+'/complete-consultation',{medical_record:{diagnosis:'更换设备复诊',prescription:'新设备',doctor_id:doctor.id,store_id:store.id}});
    const c4=await createCase(true,a2.id);await call('/api/admin/fulfillment/batches',{factory_name:'隔离测试工厂',case_ids:[c4.id]});await call('/api/admin/fulfillment/receipts',{case_ids:[c4.id],confirmed:true});
    const replacement=await call('/api/admin/fulfillment/cases/'+c4.id+'/fitting',fitting);
    await assert.rejects(()=>advance(oldTicket.id,{...resolvePayload,expected_advancement:5.5}));
    assert.equal(Number((await db.get('SELECT current_advancement FROM patient_devices WHERE id=?',[replacement.patient_device_id])).current_advancement),4.5);
    assert.equal((await db.get('SELECT status FROM after_sales_tickets WHERE id=?',[oldTicket.id])).status,'processing');
    assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments')).n,2);
  });
  await check('仅查看交付权限不能批量确认回货',async()=>{await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9003,'只读交付','delivery_read',?)",[JSON.stringify({type:'system',store_ids:[]})]);await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9003,'fulfillment:view')");await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9003,'read-delivery','unused','只读人员',9003)");const limited=jwt.sign({id:9003,role:'delivery_read',token_version:0},helpers.JWT_SECRET);const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/fulfillment/receipts',{method:'POST',headers:{Authorization:'Bearer '+limited,'Content-Type':'application/json'},body:JSON.stringify({case_ids:[c3.id],confirmed:true})});assert.equal(r.status,403)});
  await check('只有查看售后权限不能完成微调',async()=>{
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9003,'after_sales:view')");
    const limited=jwt.sign({id:9003,role:'delivery_read',token_version:0},helpers.JWT_SECRET);
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/after-sales-tickets/'+ticket.id,{method:'PUT',headers:{Authorization:'Bearer '+limited,'Content-Type':'application/json'},body:JSON.stringify(resolvePayload)});assert.equal(r.status,403);
  });
  await check('个人数据范围的受派技师可完成复查，其他技师不能操作',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9004,'售后技师','after_sales_tech',?)",[JSON.stringify({type:'self',store_ids:[]})]);
    for(const permission of ['after_sales:view','after_sales:edit'])await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9004,?)",[permission]);
    for(const id of [9004,9005])await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(?,?,'unused',?,9004)",[id,'tech-'+id,'售后技师'+id]);
    const current=await db.get("SELECT * FROM after_sales_tickets WHERE status='assigned' ORDER BY id DESC LIMIT 1");
    await call('/api/admin/after-sales-tickets/'+current.id,{status:'assigned',expected_status:'assigned',expected_technician_id:9000,assigned_technician_id:9004},'PUT');
    const superToken=token;token=jwt.sign({id:9005,role:'after_sales_tech',token_version:0},helpers.JWT_SECRET);
    await assert.rejects(()=>call('/api/admin/after-sales-tickets/'+current.id,{status:'processing',expected_status:'assigned',expected_technician_id:9004},'PUT'));
    token=jwt.sign({id:9004,role:'after_sales_tech',token_version:0},helpers.JWT_SECRET);
    await call('/api/admin/after-sales-tickets/'+current.id,{status:'processing',expected_status:'assigned',expected_technician_id:9004},'PUT');
    const result=await call('/api/admin/after-sales-tickets/'+current.id,{...resolvePayload,expected_status:'processing',expected_technician_id:9004},'PUT');assert.ok(result.next_ticket_id);
    assert.equal((await db.get('SELECT assigned_technician_id FROM after_sales_tickets WHERE id=?',[result.next_ticket_id])).assigned_technician_id,9004);token=superToken;
  });
  await check('旧寄出和工厂制作接口已退出流程',async()=>{for(const path of ['/batches/'+batch.id+'/ship','/batches/'+batch.id+'/items/1/progress']){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/fulfillment'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert.ok([403,404].includes(r.status))}});
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/after-sales-adjustment/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, financialEvidence, databaseDropped: true, boundaries: '隔离库实际HTTP：患者、预约、诊疗病历、设备订单、取模、汇总、回货、确认试戴、售后复查；无公网支付与真实资金，临时库清理。' }, null, 2));
}
