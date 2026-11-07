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
const database = 'hanjing_test_order_operators_' + Date.now();
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
  const {finalizePaidProductOrder,finalizePaidAppointment}=await import('../../hanjing-clinic-backend/routes/client.js');
  const refunds=await import('../../hanjing-clinic-backend/refunds.js');
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9002,'refund-worker','unused','退款工作人员',9000)");
  const originalToken=token,secondToken=jwt.sign({id:9002,role:'super_admin',token_version:0},helpers.JWT_SECRET);
  const product=await call('/api/admin/products',{name:'操作人测试服务',category:'service',price:7000,stock:100,status:'on'});
  const create=async(method='cash',extra={})=>{const result=await call('/api/admin/orders',{patient_id:patient.id,store_id:store.id,items:[{product_id:product.id,quantity:1}],pay_method:method,payment_confirmed:true,pay_amount:7000,discount_amount:0,technician_id:9000,collected_by_name:'伪造姓名',collected_by_admin_id:9002,...extra});return await db.get('SELECT * FROM orders WHERE id=?',[result.order_id || result.id || result.orderId || result.order?.id])};
  const detail=id=>call('/api/admin/orders/'+id,undefined,'GET');
  const paid=async o=>{await db.transaction(conn=>finalizePaidProductOrder(conn,o,{trade_state:'SUCCESS',out_trade_no:o.order_no,transaction_id:'TX-'+o.id,amount:{total:7000,currency:'CNY'}}));return detail(o.id)};
  let cash;
  await check('商城现金收款与退款保存不同操作人，忽略客户端伪造字段',async()=>{
    cash=await create();assert.ok(cash);assert.equal(cash.collected_by_admin_id,9000);assert.equal(cash.collected_by_name,'隔离管理员');assert.equal(cash.collection_source,'admin');
    const input={amount:7000,method:'cash',confirmed:true,refunded_at:new Date().toISOString(),reference:'MOCK-CASH',evidence:'隔离测试，无真实资金',refunded_by_admin_id:9000};
    token=secondToken;try{await call('/api/admin/orders/'+cash.id+'/offline-refund',input)}finally{token=originalToken}
    let d=await detail(cash.id);assert.equal(d.status,'refunded');assert.equal(d.pay_amount,7000);assert.equal(d.refunded_by_admin_id,9002);assert.equal(d.refunded_by_name,'退款工作人员');assert.ok(d.refund_requested_at);assert.ok(d.refund_at);
    await call('/api/admin/orders/'+cash.id+'/offline-refund',input);d=await detail(cash.id);assert.equal(d.refunded_by_admin_id,9002);
  });
  await check('银行转账订单同样记录收退款操作人，未确认退款不写入',async()=>{
    const o=await create('bank');await assert.rejects(()=>refunds.registerOfflineRefund(o.id,9002,{amount:7000,method:'bank',confirmed:false}));assert.equal((await detail(o.id)).refunded_by_admin_id,null);
    await call('/api/admin/orders/'+o.id+'/offline-refund',{amount:7000,method:'bank',confirmed:true,refunded_at:new Date().toISOString(),reference:'MOCK-BANK'});assert.equal((await detail(o.id)).refunded_by_admin_id,9000);
  });
  const response=(o,trade=o.order_no)=>({missing:async()=>[],create:async req=>{assert.equal(req.refundAmount,7000);assert.equal(req.outTradeNo,trade);return {status:'SUCCESS',out_trade_no:trade,out_refund_no:req.outRefundNo,refund_id:'RF-'+o.id,success_time:new Date().toISOString(),amount:{total:7000,refund:7000,currency:'CNY'}}}});
  await check('商城微信自动支付不冒记工作人员，原路退款保留审批操作人',async()=>{
    let o=await create('wechat');assert.equal(o.collected_by_admin_id,null);assert.equal(o.pay_at,null);o=await paid(o);assert.equal(o.collection_source,'patient_wechat');assert.equal(o.collected_by_admin_id,null);
    await refunds.applyRefund(o.id,p.user_id,'隔离测试');await refunds.reviewRefund(o.id,true,9002,response(o));const d=await detail(o.id);assert.equal(d.status,'refunded');assert.equal(d.refunded_by_admin_id,9002);assert.equal(d.refunded_by_name,'退款工作人员');
    await paid(o);assert.equal((await detail(o.id)).refunded_by_admin_id,9002);
  });
  await check('微信退款超时仍保留发起人，核对和重复回调不改操作人',async()=>{
    const o=await paid(await create('wechat'));await refunds.applyRefund(o.id,p.user_id,'超时模拟');await assert.rejects(()=>refunds.reviewRefund(o.id,true,9002,{missing:async()=>[],create:async()=>{throw Error('模拟超时')}}));let d=await detail(o.id);assert.equal(d.status,'refunding');assert.equal(d.refunded_by_admin_id,9002);
    const payload=await response(o).create({outRefundNo:d.wechat_refund_no,outTradeNo:o.order_no,refundAmount:7000});await refunds.syncRefund(o.id,9000,async()=>payload);await refunds.completeRefund(payload);d=await detail(o.id);assert.equal(d.refunded_by_admin_id,9002);assert.equal(d.status,'refunded');
  });
  await check('拒绝退款不记录为退款操作，后续再次申请可记录实际退款人',async()=>{
    const o=await paid(await create('wechat'));await refunds.applyRefund(o.id,p.user_id,'测试拒绝');await refunds.reviewRefund(o.id,false,9000);assert.equal((await detail(o.id)).refunded_by_admin_id,null);await refunds.applyRefund(o.id,p.user_id,'重新申请');await refunds.reviewRefund(o.id,true,9002,response(o));assert.equal((await detail(o.id)).refunded_by_admin_id,9002);
  });
  await check('历史预约订单兼容支付与退款，使用预约原支付单号，详情可见操作人',async()=>{
    const a=await call('/api/admin/appointments',{patient_id:patient.id,store_id:store.id,doctor_id:doctor.id,date,time:'10:00-10:30',type:'first',consult_fee:2000,deposit_amount:5000});const appt=await db.get('SELECT * FROM appointments WHERE id=?',[a.id]);
    await db.transaction(conn=>finalizePaidAppointment(conn,appt,p.user_id,{trade_state:'SUCCESS',out_trade_no:appt.appointment_no,transaction_id:'LEGACY-'+a.id,amount:{total:7000,currency:'CNY'}}));
    const o=await db.get("SELECT * FROM orders WHERE appointment_id=? AND type='appointment_deposit'",[a.id]);assert.ok(o);assert.equal(o.collection_source,'patient_wechat');
    if(o.status!=='refund_pending')await refunds.applyRefund(o.id,p.user_id,'历史预约退款');await refunds.reviewRefund(o.id,true,9002,response(o,appt.appointment_no));const d=await detail(o.id);assert.equal(d.refunded_by_name,'退款工作人员');assert.equal(d.status,'refunded');assert.equal(d.pay_amount,7000);
  });
  await check('历史预约取消后迟到付款仍记录支付来源并可按原单退款',async()=>{
    const a=await call('/api/admin/appointments',{patient_id:patient.id,store_id:store.id,doctor_id:doctor.id,date,time:'10:30-11:00',type:'first',consult_fee:2000,deposit_amount:5000});await call('/api/admin/appointments/'+a.id,{status:'cancelled'},'PUT');const appt=await db.get('SELECT * FROM appointments WHERE id=?',[a.id]);
    await db.transaction(conn=>finalizePaidAppointment(conn,appt,p.user_id,{trade_state:'SUCCESS',out_trade_no:appt.appointment_no,transaction_id:'LATE-'+a.id,amount:{total:7000,currency:'CNY'}}));const o=await db.get('SELECT * FROM orders WHERE appointment_id=?',[a.id]);assert.equal(o.status,'refund_pending');assert.equal(o.collection_source,'patient_wechat');assert.equal(o.collected_by_admin_id,null);await refunds.reviewRefund(o.id,true,9002,response(o,appt.appointment_no));assert.equal((await detail(o.id)).refunded_by_admin_id,9002);assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[a.id])).status,'cancelled');
  });
  await check('后台微信扫码收款记录实际发起人，重试和到账不覆盖',async()=>{
    const keys=generateKeyPairSync('rsa',{modulusLength:2048});
    Object.assign(process.env,{WECHAT_APP_ID:'test-app',WECHAT_PAY_MCH_ID:'test-mch',WECHAT_PAY_SERIAL_NO:'test-serial',WECHAT_PAY_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),WECHAT_PAY_PLATFORM_CERT:keys.publicKey.export({type:'spki',format:'pem'}),WECHAT_PAY_API_V3_KEY:'01234567890123456789012345678901',WECHAT_PAY_NOTIFY_URL:'https://example.invalid/notify'});
    const before=globalThis.fetch;let requests=0;let broken=true;
    globalThis.fetch=async(url,options)=>{
      if(!String(url).startsWith('https://api.mch.weixin.qq.com/'))return before(url,options);
      requests++;if(broken)throw Error('模拟收款响应超时');
      const body=JSON.stringify({code_url:'weixin://mock-only'});const timestamp=String(Math.floor(Date.now()/1000)),nonce='order-operator';const signature=sign('RSA-SHA256',Buffer.from([timestamp,nonce,body,''].join('\n')),keys.privateKey).toString('base64');
      return new Response(body,{status:200,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Signature':signature}});
    };
    try{
      const o=await create('wechat_native');token=secondToken;
      try{await assert.rejects(()=>call('/api/admin/pay/native',{orderId:o.id}))}finally{token=originalToken}
      let d=await detail(o.id);assert.equal(d.collected_by_admin_id,9002);assert.equal(d.pay_at,null);
      broken=false;await call('/api/admin/pay/native',{orderId:o.id});d=await paid(o);assert.equal(d.collection_source,'wechat_native');assert.equal(d.collected_by_admin_id,9002);assert.equal(d.collected_by_name,'退款工作人员');assert.equal(requests,2);
    }finally{globalThis.fetch=before;token=originalToken}
  });
  await check('权限不足拒绝退款且不写入操作人',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9003,'只读订单','order_read_only',?)",[JSON.stringify({type:'system',store_ids:[]})]);
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9003,'order:view')");await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9003,'readonly-order','unused','只读人员',9003)");
    const o=await create();const limited=jwt.sign({id:9003,role:'order_read_only',token_version:0},helpers.JWT_SECRET);
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/orders/'+o.id+'/offline-refund',{method:'POST',headers:{Authorization:'Bearer '+limited,'Content-Type':'application/json'},body:JSON.stringify({amount:7000,method:'cash',confirmed:true,refunded_at:new Date().toISOString(),reference:'DENY'})});assert.equal(r.status,403);assert.equal((await detail(o.id)).refunded_by_admin_id,null);
  });
  await check('管理员改名不影响已收退款姓名快照',async()=>{await db.run("UPDATE admin_users SET name='新姓名' WHERE id IN (9000,9002)");const d=await detail(cash.id);assert.equal(d.collected_by_name,'隔离管理员');assert.equal(d.refunded_by_name,'退款工作人员')});
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/order-payment-operator/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, financialEvidence, databaseDropped: true, boundaries: '隔离库；业务数据通过实际API创建，历史预约付款经兼容回调模块生成；微信响应模拟，拒绝公网请求；无真实资金。' }, null, 2));
}
