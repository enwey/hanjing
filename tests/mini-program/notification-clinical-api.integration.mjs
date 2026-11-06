import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_notify_clinical_' + Date.now();
const env = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8' }))[0].Config.Env;
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
  await check('实际签到/候诊/叫号/接诊入口通知为中文且标识患者', async () => {
    for (const status of ['confirmed', 'waiting', 'called', 'checked_in']) await call('/api/admin/appointments/' + first.id, { status }, 'PUT');
    const rows = (await notice(first.id)).filter(n => n.event_code === 'status');
    assert.equal(rows.length, 4); assert.ok(rows.every(n => n.content.includes('通知测试就诊人')));
    assert.ok(rows.every(n => !/checked_in|waiting|called/.test(n.content)));
    assert.ok(rows.some(n => n.title === '就诊叫号提醒' && n.content.includes('诊室')));
  });
  await check('重复提交同一接诊状态不重复通知', async () => {
    const before = (await notice(first.id)).length; await call('/api/admin/appointments/' + first.id, { status: 'checked_in' }, 'PUT'); assert.equal((await notice(first.id)).length, before);
  });
  await check('完成接诊通知直接关联本次病历且不额外重复病历更新', async () => {
    const result = await call('/api/admin/appointments/' + first.id + '/complete-consultation', { medical_record: { diagnosis: '隔离验证诊断', doctor_advice: '隔离验证医嘱', doctor_id: doctor.id, store_id: store.id } });
    const rows = await db.query("SELECT * FROM user_notifications WHERE business_type='medical' AND business_id=?", [result.medicalRecordId]);
    assert.equal(rows.length, 1); assert.equal(rows[0].event_code, 'consultation_completed'); assert.equal(Number(rows[0].user_id), Number(p.user_id));
  });
  const second = await booking('09:30-10:00');
  await check('病历创建并完成预约入口与完成接诊通知一致', async () => {
    await call('/api/admin/patients/' + patient.id + '/medical-records', { appointment_id: second.id, doctor_id: doctor.id, store_id: store.id, visit_date: date, diagnosis: '另一入口诊断' });
    const record = await db.get('SELECT id FROM medical_records WHERE appointment_id=?', [second.id]);
    const row = await db.get("SELECT * FROM user_notifications WHERE business_type='medical' AND business_id=?", [record.id]);
    assert.equal(row.event_code, 'consultation_completed'); assert.match(row.content, /本次病历/);
  });
  const third = await booking('10:00-10:30');
  await check('单日设休通知现有预约但不取消或退款，重复设休不重复发送', async () => {
    await call('/api/admin/schedules', { doctor_id: doctor.id, date, period: 'morning', is_rest: true });
    await call('/api/admin/schedules', { doctor_id: doctor.id, date, period: 'morning', is_rest: true });
    const rows = (await notice(third.id)).filter(n => n.event_code === 'schedule_impact'); assert.equal(rows.length, 1); assert.match(rows[0].content, /尚未自动取消/);
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=?', [third.id])).status, 'pending');
    assert.equal((await notice(first.id)).filter(n => n.event_code === 'schedule_impact').length, 0);
  });
  await call('/api/admin/schedules', schedulePayload); const fourth = await booking('11:00-11:30');
  await check('批量排班缩短时间通知受影响预约', async () => {
    await call('/api/admin/schedules/batch', { doctor_id: doctor.id, list: [{ ...schedulePayload, end_time: '11:00:00' }] });
    assert.equal((await notice(fourth.id)).filter(n => n.event_code === 'schedule_impact').length, 1);
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=?', [fourth.id])).status, 'pending');
  });
  const fifth = await booking('09:00-09:30');
  await check('只调整时段容量不误发停诊通知', async () => {
    await call('/api/admin/schedules/batch', { doctor_id: doctor.id, list: [{ ...schedulePayload, end_time: '11:00:00', people_per_slot: 10 }] });
    assert.equal((await notice(fifth.id)).filter(n => n.event_code === 'schedule_impact').length, 0);
  });
  const sixth = await booking('09:30-10:00');
  await check('批量设休通知未结束预约', async () => {
    await call('/api/admin/schedules/batch', { doctor_id: doctor.id, list: [{ date, period: 'morning', is_rest: true }] });
    assert.equal((await notice(sixth.id)).filter(n => n.event_code === 'schedule_impact').length, 1);
  });
  await check('复制上月排班也通知时间被覆盖的既有预约', async () => {
    await call('/api/admin/schedules', { ...schedulePayload, start_time: '10:00:00' });
    const target = new Date(date + 'T00:00:00+08:00'); target.setMonth(target.getMonth() + 1);
    const nextDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(target);
    await call('/api/admin/schedules', { ...schedulePayload, date: nextDate });
    const appt = await call('/api/admin/appointments', { patient_id: patient.id, store_id: store.id, doctor_id: doctor.id, date: nextDate, time: '09:00-09:30', type: 'first', consult_fee: 0, deposit_amount: 0 });
    await call('/api/admin/schedules/copy-last-month', { doctor_id: doctor.id, year: Number(nextDate.slice(0, 4)), month: Number(nextDate.slice(5, 7)) });
    assert.equal((await notice(appt.id)).filter(n => n.event_code === 'schedule_impact').length, 1);
  });
  await check('医生停用/删除提醒有效预约且重复停用不发，完成预约不受影响', async () => {
    const body = {name:'通知测试医生',title:'主任医师',specialty:'睡眠医学',store_ids:[store.id],status:0};
    await call('/api/admin/doctors/'+doctor.id,body,'PUT'); await call('/api/admin/doctors/'+doctor.id,body,'PUT');
    assert.equal((await notice(third.id)).filter(n=>n.event_code==='doctor_unavailable').length,1);
    assert.equal((await notice(first.id)).filter(n=>n.event_code==='doctor_unavailable').length,0);
    await call('/api/admin/doctors/'+doctor.id,{...body,status:1},'PUT'); await call('/api/admin/doctors/'+doctor.id,undefined,'DELETE');
    assert.equal((await notice(third.id)).filter(n=>n.event_code==='doctor_unavailable').length,2);
    await call('/api/admin/doctors/'+doctor.id,{...body,status:1},'PUT');
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[third.id])).status,'pending');
  });
  await check('门店关闭/删除提醒有效预约且重复关闭不发', async () => {
    const body={name:'通知测试门店',address:'隔离测试地址',status:'closed'};
    await call('/api/admin/stores/'+store.id,body,'PUT'); await call('/api/admin/stores/'+store.id,body,'PUT');
    assert.equal((await notice(third.id)).filter(n=>n.event_code==='store_unavailable').length,1);
    await call('/api/admin/stores/'+store.id,{...body,status:'open'},'PUT'); await call('/api/admin/stores/'+store.id,undefined,'DELETE');
    assert.equal((await notice(third.id)).filter(n=>n.event_code==='store_unavailable').length,2);
    await call('/api/admin/stores/'+store.id,{...body,status:'open'},'PUT');
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[third.id])).status,'pending');
  });
  await check('随访完成通知不泄露内部沟通摘要', async () => {
    await call(`/api/admin/patients/${patient.id}/follow-ups`,{follower_id:9000,title:'随访',due_date:date});
    const task=await db.get('SELECT id FROM follow_up_tasks WHERE patient_id=? ORDER BY id DESC LIMIT 1',[patient.id]);
    await call(`/api/admin/patients/${patient.id}/follow-ups/records`,{task_id:task.id,contact_type:'phone',summary:'内部敏感沟通摘要MARKER'});
    const row=await db.get("SELECT * FROM user_notifications WHERE business_type='followup' AND business_id=? AND event_code='completed'",[task.id]);
    assert.ok(row); assert.ok(!row.content.includes('MARKER')); assert.match(row.content,/随访已完成/);
    const before=await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='followup' AND business_id=?",[task.id]);
    await call(`/api/admin/patients/${patient.id}/follow-ups/${task.id}`,{title:'内部改标题',due_date:date},'PUT');
    assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='followup' AND business_id=?",[task.id])).n,before.n);
  });
  await check('跨医生和门店改约通知同时包含原新医生门店日期时段',async()=>{
    const otherStore=await call('/api/admin/stores',{name:'变更后门店',code:'NTC2',address:'另一隔离地址'});
    const otherDoctor=await call('/api/admin/doctors',{name:'变更后医生',title:'主任医师',specialty:'睡眠医学',store_ids:[otherStore.id]});
    await call('/api/admin/schedules',{...schedulePayload,doctor_id:otherDoctor.id,store_id:otherStore.id});
    await call('/api/admin/appointments/'+third.id,{store_id:otherStore.id,doctor_id:otherDoctor.id,date,time:'11:00-11:30'},'PUT');
    const row=(await notice(third.id)).find(n=>n.event_code==='rescheduled');assert.ok(row);
    for(const text of ['通知测试门店','通知测试医生','变更后门店','变更后医生',date,'10:00-10:30','11:00-11:30']) assert.ok(row.content.includes(text),text+' missing in '+row.content);
  });
  const product=await call('/api/admin/products',{name:'通知测试阻鼾器',category:'device',price:10000,stock:10,status:'on'});
  const order=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,appointment_id:first.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:10000,discount_amount:0,technician_id:9000});
  const caseId=order.fulfillment_case_id; assert.ok(caseId);
  const tomorrow=(await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 1 DAY),'%Y-%m-%d') day")).day;
  const today=(await db.get("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') day")).day;
  await check('交付预计日期变化通知原新日期且同日重存不重复',async()=>{
    const path=`/api/admin/fulfillment/cases/${caseId}/assign`;
    await call(path,{technician_id:9000,expected_fitting_date:tomorrow}); await call(path,{technician_id:9000,expected_fitting_date:tomorrow});
    await call(path,{technician_id:9000,expected_fitting_date:date});
    const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='fulfillment' AND business_id=? AND event_code='fitting_date_changed' ORDER BY id",[caseId]);
    assert.equal(rows.length,2); assert.ok(rows[1].content.includes(tomorrow)&&rows[1].content.includes(date));
  });
  await check('真实取模送厂验收到试戴生成随访安排通知',async()=>{
    await call(`/api/admin/fulfillment/cases/${caseId}/mold`,{complete:true,revision:0,details:{mold_no:'N01',storage_location:'测试柜',taken_date:today,method:'数字取模',parameters:[{name:'前伸',value:'1',unit:'mm'}],wear_hours:8,wear_period:'夜间',requirements:'按医嘱制作',file_ids:[]}});
    const batch=await call('/api/admin/fulfillment/batches',{factory_name:'测试工厂',case_ids:[caseId]});
    await call(`/api/admin/fulfillment/batches/${batch.id}/ship`,{carrier:'测试快递',tracking_no:'TEST001',confirmed:true});
    const item=await db.get('SELECT id FROM fulfillment_factory_items WHERE fulfillment_case_id=?',[caseId]);
    await call(`/api/admin/fulfillment/batches/${batch.id}/items/${item.id}/progress`,{action:'received'});
    await call(`/api/admin/fulfillment/cases/${caseId}/device-receipt`,{device_serial_no:'TEST001',storage_location:'测试柜',inspection_result:'passed'});
    await call(`/api/admin/fulfillment/cases/${caseId}/notify-fitting`,{});
    await call(`/api/admin/fulfillment/cases/${caseId}/fitting`,{device_product_id:product.id,initial_advancement:1,start_date:today,next_adjust_date:tomorrow});
    const task=await db.get('SELECT * FROM follow_up_tasks WHERE patient_id=? ORDER BY id DESC LIMIT 1',[patient.id]);
    assert.equal(task.title,'阻鼾器物理微调复查');
    assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='followup' AND business_id=? AND event_code='scheduled'",[task.id]));
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/notification-clinical/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
