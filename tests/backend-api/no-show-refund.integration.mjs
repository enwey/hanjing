import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_noshow_' + Date.now();
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
  const schedulePayload = { doctor_id: doctor.id, store_id: store.id, date, period: 'morning', start_time: '09:00:00', end_time: '12:00:00', slot_interval_minutes: 30, people_per_slot: 20 };
  await call('/api/admin/schedules', schedulePayload);
  const booking = async (time = '09:00-09:30') => call('/api/admin/appointments', { patient_id: patient.id, store_id: store.id, doctor_id: doctor.id, date, time, type: 'first', consult_fee: 0, deposit_amount: 0 });
  const notice = async id => db.query("SELECT * FROM user_notifications WHERE business_type='appointment' AND business_id=? ORDER BY id", [id]);



  const billing=await import('../../hanjing-clinic-backend/appointment-charges.js');
  const paidBooking=async()=>call('/api/admin/appointments',{patient_id:patient.id,store_id:store.id,doctor_id:doctor.id,date,time:'10:00-10:30',type:'first',consult_fee:20,deposit_amount:50});
  const cash=await paidBooking(), wx=await paidBooking(), unpaid=await paidBooking(), manual=await paidBooking();
  const cashCharge=await call('/api/admin/appointments/'+cash.id+'/charges',{method:'cash',payment_confirmed:true});
  const manualCharge=await call('/api/admin/appointments/'+manual.id+'/charges',{method:'cash',payment_confirmed:true});
  // Online channel is simulated at the payment-service boundary; no real money moves.
  const prepare=async id=>db.transaction(async conn=>billing.prepareCharge(conn,await billing.lockChargeAppointment(conn,id),'wechat'));
  const wxCharge=await prepare(wx.id), pendingCharge=await prepare(unpaid.id);
  const paidPayload={trade_state:'SUCCESS',out_trade_no:wxCharge.charge_no,transaction_id:'NOSHOW-WX-1',amount:{currency:'CNY',total:billing.chargeAmount(wxCharge)}};
  await billing.settleOnlineCharge(paidPayload);
  const free=await booking();
  const product=await call('/api/admin/products',{name:'关联服务',category:'service',price:100,stock:10,status:'on'});
  await call('/api/admin/orders',{patient_id:patient.id,appointment_id:free.id,store_id:store.id,items:[{product_id:product.id,quantity:1}],pay_method:'cash',payment_confirmed:true,pay_amount:100,discount_amount:0,technician_id:9000});
  const oldOrders=await db.query('SELECT * FROM orders ORDER BY id');
  await call('/api/admin/appointments/'+manual.id,{status:'no_show'},'PUT');
  const OriginalDate=globalThis.Date;
  async function expire(){
    const future=new OriginalDate(date+'T16:00:00+08:00').getTime()+86400000;
    globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[future]))} static now(){return future}};
    try {await Promise.all([db.autoUpdateExpiredAppointments(),db.autoUpdateExpiredAppointments()])} finally {globalThis.Date=OriginalDate}
  }
  await check('未过期预约不会提前进入待退款',async()=>{await db.autoUpdateExpiredAppointments();assert.equal((await db.get('SELECT status FROM appointment_charges WHERE id=?',[cashCharge.id])).status,'paid')});
  await expire();
  const load=charge=>db.get('SELECT * FROM appointment_charges WHERE id=?',[charge.id]);
  const refunds=charge=>db.query('SELECT * FROM appointment_charge_refunds WHERE charge_id=?',[charge.id]);
  await check('自动未到诊与手动未到诊的现金收费均待退款',async()=>{
    for(const c of [cashCharge,manualCharge]){assert.equal((await load(c)).status,'refund_pending');const rows=await refunds(c);assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(rows[0].reason,'预约未到诊');assert.equal(Number(rows[0].amount),billing.chargeAmount(c));}
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[cash.id])).status,'no_show');
  });
  await check('微信已支付进入待退款，未自动调用渠道退款',async()=>{
    assert.equal((await load(wxCharge)).status,'refund_pending');const rows=await refunds(wxCharge);assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(rows[0].provider_refund_id,null);
  });
  await check('未支付收费单关闭且不创建退款',async()=>{assert.equal((await load(pendingCharge)).status,'cancelled');assert.equal((await refunds(pendingCharge)).length,0)});
  await check('免费预约不创建收费退款，关联订单不变',async()=>{
    assert.equal((await db.query('SELECT * FROM appointment_charges WHERE appointment_id=?',[free.id])).length,0);assert.deepEqual(await db.query('SELECT * FROM orders ORDER BY id'),oldOrders);
  });
  await check('重复及并发执行不重复退款记录和通知',async()=>{
    const before=await db.query('SELECT * FROM appointment_charge_refunds ORDER BY id');const notices=await db.query('SELECT * FROM user_notifications ORDER BY id');
    await expire();await Promise.all([db.autoUpdateExpiredAppointments(),db.autoUpdateExpiredAppointments()]);
    assert.deepEqual(await db.query('SELECT * FROM appointment_charge_refunds ORDER BY id'),before);assert.deepEqual(await db.query('SELECT * FROM user_notifications ORDER BY id'),notices);
  });
  await check('现金须人工确认实际退款，完成后预约仍未到诊',async()=>{
    const path='/api/admin/appointments/'+cash.id+'/charges/'+cashCharge.id+'/refund';
    const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({reason:'未到诊'})});assert.equal(r.status,400);assert.equal((await load(cashCharge)).status,'refund_pending');
    await call(path,{reason:'未到诊',offline_confirmed:true});assert.equal((await load(cashCharge)).status,'refunded');assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[cash.id])).status,'no_show');
  });
  await check('微信经工作人员提交后等待渠道成功才记已退款',async()=>{
    let payload;let calls=0;
    await billing.submitChargeRefund(wx.id,wxCharge.id,'未到诊',()=>{},async req=>{calls++;payload={out_refund_no:req.outRefundNo,out_trade_no:wxCharge.charge_no,transaction_id:'NOSHOW-WX-1',refund_id:'NOSHOW-REFUND-1',amount:{currency:'CNY',total:billing.chargeAmount(wxCharge),refund:req.refundAmount}};return {...payload,status:'PROCESSING'}});
    assert.equal(calls,1);assert.equal((await load(wxCharge)).status,'refunding');await billing.completeChargeRefund({...payload,refund_status:'SUCCESS'});assert.equal((await load(wxCharge)).status,'refunded');assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[wx.id])).status,'no_show');
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/no-show-refund/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；预约/现金收费/关联订单由HTTP API创建，微信支付与退款采用真实业务模块和模拟渠道响应；模拟跨日时间并发触发过期，临时库清理；不含真机和真实资金' }, null, 2));
}
