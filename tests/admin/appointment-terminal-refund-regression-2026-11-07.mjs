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
const database = 'hanjing_test_terminal_regression_' + Date.now();
const env = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8', timeout: 15000 }))[0].Config.Env;
const password = env.find(s => s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password });
const results = [], steps = [], financialEvidence = []; let db, server;
const check = async (name, action) => { await action();
 const rows=await db.query("SELECT a.id,a.status appointment_status,c.status charge_status,c.consult_fee,c.deposit_amount,c.payment_method,c.paid_at,r.status refund_status,r.amount refund_amount,r.provider_refund_id FROM appointments a LEFT JOIN appointment_charges c ON c.appointment_id=a.id LEFT JOIN appointment_charge_refunds r ON r.charge_id=c.id ORDER BY a.id");
 for(const row of rows){if(row.charge_status){assert.equal(Number(row.consult_fee),2000);assert.equal(Number(row.deposit_amount),5000)}if(row.refund_amount!=null)assert.equal(Number(row.refund_amount),7000);if(row.charge_status==='refunded'){assert.equal(row.refund_status,'refunded');assert.ok(['cancelled','no_show'].includes(row.appointment_status))}if(row.charge_status==='refund_waived'){assert.equal(row.appointment_status,'no_show');assert.ok(row.paid_at);assert.ok(row.refund_status==null||row.refund_status==='waived');assert.equal(row.provider_refund_id,null)}}
 financialEvidence.push({case:name,rows}); results.push({ name, status: 'passed' }); console.log('PASS', name); };
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
  const paidBooking=async()=>call('/api/admin/appointments',{patient_id:patient.id,store_id:store.id,doctor_id:doctor.id,date,time:'10:00-10:30',type:'first',consult_fee:2000,deposit_amount:5000});

  const charge=async id=>call('/api/admin/appointments/'+id+'/charges',{method:'cash',payment_confirmed:true});
  const update=(id,body)=>call('/api/admin/appointments/'+id,body,'PUT');
  const row=id=>db.get('SELECT * FROM appointments WHERE id=?',[id]);
  const money=id=>db.get('SELECT * FROM appointment_charges WHERE appointment_id=?',[id]);
  const fail=async(id,body,status)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/appointments/'+id,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,await r.text())};
  await check('取消现金必须确认退还，确认后直接完成退款',async()=>{
    const a=await paidBooking();await charge(a.id);await fail(a.id,{status:'cancelled',refund_action:'refund'},400);assert.equal((await row(a.id)).status,'pending');
    await update(a.id,{status:'cancelled',refund_action:'refund',offline_confirmed:true});assert.equal((await row(a.id)).status,'cancelled');assert.equal((await money(a.id)).status,'refunded');
    await update(a.id,{status:'cancelled',refund_action:'refund',offline_confirmed:true});assert.equal((await db.query('SELECT * FROM appointment_charge_refunds WHERE charge_id=?',[(await money(a.id)).id])).length,1);
  });
  await check('手动未到诊可直接退现金',async()=>{const a=await paidBooking();await charge(a.id);await update(a.id,{status:'no_show',refund_action:'refund',offline_confirmed:true});assert.equal((await money(a.id)).status,'refunded');assert.equal((await row(a.id)).status,'no_show')});
  await check('未到诊选择无需退款，不创建退款请求且禁止再退款',async()=>{
    const a=await paidBooking();await charge(a.id);await update(a.id,{status:'no_show',refund_action:'waive'});const c=await money(a.id);assert.equal(c.status,'refund_waived');assert.ok(c.paid_at);assert.equal((await db.query('SELECT * FROM appointment_charge_refunds WHERE charge_id=?',[c.id])).length,0);
    await update(a.id,{status:'no_show',refund_action:'waive'});await fail(a.id,{status:'no_show',refund_action:'refund',offline_confirmed:true},409);
    assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='waive_appointment_refund' AND target_id=?",[String(a.id)])).length,2);
  });
  await check('取消预约不能选择无需退款',async()=>{const a=await paidBooking();await charge(a.id);await fail(a.id,{status:'cancelled',refund_action:'waive'},400);assert.equal((await row(a.id)).status,'pending')});
  await check('未付款取消不创建退款',async()=>{const a=await paidBooking();await update(a.id,{status:'cancelled'});assert.equal((await row(a.id)).status,'cancelled');assert.ok(!(await money(a.id)))});
  await check('已退款不得再标记无需退款',async()=>{const a=await paidBooking();await charge(a.id);await update(a.id,{status:'no_show',refund_action:'refund',offline_confirmed:true});await fail(a.id,{status:'no_show',refund_action:'waive'},409)});
  const a=await paidBooking();const billingCharge=await db.transaction(async conn=>billing.prepareCharge(conn,await billing.lockChargeAppointment(conn,a.id),'wechat'));
  await billing.settleOnlineCharge({trade_state:'SUCCESS',out_trade_no:billingCharge.charge_no,transaction_id:'WX-TERMINAL',amount:{currency:'CNY',total:billing.chargeAmount(billingCharge)}});
  await check('微信未到诊可无需退款，不调用渠道',async()=>{await update(a.id,{status:'no_show',refund_action:'waive'});assert.equal((await money(a.id)).status,'refund_waived')});

  await check('微信取消确认经退款接口原路退款，异常结果保持待核对',async()=>{
    const keys=generateKeyPairSync('rsa',{modulusLength:2048});
    Object.assign(process.env,{WECHAT_APP_ID:'test-app',WECHAT_PAY_MCH_ID:'test-mch',WECHAT_PAY_SERIAL_NO:'test-serial',WECHAT_PAY_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),WECHAT_PAY_PLATFORM_CERT:keys.publicKey.export({type:'spki',format:'pem'}),WECHAT_PAY_API_V3_KEY:'01234567890123456789012345678901',WECHAT_PAY_NOTIFY_URL:'https://example.invalid/notify'});
    const originalFetch=globalThis.fetch;let providerCalls=0;let timeout=false;const trades=new Map();
    globalThis.fetch=async(url,options)=>{
      if(!String(url).startsWith('https://api.mch.weixin.qq.com/'))return originalFetch(url,options);
      providerCalls++;if(timeout)throw Error('模拟渠道超时');const req=JSON.parse(options.body);const c=trades.get(req.transaction_id);assert.ok(c);assert.equal(req.amount.refund,billing.chargeAmount(c));
      const body=JSON.stringify({out_refund_no:req.out_refund_no,out_trade_no:c.charge_no,transaction_id:req.transaction_id,refund_id:'REF-'+providerCalls,status:'SUCCESS',amount:req.amount});const timestamp=String(Math.floor(Date.now()/1000)),nonce='terminal-test';
      const signature=sign('RSA-SHA256',Buffer.from([timestamp,nonce,body,''].join('\n')),keys.privateKey).toString('base64');
      return new Response(body,{status:200,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Signature':signature}});
    };
    try{for(const [target,broken] of [['cancelled',false],['no_show',false],['cancelled',true],['no_show',true]]){
      const b=await paidBooking();const c=await db.transaction(async conn=>billing.prepareCharge(conn,await billing.lockChargeAppointment(conn,b.id),'wechat'));trades.set('TX-'+b.id,c);
      await billing.settleOnlineCharge({trade_state:'SUCCESS',out_trade_no:c.charge_no,transaction_id:'TX-'+b.id,amount:{currency:'CNY',total:billing.chargeAmount(c)}});timeout=broken;
      const result=await update(b.id,{status:target,refund_action:'refund'});assert.equal(result.refund_errors.length,broken?1:0);assert.equal((await money(b.id)).status,broken?'refunding':'refunded');assert.equal((await row(b.id)).status,target);
    }assert.equal(providerCalls,4)}finally{globalThis.fetch=originalFetch}
  });

  await check('仅有预约编辑权限不能免退款或提交退款',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9001,'预约操作员','terminal_staff',?)",[JSON.stringify({type:'system',store_ids:[]})]);
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9001,'appointment:edit'),(9001,'appointment:cancel')");
    await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9001,'terminal-staff','unused','操作员',9001)");
    const limited=jwt.sign({id:9001,role:'terminal_staff',token_version:0},helpers.JWT_SECRET);const b=await paidBooking();await charge(b.id);
    for(const action of ['refund','waive']){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/appointments/'+b.id,{method:'PUT',headers:{Authorization:'Bearer '+limited,'Content-Type':'application/json'},body:JSON.stringify({status:'no_show',refund_action:action,offline_confirmed:true})});assert.equal(r.status,403)}assert.equal((await row(b.id)).status,'pending');
  });
  await check('自动未到诊待退款可选择无需退款并结束待处理记录',async()=>{
    const b=await paidBooking();await charge(b.id);const OriginalDate=globalThis.Date;const future=new OriginalDate(date+'T16:00:00+08:00').getTime()+86400000;
    globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[future]))}static now(){return future}};
    try{await db.autoUpdateExpiredAppointments()}finally{globalThis.Date=OriginalDate}
    assert.equal((await money(b.id)).status,'refund_pending');await update(b.id,{status:'no_show',refund_action:'waive'});const c=await money(b.id);assert.equal(c.status,'refund_waived');assert.equal((await db.get('SELECT status FROM appointment_charge_refunds WHERE charge_id=?',[c.id])).status,'waived');
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/appointment-terminal-refund-2026-11-07/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, financialEvidence, databaseDropped: true, boundaries: '隔离管理员初始化；预约/现金收费/关联订单由HTTP API创建，微信支付与退款采用真实业务模块和模拟渠道响应；模拟跨日时间并发触发过期，临时库清理；不含真机和真实资金' }, null, 2));
}
