import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createCipheriv,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const env = JSON.parse(execFileSync('docker', ['inspect','hanjing-mysql'], {encoding:'utf8'}))[0].Config.Env;
const password = env.find(line => line.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
assert.ok(password);
const schema = 'hanjing_test_promoter_flow_' + Date.now();
const control = await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const http = globalThis.fetch;
const evidence = {passed:[]};
const localRetest = process.argv.includes('--local-retest');
const regressPaymentClaim = localRetest || process.argv.includes('--regress-flow-29');
const verifyPaymentClaim = regressPaymentClaim || process.argv.includes('--verify-flow-29');
const audit = verifyPaymentClaim || process.argv.includes('--full-audit');
const verifyFixes = audit || process.argv.includes('--verify-flow-18-21');
const verifyFailures = audit || process.argv.includes('--verify-failures');
const matrix = verifyFailures || verifyFixes || process.argv.includes('--full-matrix');
const validQr = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=','base64');
const invalidQr = Buffer.from(validQr);
invalidQr.fill(0,41,41+validQr.readUInt32BE(33));
let qrUnavailable = false;
let invalidQrResponse = false;
let qrRequests = 0;
let qrRequest;
let prepayRequest;
let failPrepay = false;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const apiKey=randomBytes(16).toString('hex');
function signedHeaders(body) {
  const timestamp=String(Math.floor(Date.now()/1000));
  const nonce=randomBytes(16).toString('hex');
  return {
    'Content-Type':'application/json',
    'Wechatpay-Timestamp':timestamp,
    'Wechatpay-Nonce':nonce,
    'Wechatpay-Signature':sign('RSA-SHA256',Buffer.from(timestamp+'\n'+nonce+'\n'+body+'\n'),privateKey).toString('base64')
  };
}
const pass = (name, details) => evidence.passed.push({name, details});
let created, db, server;
try {
  await control.query('CREATE DATABASE ' + schema);
  created = true;
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:schema,
    NODE_ENV:'test', JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex'),
    WX_MINI_APP_ID:'fixture-app',WX_MINI_APP_SECRET:'fixture-secret',WECHAT_APP_ID:'fixture-app',
    WECHAT_PAY_MCH_ID:'fixture-merchant',WECHAT_PAY_SERIAL_NO:'fixture-serial',
    WECHAT_PAY_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),
    WECHAT_PAY_PLATFORM_CERT:publicKey.export({type:'spki',format:'pem'}),
    WECHAT_PAY_API_V3_KEY:apiKey,WECHAT_PAY_NOTIFY_URL:'https://payments.example.invalid/api/v1/orders/pay-callback'});
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname==='api.mch.weixin.qq.com' && u.pathname==='/v3/pay/transactions/jsapi') {
      prepayRequest=JSON.parse(options.body);
      if (failPrepay) {
        const body=JSON.stringify({code:'SYSTEM_ERROR',message:'fixture prepay unavailable'});
        return new Response(body,{status:500,headers:signedHeaders(body)});
      }
      const response=JSON.stringify({prepay_id:'fixture-prepay'});
      return new Response(response,{headers:signedHeaders(response)});
    }
    if (u.hostname === 'api.weixin.qq.com') {
      if (u.pathname === '/wxa/getwxacodeunlimit') {
        qrRequest=JSON.parse(options.body);
        if (qrUnavailable) return Response.json({errcode:45009,errmsg:'fixture unavailable'});
        qrRequests++;
        return new Response(invalidQrResponse ? invalidQr : validQr);
      }
      if (u.pathname === '/sns/jscode2session') {
        const code=u.searchParams.get('js_code');
        return Response.json({openid:code==='fixture'?'fixture-booking-user':'fixture-booking-'+code});
      }
      if (u.pathname === '/cgi-bin/stable_token') return Response.json({access_token:'fixture-token',expires_in:7200});
      if (u.pathname === '/wxa/business/getuserphonenumber') {
        const code=JSON.parse(options.body).code;
        return Response.json({errcode:0,phone_info:{purePhoneNumber:code==='fixture-phone'?'13800009101':'138000092'+code.slice(-2)}});
      }
    }
    throw Error('Unexpected upstream call');
  };
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'fixture-admin','unused','隔离管理员',9000)");
  const admin = jwt.sign({id:9000,role:'super_admin',token_version:0},process.env.JWT_SECRET);
  const app = express();
  app.use('/api/v1/orders/pay-callback',express.raw({type:'application/json'}));
  app.use(express.json());
  app.use((await import('../../hanjing-clinic-backend/routes/promoter.js')).default);
  app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  const client=await import('../../hanjing-clinic-backend/routes/client.js');
  app.use(client.default);
  // Match the production JSON error envelope without enabling its alerts.
  app.use((error,_req,res,_next)=>{
    const status=error.statusCode || error.status || 500;
    res.status(status).json({code:status,message:status>=500?'系统繁忙，请稍后再试':error.message || '请求失败'});
  });
  server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  async function call(path,body,token,method=body?'POST':'GET') {
    const r=await http('http://127.0.0.1:'+server.address().port+path,{method,
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const json=await r.json();
    return {status:r.status,...json};
  }
  async function ok(path,body,token) {
    const r=await call(path,body,token);assert.equal(r.status,200,r.message);return r.data;
  }
  const store=await ok('/api/admin/stores',{name:'隔离门店',code:'LOST',address:'隔离地址'},admin);
  const doctor=await ok('/api/admin/doctors',{name:'隔离医生',title:'医师',specialty:'睡眠医学',store_ids:[store.id]},admin);
  const login=await ok('/api/v1/auth/wx-login',{code:'fixture',phoneCode:'fixture-phone'});
  const token=login.access_token;
  const family=await ok('/api/v1/user/family-members',undefined,token);
  const patient=(Array.isArray(family)?family:family.list).find(p=>p.relation==='self');
  assert.ok(patient);
  const {day:date}=await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'%Y-%m-%d') day");
  for (const [period,start,end,capacity] of [['morning','09:00:00','10:00:00',2],['afternoon','14:00:00','15:00:00',1]]) {
    await ok('/api/admin/schedules',{doctor_id:doctor.id,store_id:store.id,date,period,start_time:start,end_time:end,slot_interval_minutes:30,people_per_slot:capacity},admin);
  }
  const slots=await ok('/api/v1/day-slots?doctorId='+doctor.id+'&storeId='+store.id+'&date='+date);

  await ok('/api/admin/settings',{distribution_settle_days:0,min_withdraw:1,withdraw_fee_rate:0,enable_distribution:true},admin);
  const promoter = await ok('/api/admin/distribution/promoters',{nickname:'Fixture promoter',login_name:'fixture-promoter',password:'Fixture123'},admin);
  assert.match(promoter.qr?.image || '',/^data:image\/png;base64,/);
  assert.equal(qrRequest.page,'pages/index/index');
  assert.equal(qrRequest.scene,'ref='+promoter.qr.code);
  assert.equal(qrRequest.env_version,'trial');
  const qr = await ok('/api/admin/distribution/promoters/'+promoter.id+'/qr',undefined,admin);
  assert.deepEqual(qr,promoter.qr);
  pass('后台创建推广员并获取小程序码，微信上游模拟');

  const storage = new Map();
  let miniApp;
  const wx = {getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key)};
  const load = (path, hooks) => {
    const context={module:{exports:{}},wx,...hooks};
    vm.runInNewContext(readFileSync(new URL('../../mp-weixin-rewrite/'+path,import.meta.url),'utf8'),context);
    return context.module.exports;
  };
  const referral = load('common/utils/backend-referral.js');
  load('app.js',{Page(){},App:config=>{miniApp=config;},require:name=>({
    './api/index':{bindDistribution(){assert.fail('后台推荐码不应立即发出普通绑定请求');}},
    './common/utils/backend-referral':referral,'./common/utils/mini-log':{init(){},report(){}}
  })[name]});
  miniApp.onLaunch({query:{scene:encodeURIComponent(qrRequest.scene)}});
  miniApp.onShow({query:{scene:'%FF'}});
  assert.equal(referral.current(),qr.code);
  assert.equal(storage.has('pending_invite_code'),false);
  const appointmentApi=load('api/modules/appointment-api.js',{require:name=>name==='../request'?{request:async req=>{
    const pending=await call('/api/v1'+req.url,req.data,token);
    if(pending.status!==200)throw Object.assign(new Error(pending.message),{data:pending});
    return pending.data;
  }}:referral});
  const slot=slots.find(s=>s.label==='09:00-09:30'&&s.status==='available');
  assert.ok(slot);
  const appointmentPayload={patientId:patient.id,doctorId:doctor.id,storeId:store.id,scheduleId:slot.scheduleId,appointmentDate:date,appointmentTime:slot.label,type:'first'};
  const user=await db.get('SELECT user_id FROM patients WHERE id=?',[patient.id]);
  const relation=()=>db.query('SELECT parent_distributor_id FROM distribution_relationships WHERE child_user_id=? AND level=1',[user.user_id]);
  assert.equal((await relation()).length,0);
  const appointment=await appointmentApi.createAppointment(appointmentPayload);
  const saved=await db.get('SELECT referral_promoter_id,referral_code FROM appointments WHERE id=?',[appointment.id]);
  assert.equal(Number(saved.referral_promoter_id),Number(promoter.id));
  assert.equal(saved.referral_code,qr.code);
  assert.equal((await relation()).length,0);
  pass('模拟扫码冷启动，保留推荐来源，真实预约绑定来源但尚无上下级');

  const product=await ok('/api/admin/products',{name:'Fixture product',category:'accessory',price:10000,status:'on',stock:20,is_distribution:true,commission_rate_level1:10,backend_referral_enabled:true,backend_rate_x:20,backend_rate_y:8},admin);
  const entries=id=>db.query('SELECT distributor_id,commission_kind,commission_amount,status FROM distribution_orders WHERE order_id=? ORDER BY commission_level',[id]);
  const prepareNotification=(order,overrides={})=>{
    const receipt={trade_state:'SUCCESS',out_trade_no:order.order_no,amount:{currency:'CNY',total:Number(order.pay_amount)},transaction_id:'FIXTURE-WXPAY-'+order.id,...overrides};
    const nonce=randomBytes(9).toString('base64');
    const associatedData='transaction';
    const cipher=createCipheriv('aes-256-gcm',Buffer.from(apiKey),Buffer.from(nonce));
    cipher.setAAD(Buffer.from(associatedData));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(receipt)),cipher.final(),cipher.getAuthTag()]);
    const body=JSON.stringify({resource:{nonce,associated_data:associatedData,ciphertext:encrypted.toString('base64')}});
    const headers=signedHeaders(body);
    const notify=(raw)=>http('http://127.0.0.1:'+server.address().port+'/api/v1/orders/pay-callback',{
      method:'POST',headers,body:raw,signal:AbortSignal.timeout(15000)
    });
    return {body,notify};
  };
  const simulateVerifiedPayment=async id=>{
    const order=await db.get('SELECT * FROM orders WHERE id=?',[id]);
    const params=await ok('/api/v1/orders/'+id+'/pay',{},token);
    assert.equal(params.package,'prepay_id=fixture-prepay');
    assert.equal(params.signType,'RSA');
    assert.equal(prepayRequest.out_trade_no,order.order_no);
    assert.equal(prepayRequest.amount.total,Number(order.pay_amount));
    assert.equal(prepayRequest.payer.openid,'fixture-booking-user');
    const {body,notify}=prepareNotification(order);
    assert.equal((await notify(body+' ')).status,401);
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'pending');
    assert.equal((await entries(id)).length,0);
    for (let attempt=0;attempt<2;attempt++) {
      const response=await notify(body);
      assert.equal(response.status,200,await response.clone().text());
      assert.equal((await response.json()).code,'SUCCESS');
    }
  };
  const mall=await ok('/api/v1/orders',{items:[{productId:product.id,quantity:1}],shippingAddress:{deliveryMethod:'pickup',storeId:store.id,contactName:'Fixture',phone:'13800009101'}},token);
  const mallRow=await db.get('SELECT status,referral_promoter_id FROM orders WHERE id=?',[mall.id]);
  assert.equal(mallRow.status,'pending');
  assert.equal(mallRow.referral_promoter_id,null);
  assert.equal((await entries(mall.id)).length,0);
  assert.equal((await relation()).length,0);
  pass('普通小程序商城未付款订单无推荐来源、无佣金、无绑定');
  await simulateVerifiedPayment(mall.id);
  assert.ok((await db.get('SELECT pay_at FROM orders WHERE id=?',[mall.id])).pay_at);
  assert.equal((await entries(mall.id)).length,0);
  assert.equal((await relation()).length,0);
  pass('普通商城订单通过预支付、真实回调验签及解密接口入账，始终无绑定和 X/Y 佣金');

  const cashier={patient_id:patient.id,appointment_id:appointment.id,store_id:store.id,items:[{product_id:product.id,quantity:1}],pay_amount:9000,discount_amount:1000,pay_method:'cash',payment_confirmed:true,request_id:'fixture-promoter-flow-order-01'};
  const order=await ok('/api/admin/orders',cashier,admin);
  const replay=await ok('/api/admin/orders',cashier,admin);
  assert.equal(replay.order_id,order.order_id);
  assert.equal(Number((await relation())[0].parent_distributor_id),Number(promoter.id));
  assert.deepEqual((await entries(order.order_id)).map(row=>[Number(row.distributor_id),row.commission_kind,Number(row.commission_amount),row.status]),[[Number(promoter.id),'referral_new',1800,'pending']]);
  pass('关联预约确认收款后首次绑定，X 佣金按实付 9000 分计算，请求重放未重复发佣',{commission:1800});
  const next=await ok('/api/admin/orders',{...cashier,request_id:'fixture-promoter-flow-order-02'},admin);
  assert.deepEqual((await entries(next.order_id)).map(row=>[row.commission_kind,Number(row.commission_amount)]),[['tier',900]]);
  pass('同预约再次成单仅计普通一级佣金',{commission:900});
  await ok('/api/admin/orders/'+order.order_id+'/complete',{},admin);
  const portal=await ok('/api/promoter/login',{account:'fixture-promoter',password:'Fixture123'});
  await ok('/api/promoter/commissions',undefined,portal.token);
  assert.equal((await entries(order.order_id))[0].status,'settled');
  const balance=await db.get('SELECT available_commission FROM distributors WHERE id=?',[promoter.id]);
  assert.equal(Number(balance.available_commission),1800);
  pass('订单核销后按零天结算配置释放佣金，未核销第二单仍冻结',{available:1800});

  const second=await ok('/api/admin/distribution/promoters',{nickname:'Second fixture promoter',login_name:'fixture-second',password:'Fixture123'},admin);
  const secondScene=qrRequest.scene;
  const anotherSlot=slots.find(s=>s.label==='14:00-14:30'&&s.status==='available');
  assert.ok(anotherSlot);
  const anotherPayload={...appointmentPayload,scheduleId:anotherSlot.scheduleId,appointmentTime:anotherSlot.label};
  const setStatus=async status=>{
    const response=await call('/api/admin/distribution/promoters/'+second.id+'/status',{status},admin,'PUT');
    assert.equal(response.status,200,response.message);
  };
  await setStatus('disabled');
  miniApp.onShow({query:{scene:secondScene}});
  await assert.rejects(appointmentApi.createAppointment(anotherPayload), error=>error.data.referralInvalid===true);
  assert.equal(referral.current(),undefined);
  assert.equal((await db.query('SELECT id FROM appointments WHERE user_id=? AND schedule_id=?',[user.user_id,anotherSlot.scheduleId])).length,0);
  pass('扫码来源停用时拒绝预约，清理无效来源并回滚预约');

  await setStatus('active');
  miniApp.onShow({query:{scene:secondScene}});
  const another=await appointmentApi.createAppointment(anotherPayload);
  const otherOrder=await ok('/api/admin/orders',{...cashier,appointment_id:another.id,pay_method:'wechat',request_id:'fixture-promoter-flow-order-03'},admin);
  assert.equal((await entries(otherOrder.order_id)).length,0);
  await simulateVerifiedPayment(otherOrder.order_id);
  assert.equal(Number((await relation())[0].parent_distributor_id),Number(promoter.id));
  assert.deepEqual((await entries(otherOrder.order_id)).map(row=>[Number(row.distributor_id),row.commission_kind,Number(row.commission_amount)]),[[Number(promoter.id),'tier',900],[Number(second.id),'referral_existing',720]]);
  pass('关联预约预支付及回调验签，篡改拒绝，合法回调重放不重复计佣，原上级得 900 分，推荐人得 Y 佣金 720 分');
  await ok('/api/admin/orders/'+order.order_id+'/offline-refund',{
    amount:9000,method:'cash',reference:'FIXTURE-REFUND',confirmed:true,refunded_at:new Date().toISOString()
  },admin);
  assert.equal((await entries(order.order_id))[0].status,'refunded');
  assert.equal(Number((await relation())[0].parent_distributor_id),Number(promoter.id));
  const afterRefund=await db.get('SELECT available_commission FROM distributors WHERE id=?',[promoter.id]);
  assert.equal(Number(afterRefund.available_commission),0);
  pass('全额退款后冲回已结算 1800 分，原推广绑定保留');

  if (matrix) {
    evidence.matrix=[];
    const check=async (id,name,run)=>{
      try { evidence.matrix.push({id,name,result:'PASS',details:await run()}); }
      catch (error) {
        evidence.matrix.push({id,name,result:error instanceof assert.AssertionError?'FAIL':'ERROR',actual:error.message});
        process.exitCode=1;
      }
    };
    await check('FLOW-11','微信出码失败仍保留后台账号，恢复后可重新取码',async()=>{
      qrUnavailable=true;
      let created;
      try {
        created=await ok('/api/admin/distribution/promoters',{nickname:'Recoverable QR',login_name:'fixture-qr-recover',password:'Fixture123'},admin);
        assert.equal(created.qr,null);
        assert.match(created.qrError,/生成失败/);
      } finally { qrUnavailable=false; }
      const recovered=await ok('/api/admin/distribution/promoters/'+created.id+'/qr',undefined,admin);
      assert.equal(qrRequest.scene,'ref='+recovered.code);
      const duplicate=await call('/api/admin/distribution/promoters',{nickname:'Duplicate',login_name:'fixture-qr-recover',password:'Fixture123'},admin);
      assert.equal(duplicate.status,409);
    });
    await check('FLOW-12','重新扫码后重试旧预约，旧来源不改写，后台详情显示原推荐人',async()=>{
      const repeat=await call('/api/v1/appointments',{...appointmentPayload,referralCode:second.qr.code},token);
      assert.equal(repeat.status,200,repeat.message);
      assert.equal(repeat.data.id,appointment.id);
      const original=await db.get('SELECT referral_promoter_id FROM appointments WHERE id=?',[appointment.id]);
      assert.equal(Number(original.referral_promoter_id),Number(promoter.id));
      const detail=await ok('/api/admin/appointments/'+appointment.id,undefined,admin);
      assert.equal(detail.referral_promoter_name,'Fixture promoter');
    });

    const {day:future}=await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY),'%Y-%m-%d') day");
    await ok('/api/admin/schedules',{doctor_id:doctor.id,store_id:store.id,date:future,period:'morning',start_time:'09:00:00',end_time:'12:00:00',slot_interval_minutes:30,people_per_slot:12},admin);
    const futureSlots=await ok('/api/v1/day-slots?doctorId='+doctor.id+'&storeId='+store.id+'&date='+future);
    const morning=futureSlots.find(item=>item.label==='09:00-09:30'&&item.status==='available');
    assert.ok(morning);
    async function newBooking(number, referralCode=qr.code, bookingSlot=morning) {
      const suffix=String(number).padStart(2,'0');
      const {access_token:buyerToken}=await ok('/api/v1/auth/wx-login',{code:'buyer-'+suffix,phoneCode:'phone-'+suffix});
      const list=await ok('/api/v1/user/family-members',undefined,buyerToken);
      const member=(Array.isArray(list)?list:list.list).find(item=>item.relation==='self');
      const booked=await ok('/api/v1/appointments',{...appointmentPayload,patientId:member.id,appointmentDate:future,
        scheduleId:bookingSlot.scheduleId,appointmentTime:bookingSlot.label,referralCode},buyerToken);
      const {user_id:buyerId}=await db.get('SELECT user_id FROM patients WHERE id=?',[member.id]);
      return {patient_id:member.id,appointment_id:booked.id,buyerId,buyerToken};
    }
    async function createProduct(name, price, fields={}) {
      return ok('/api/admin/products',{name,category:'accessory',price,status:'on',stock:30,...fields},admin);
    }
    const edges=buyer=>db.query('SELECT parent_distributor_id FROM distribution_relationships WHERE child_user_id=? AND level=1',[buyer.buyerId]);
    function checkout(buyer, lines, payAmount, discount, requestId, extra={}) {
      return {patient_id:buyer.patient_id,appointment_id:buyer.appointment_id,store_id:store.id,items:lines,
        pay_amount:payAmount,discount_amount:discount,pay_method:'cash',payment_confirmed:true,
        request_id:'fixture-promoter-matrix-'+requestId,...extra};
    }
    const single=id=>[{product_id:id,quantity:1}];
    const ordinary=await createProduct('Ordinary tier item',10001,{is_distribution:true,commission_rate_level1:10});
    const zeroX=await createProduct('Zero X item',900,{backend_referral_enabled:true,backend_rate_x:0});
    await check('FLOW-13','不参与后台推荐的商品无 X/Y 且不绑定',async()=>{
      const buyer=await newBooking(13);
      const receipt=await ok('/api/admin/orders',checkout(buyer,single(ordinary.id),10001,0,'13'),admin);
      assert.equal((await edges(buyer)).length,0);
      assert.equal((await entries(receipt.order_id)).length,0);
    });
    await check('FLOW-14','X=0 仍绑定，免单不绑定且无佣金',async()=>{
      const buyer=await newBooking(14);
      const free=await ok('/api/admin/orders',checkout(buyer,single(product.id),0,10000,'14-free'),admin);
      assert.equal((await edges(buyer)).length,0);
      assert.equal((await entries(free.order_id)).length,0);
      const zero=await ok('/api/admin/orders',checkout(buyer,single(zeroX.id),900,0,'14-zero'),admin);
      assert.equal(Number((await edges(buyer))[0].parent_distributor_id),Number(promoter.id));
      assert.equal((await entries(zero.order_id)).length,0);
    });
    await check('FLOW-15','同预约两个并发现金订单只产生一次 X 奖励',async()=>{
      const buyer=await newBooking(15);
      const make=suffix=>call('/api/admin/orders',checkout(buyer,single(product.id),10000,0,'15-'+suffix),admin);
      const pair=await Promise.all([make('a'),make('b')]);
      assert.deepEqual(pair.map(item=>item.status),[200,200],pair.map(item=>item.message).join(' / '));
      const list=(await Promise.all(pair.map(item=>entries(item.data.order_id)))).flat();
      assert.deepEqual(list.map(row=>row.commission_kind).sort(),['referral_new','tier']);
      assert.equal((await edges(buyer)).length,1);
    });
    await check('FLOW-16','关联其他账号预约的订单被拒绝，无法取得他人的推广来源',async()=>{
      const buyer=await newBooking(16);
      const result=await call('/api/admin/orders',checkout(buyer,single(product.id),10000,0,'16',{appointment_id:appointment.id}),admin);
      assert.equal(result.status,400);
      assert.equal((await edges(buyer)).length,0);
    });
    await check('FLOW-17','并行查询结算不会重复增加可用佣金，未满结算期仍冻结',async()=>{
      const before=await db.get('SELECT available_commission FROM distributors WHERE id=?',[promoter.id]);
      await ok('/api/admin/orders/'+next.order_id+'/complete',{},admin);
      await Promise.all([ok('/api/promoter/commissions',undefined,portal.token),ok('/api/promoter/commissions',undefined,portal.token)]);
      const after=await db.get('SELECT available_commission FROM distributors WHERE id=?',[promoter.id]);
      assert.equal(Number(after.available_commission)-Number(before.available_commission),900);
      assert.equal((await entries(next.order_id))[0].status,'settled');
      await ok('/api/admin/settings',{distribution_settle_days:1},admin);
      const buyer=await newBooking(17);
      const paid=await ok('/api/admin/orders',checkout(buyer,single(product.id),10000,0,'17'),admin);
      await ok('/api/admin/orders/'+paid.order_id+'/complete',{},admin);
      const [one,two]=await Promise.all([ok('/api/promoter/commissions',undefined,portal.token),ok('/api/promoter/commissions',undefined,portal.token)]);
      assert.ok(one.length&&two.length);
      assert.equal((await entries(paid.order_id))[0].status,'pending');
    });
    await ok('/api/admin/settings',{distribution_settle_days:0},admin);
    await check('FLOW-18','极值金额按精确余数分配 1 分差额',async()=>{
      const buyer=await newBooking(18);
      const eligible=await createProduct('Exact eligible item',999999991,{backend_referral_enabled:true,backend_rate_x:100});
      const excluded=await createProduct('Exact excluded item',999999999);
      const paid=await ok('/api/admin/orders',checkout(buyer,[...single(eligible.id),...single(excluded.id)],1999999989,1,'18'),admin);
      const amount=Number((await entries(paid.order_id))[0].commission_amount);
      // 999999999 > 999999991, so the eligible line receives the extra cent.
      assert.equal(amount,999999991,'精确分摊应给较大余数的推荐行多分配 1 分');
      const ledger=await db.get("SELECT calculation_snapshot FROM distribution_orders WHERE order_id=? AND commission_kind='referral_new'",[paid.order_id]);
      const lines=typeof ledger.calculation_snapshot==='string' ? JSON.parse(ledger.calculation_snapshot) : ledger.calculation_snapshot;
      assert.deepEqual(lines.map(line=>[line.paidAmount,line.amount]),[[999999991,999999991]]);
      return {orderId:paid.order_id,commissionAmount:amount,lines};
    });
    await check('FLOW-19','普通金额混合商品仅对推荐行按折后实付计 X',async()=>{
      const buyer=await newBooking(19);
      const receipt=await ok('/api/admin/orders',checkout(buyer,[...single(product.id),...single(ordinary.id)],10000,10001,'19'),admin);
      const result=await entries(receipt.order_id);
      assert.deepEqual(result.map(row=>[row.commission_kind,Number(row.commission_amount)]),[['tier',500],['referral_new',1000]]);
    });
    await check('FLOW-20','重复离线退款不会二次冲扣余额',async()=>{
      const before=await db.get('SELECT available_commission,total_commission FROM distributors WHERE id=?',[promoter.id]);
      const repeat=await call('/api/admin/orders/'+order.order_id+'/offline-refund',{
        amount:9000,method:'cash',reference:'FIXTURE-REFUND',confirmed:true,refunded_at:new Date().toISOString()
      },admin);
      assert.ok([200,400,409].includes(repeat.status),repeat.message);
      assert.deepEqual(await db.get('SELECT available_commission,total_commission FROM distributors WHERE id=?',[promoter.id]),before);
      assert.equal((await entries(order.order_id))[0].status,'refunded');
      return {httpStatus:repeat.status};
    });

    if (verifyFailures) {
      const numberOf=async(sql,args)=>Number((await db.get(sql,args)).n);
      const stockFor=id=>db.get('SELECT stock,sales_count FROM products WHERE id=?',[id]);
      const orderCount=buyer=>numberOf('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[buyer.appointment_id]);
      const withLedgerFailure=async run=>{
        // Test-only trigger in this invocation's isolated schema.
        await control.query('USE ??',[schema]);
        await control.query("CREATE TRIGGER fixture_ledger_failure AFTER INSERT ON distribution_orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture commission insert failure'");
        try { return await run(); }
        finally { await control.query('DROP TRIGGER fixture_ledger_failure'); }
      };
      await check('FLOW-22','无效推广码预约失败后，最后一个号源仍可提交',async()=>{
        const {day}=await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 4 DAY),'%Y-%m-%d') day");
        await ok('/api/admin/schedules',{doctor_id:doctor.id,store_id:store.id,date:day,period:'morning',start_time:'09:00:00',end_time:'09:30:00',slot_interval_minutes:30,people_per_slot:1},admin);
        const daySlots=()=>ok('/api/v1/day-slots?doctorId='+doctor.id+'&storeId='+store.id+'&date='+day);
        const [available]=await daySlots();
        assert.equal(available.status,'available');
        const payload={...appointmentPayload,scheduleId:available.scheduleId,appointmentDate:day,appointmentTime:available.label};
        const snapshot=async()=>({appointments:await numberOf('SELECT COUNT(*) n FROM appointments WHERE schedule_id=?',[available.scheduleId]),booked:Number((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=?',[available.scheduleId])).booked_slots)});
        const before=await snapshot();
        const rejected=await call('/api/v1/appointments',{...payload,referralCode:'BP'+'f'.repeat(24)},token);
        assert.equal(rejected.status,400,rejected.message);
        assert.equal(rejected.referralInvalid,true,rejected.message);
        const afterFailure=await snapshot();
        assert.deepEqual(afterFailure,before);
        assert.equal((await daySlots())[0].status,'available');
        const booked=await ok('/api/v1/appointments',{...payload,referralCode:qr.code},token);
        const afterRetry=await snapshot();
        assert.deepEqual(afterRetry,{appointments:1,booked:1});
        assert.equal((await db.get('SELECT referral_code FROM appointments WHERE id=?',[booked.id])).referral_code,qr.code);
        return {httpStatus:rejected.status,before,afterFailure,afterRetry};
      });
      await check('FLOW-23','第二项库存不足阻断收银订单并回滚第一项库存',async()=>{
        const buyer=await newBooking(23);
        const first=await createProduct('Rollback stocked item',1500,{stock:1});
        const secondItem=await createProduct('Rollback scarce item',2000,{stock:1});
        const countLines=()=>numberOf('SELECT COUNT(*) n FROM order_items WHERE product_id IN (?,?)',[first.id,secondItem.id]);
        const snapshot=async()=>({orders:await orderCount(buyer),lines:await countLines(),first:await stockFor(first.id),second:await stockFor(secondItem.id),edges:(await edges(buyer)).length});
        const before=await snapshot();
        const rejected=await call('/api/admin/orders',checkout(buyer,[...single(first.id),{product_id:secondItem.id,quantity:2}],5500,0,'23'),admin);
        assert.equal(rejected.status,409,rejected.message);
        assert.match(rejected.message,/库存不足/);
        const afterFailure=await snapshot();
        assert.deepEqual(afterFailure,before);
        await ok('/api/admin/orders',checkout(buyer,[...single(first.id),...single(secondItem.id)],3500,0,'23'),admin);
        const afterRetry=await snapshot();
        assert.deepEqual(afterRetry,{orders:1,lines:2,first:{stock:0,sales_count:1},second:{stock:0,sales_count:1},edges:0});
        return {httpStatus:rejected.status,before,afterFailure,afterRetry};
      });
      await check('FLOW-24','微信预支付失败保留待付订单，同一订单可重试',async()=>{
        const item=await createProduct('Prepay retry item',2300,{stock:2});
        const created=await ok('/api/v1/orders',{items:[{productId:item.id,quantity:1}],shippingAddress:{deliveryMethod:'pickup',storeId:store.id,contactName:'Fixture',phone:'13800009101'}},token);
        const path='/api/v1/orders/'+created.id+'/pay';
        const snapshot=async()=>({order:await db.get('SELECT status,pay_at,wechat_prepay_id FROM orders WHERE id=?',[created.id]),stock:await stockFor(item.id),ledger:(await entries(created.id)).length});
        const before=await snapshot();
        let rejected, firstTrade;
        failPrepay=true;
        try { rejected=await call(path,{},token); firstTrade=prepayRequest.out_trade_no; }
        finally { failPrepay=false; }
        assert.ok(rejected.status>=400,rejected.message);
        assert.equal(rejected.data,undefined);
        const afterFailure=await snapshot();
        assert.deepEqual(afterFailure,{...before,order:{status:'pending',pay_at:null,wechat_prepay_id:'REQUESTING'}});
        const retried=await ok(path,{},token);
        assert.equal(retried.package,'prepay_id=fixture-prepay');
        assert.equal(prepayRequest.out_trade_no,firstTrade);
        const afterRetry=await snapshot();
        assert.deepEqual(afterRetry,afterFailure);
        await simulateVerifiedPayment(created.id);
        const afterPayment=await snapshot();
        assert.equal(afterPayment.order.status,'paid');
        assert.ok(afterPayment.order.pay_at);
        assert.equal(Number(afterPayment.stock.sales_count),1);
        assert.equal(afterPayment.ledger,0);
        return {httpStatus:rejected.status,tradeNo:firstTrade,before,afterFailure,afterRetry,afterPayment};
      });
      await check('FLOW-25','分佣插入失败回滚现金订单、库存、绑定、转化和账本',async()=>{
        const buyer=await newBooking(25);
        const item=await createProduct('Commission rollback item',4200,{stock:2,backend_referral_enabled:true,backend_rate_x:20});
        const snapshot=async()=>({orders:await orderCount(buyer),lines:await numberOf('SELECT COUNT(*) n FROM order_items WHERE product_id=?',[item.id]),stock:await stockFor(item.id),edges:(await edges(buyer)).length,conversions:await numberOf('SELECT COUNT(*) n FROM promoter_conversions WHERE appointment_id=?',[buyer.appointment_id]),ledger:await numberOf('SELECT COUNT(*) n FROM distribution_orders WHERE distributor_id=?',[promoter.id]),balance:await db.get('SELECT total_commission,available_commission FROM distributors WHERE id=?',[promoter.id])});
        const body=checkout(buyer,single(item.id),4200,0,'25');
        const before=await snapshot();
        const rejected=await withLedgerFailure(()=>call('/api/admin/orders',body,admin));
        assert.equal(rejected.status,500,rejected.message);
        const afterFailure=await snapshot();
        assert.deepEqual(afterFailure,before);
        const retry=await ok('/api/admin/orders',body,admin);
        const repeat=await ok('/api/admin/orders',body,admin);
        assert.equal(retry.order_id,repeat.order_id);
        const afterRetry=await snapshot();
        assert.equal(afterRetry.orders,1);
        assert.equal(afterRetry.lines,1);
        assert.deepEqual(afterRetry.stock,{stock:1,sales_count:1});
        assert.equal(afterRetry.edges,1);
        assert.equal(afterRetry.conversions,1);
        assert.equal(afterRetry.ledger,before.ledger+1);
        assert.equal(Number(afterRetry.balance.total_commission)-Number(before.balance.total_commission),840);
        assert.equal(afterRetry.balance.available_commission,before.balance.available_commission);
        assert.deepEqual((await entries(retry.order_id)).map(x=>[Number(x.commission_amount),x.status]),[[840,'pending']]);
        return {httpStatus:rejected.status,before,afterFailure,afterRetry,commission:840};
      });
    }
    if (audit) {
      const productState=id=>db.get('SELECT stock,sales_count FROM products WHERE id=?',[id]);
      const ledgerState=async (id,buyer,item)=>({
        order:await db.get('SELECT status,pay_at,wechat_transaction_id,distribution_processed FROM orders WHERE id=?',[id]),
        stock:await productState(item.id),
        entries:await entries(id),edges:await edges(buyer),
        conversion:await db.get('SELECT order_id,mode FROM promoter_conversions WHERE appointment_id=?',[buyer.appointment_id]) ?? null,
        balance:await db.get('SELECT total_commission,available_commission FROM distributors WHERE id=?',[promoter.id])
      });
      const online=async (buyer,item,key)=>{
        const {order_id:id}=await ok('/api/admin/orders',checkout(buyer,single(item.id),Number(item.fixturePrice),0,key,{pay_method:'wechat'}),admin);
        await ok('/api/v1/orders/'+id+'/pay',{},buyer.buyerToken);
        return db.get('SELECT * FROM orders WHERE id=?',[id]);
      };
      const send=async(order,patch)=>{
        const {body,notify}=prepareNotification(order,patch);
        const response=await notify(body);
        return {status:response.status,...await response.json()};
      };
      await check('FLOW-26','微信回调分佣故障后恢复、并发重放只入账一次',async()=>{
        const buyer=await newBooking(26);
        const item={...await createProduct('Online commission rollback',3400,{stock:2,backend_referral_enabled:true,backend_rate_x:20}),fixturePrice:3400};
        const order=await online(buyer,item,'26');
        const snapshot=()=>ledgerState(order.id,buyer,item);
        const before=await snapshot();
        await control.query('USE ??',[schema]);
        await control.query("CREATE TRIGGER fixture_online_ledger_failure AFTER INSERT ON distribution_orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture online commission write failure'");
        let failed;
        try {failed=await send(order);}
        finally {await control.query('DROP TRIGGER fixture_online_ledger_failure');}
        const afterFailure=await snapshot();
        evidence.onlineRollback={before,afterFailure,failed};
        assert.equal(failed.status,500,failed.message);
        assert.match(failed.message,/fixture online commission write failure/);
        assert.deepEqual(afterFailure,before);
        const retries=await Promise.all([send(order),send(order)]);
        const afterRetry=await snapshot();
        Object.assign(evidence.onlineRollback,{retries,afterRetry});
        assert.deepEqual(retries.map(x=>x.status),[200,200]);
        assert.equal(afterRetry.order.status,'paid');
        assert.ok(afterRetry.order.pay_at);
        assert.equal(afterRetry.order.distribution_processed,1);
        assert.deepEqual(afterRetry.stock,{stock:1,sales_count:1});
        assert.deepEqual(afterRetry.entries.map(row=>[Number(row.commission_amount),row.status]),[[680,'pending']]);
        assert.equal(afterRetry.edges.length,1);
        assert.equal(afterRetry.conversion.mode,'new');
        assert.equal(Number(afterRetry.balance.total_commission)-Number(before.balance.total_commission),680);
        assert.equal(afterRetry.balance.available_commission,before.balance.available_commission);
      });
      await check('FLOW-27','签名有效但金额、币种或交易状态不符不入账',async()=>{
        const buyer=await newBooking(27);
        const item={...await createProduct('Payment validation item',2500,{stock:2,backend_referral_enabled:true,backend_rate_x:20}),fixturePrice:2500};
        const order=await online(buyer,item,'27');
        const before=await ledgerState(order.id,buyer,item);
        const receiptResults=[];
        for (const [name,patch,expected] of [
          ['少付',{amount:{currency:'CNY',total:2499}},409],['多付',{amount:{currency:'CNY',total:2501}},409],
          ['币种',{amount:{currency:'USD',total:2500}},409],['未成功',{trade_state:'NOTPAY'},200]
        ]) {
          const response=await send(order,patch);
          const persisted=await ledgerState(order.id,buyer,item);
          receiptResults.push({name,response,persisted});
          evidence.paymentValidation={before,receiptResults};
          assert.equal(response.status,expected,name);
          assert.deepEqual(persisted,before,name);
        }
        assert.equal((await send(order)).status,200);
        const paid=await ledgerState(order.id,buyer,item);
        evidence.paymentValidation.paid=paid;
        assert.equal(paid.order.status,'paid');
        assert.deepEqual(paid.entries.map(row=>Number(row.commission_amount)),[500]);
      });
      await check('FLOW-28','已取消预约拒绝新建收银订单',async()=>{
        const buyer=await newBooking(28);
        const item=await createProduct('Cancelled booking item',1800,{stock:2,backend_referral_enabled:true,backend_rate_x:20});
        await ok('/api/v1/appointments/'+buyer.appointment_id+'/cancel',{reason:'fixture cancellation'},buyer.buyerToken);
        const appointmentState=await db.get('SELECT status FROM appointments WHERE id=?',[buyer.appointment_id]);
        assert.equal(appointmentState.status,'cancelled');
        const before=await productState(item.id);
        const rejected=await call('/api/admin/orders',checkout(buyer,single(item.id),1800,0,'28'),admin);
        const after=await productState(item.id);
        const orders=await db.query('SELECT id,status FROM orders WHERE appointment_id=?',[buyer.appointment_id]);
        evidence.cancelledBooking={appointmentState,before,after,rejected,orders};
        assert.equal(rejected.status,409,rejected.message);
        assert.deepEqual(after,before);
        assert.deepEqual(orders,[]);
      });
      await check('FLOW-29','同一微信流水号不能给两个订单重复计佣',async()=>{
        const buyer=await newBooking(29);
        const item={...await createProduct('Payment reference item',1600,{stock:3,backend_referral_enabled:true,backend_rate_x:20,is_distribution:true,commission_rate_level1:10}),fixturePrice:1600};
        const first=await online(buyer,item,'29-first');
        const secondOrder=await online(buyer,item,'29-second');
        const sharedId='fixture-shared-transaction';
        assert.equal((await send(first,{transaction_id:sharedId})).status,200);
        const before=await ledgerState(secondOrder.id,buyer,item);
        const response=await send(secondOrder,{transaction_id:sharedId});
        const after=await ledgerState(secondOrder.id,buyer,item);
        evidence.duplicatePayment={before,response,after,orders:await db.query('SELECT id,status,wechat_transaction_id FROM orders WHERE wechat_transaction_id=? ORDER BY id',[sharedId])};
        assert.deepEqual(after,before,'同一上游流水的第二次入账不应改变订单或佣金');
        assert.equal(response.status,409,response.message);
        if (!verifyPaymentClaim) return;
        const originalState=await ledgerState(first.id,buyer,item);
        const replay=await send(first,{transaction_id:sharedId});
        assert.equal(replay.status,200);
        assert.deepEqual(await ledgerState(first.id,buyer,item),originalState);
        // Model an order paid before the claim table was introduced.
        await db.run('DELETE FROM order_wechat_payment_claims WHERE transaction_id=?',[sharedId]);
        const historicalConflict=await send(secondOrder,{transaction_id:sharedId});
        assert.equal(historicalConflict.status,409);
        assert.deepEqual(await ledgerState(secondOrder.id,buyer,item),before);
        assert.equal((await send(first,{transaction_id:sharedId})).status,200);
        assert.deepEqual(await ledgerState(first.id,buyer,item),originalState);
        Object.assign(evidence.duplicatePayment,{replay,historicalConflict});
      });
      if (verifyPaymentClaim) await check('FLOW-29-CONCURRENT','不同预约并发认领同一流水时只有一个订单入账',async()=>{
        const alternate=futureSlots.find(slot=>slot.label==='09:30-10:00'&&slot.status==='available');
        assert.ok(alternate);
        const buyers=[await newBooking(30,qr.code,alternate),await newBooking(31,qr.code,alternate)];
        const item={...await createProduct('Concurrent payment claim',1700,{stock:3,backend_referral_enabled:true,backend_rate_x:20}),fixturePrice:1700};
        const orders=await Promise.all(buyers.map((buyer,index)=>online(buyer,item,'29-concurrent-'+index)));
        const sharedId='fixture-concurrent-transaction';
        const results=await Promise.all(orders.map(order=>send(order,{transaction_id:sharedId})));
        const states=await Promise.all(orders.map((order,index)=>ledgerState(order.id,buyers[index],item)));
        evidence.concurrentPayment={results,states};
        assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
        assert.deepEqual(states.map(x=>x.order.status).sort(),['paid','pending']);
        assert.equal(states[0].stock.sales_count,1);
        assert.deepEqual(states.flatMap(x=>x.entries).map(row=>Number(row.commission_amount)),[340]);
        const losing=states[results.findIndex(x=>x.status===409)];
        assert.equal(losing.order.pay_at,null);
        assert.equal(losing.order.wechat_transaction_id,null);
        assert.equal(losing.edges.length,0);
        assert.equal(losing.conversion,null);
        if (!regressPaymentClaim) return;
        const losingIndex=results.findIndex(x=>x.status===409);
        const retry=await send(orders[losingIndex]);
        assert.equal(retry.status,200);
        const recovered=await ledgerState(orders[losingIndex].id,buyers[losingIndex],item);
        assert.equal(recovered.order.status,'paid');
        assert.equal(recovered.order.wechat_transaction_id,'FIXTURE-WXPAY-'+orders[losingIndex].id);
        assert.equal(recovered.stock.sales_count,2);
        assert.deepEqual(recovered.entries.map(x=>Number(x.commission_amount)),[340]);
        assert.equal(Number(recovered.balance.total_commission)-Number(losing.balance.total_commission),340);
        assert.equal((await send(orders[losingIndex])).status,200);
        assert.deepEqual(await ledgerState(orders[losingIndex].id,buyers[losingIndex],item),recovered);
        Object.assign(evidence.concurrentPayment,{retry,recovered});
      });
    }
    if (verifyFixes) {
      const path='/api/admin/distribution/promoters/'+promoter.id+'/qr';
      const readCache=()=>db.get('SELECT image,qr_environment,qr_app_id FROM promoter_codes WHERE code=?',[qr.code]);
      await check('FLOW-21A','上游返回不可解压 PNG 时拒绝出码且无缓存写入',async()=>{
        await db.run('UPDATE promoter_codes SET image=NULL WHERE code=?',[qr.code]);
        invalidQrResponse=true;
        try {
          const rejected=await call(path,undefined,admin);
          assert.equal(rejected.status,503,rejected.message);
          assert.equal((await readCache()).image,null);
          return {httpStatus:rejected.status,cacheIsNull:true};
        } finally { invalidQrResponse=false; }
      });
      await check('FLOW-21B','已存在的坏缓存只在新图验证成功后覆盖并复用',async()=>{
        await db.run('UPDATE promoter_codes SET image=?,qr_environment=?,qr_app_id=? WHERE code=?',[invalidQr,'trial','fixture-app',qr.code]);
        const initialRequests=qrRequests;
        invalidQrResponse=true;
        let rejected;
        try {
          rejected=await call(path,undefined,admin);
          assert.equal(rejected.status,503,rejected.message);
          assert.deepEqual((await readCache()).image,invalidQr);
        } finally { invalidQrResponse=false; }
        const refreshed=await ok(path,undefined,admin);
        const saved=await readCache();
        assert.deepEqual(saved.image,validQr);
        assert.equal(saved.qr_environment,'trial');
        assert.equal(saved.qr_app_id,'fixture-app');
        assert.equal(refreshed.image,'data:image/png;base64,'+validQr.toString('base64'));
        assert.deepEqual(await ok(path,undefined,admin),refreshed);
        assert.equal(qrRequests-initialRequests,2);
        return {upstreamRequests:2,rejectedStatus:rejected.status,replacementBytes:saved.image.length,reused:true};
      });
    }
  }
} catch (error) {
  evidence.failure=error.message;
  throw error;
} finally {
  try {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await db?.closePool();
    if(created){await control.query('DROP DATABASE '+schema);evidence.cleaned=true;}
  } finally {
    await control.end();
    const out=new URL('./artifacts/backend-promoter-flow-2026-11-18/',import.meta.url);
    mkdirSync(out,{recursive:true});
    writeFileSync(new URL(localRetest?'2026-11-19-local-retest-mysql.json':regressPaymentClaim?'2026-11-19-flow29-independent.json':verifyPaymentClaim?'2026-11-19-flow29-isolated-selftest.json':audit?'2026-11-19-isolated-full-audit.json':verifyFailures?'2026-11-19-isolated-failures.json':verifyFixes?'2026-11-19-isolated-flow-18-21.json':matrix?'full-matrix-database.json':'database.json',out),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  }
}
