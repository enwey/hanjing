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
const matrix = process.argv.includes('--full-matrix');
let qrUnavailable = false;
let qrRequest;
let prepayRequest;
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
      const response=JSON.stringify({prepay_id:'fixture-prepay'});
      return new Response(response,{headers:signedHeaders(response)});
    }
    if (u.hostname === 'api.weixin.qq.com') {
      if (u.pathname === '/wxa/getwxacodeunlimit') {
        qrRequest=JSON.parse(options.body);
        if (qrUnavailable) return Response.json({errcode:45009,errmsg:'fixture unavailable'});
        return new Response(Buffer.from([137,80,78,71,13,10,26,10]));
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
  const simulateVerifiedPayment=async id=>{
    const order=await db.get('SELECT * FROM orders WHERE id=?',[id]);
    const params=await ok('/api/v1/orders/'+id+'/pay',{},token);
    assert.equal(params.package,'prepay_id=fixture-prepay');
    assert.equal(params.signType,'RSA');
    assert.equal(prepayRequest.out_trade_no,order.order_no);
    assert.equal(prepayRequest.amount.total,Number(order.pay_amount));
    assert.equal(prepayRequest.payer.openid,'fixture-booking-user');
    const receipt={trade_state:'SUCCESS',out_trade_no:order.order_no,amount:{currency:'CNY',total:Number(order.pay_amount)},transaction_id:'FIXTURE-WXPAY-'+id};
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
    async function newBooking(number, referralCode=qr.code) {
      const suffix=String(number).padStart(2,'0');
      const {access_token:buyerToken}=await ok('/api/v1/auth/wx-login',{code:'buyer-'+suffix,phoneCode:'phone-'+suffix});
      const list=await ok('/api/v1/user/family-members',undefined,buyerToken);
      const member=(Array.isArray(list)?list:list.list).find(item=>item.relation==='self');
      const booked=await ok('/api/v1/appointments',{...appointmentPayload,patientId:member.id,appointmentDate:future,
        scheduleId:morning.scheduleId,appointmentTime:morning.label,referralCode},buyerToken);
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
    writeFileSync(new URL(matrix?'full-matrix-database.json':'database.json',out),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  }
}
