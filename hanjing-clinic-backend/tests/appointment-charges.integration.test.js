import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

test('independent appointment charges and refunds preserve legacy orders and scope', { skip: !process.env.TEST_DB_PASSWORD }, async t => {
  const schema = 'hanjing_test_charges_' + Date.now();
  const options = { host: '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD };
  const control = await mysql.createConnection(options);
  let db, server;
  await control.query('CREATE DATABASE ' + schema);
  try {
    Object.assign(process.env, { DB_HOST: options.host, DB_PORT: '3306', DB_USER: options.user, DB_PASSWORD: options.password, DB_NAME: schema, NODE_ENV: 'test' });
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const apiV3Key = '0123456789abcdef0123456789abcdef';
    Object.assign(process.env, {
      WECHAT_APP_ID:'test-app', WECHAT_PAY_MCH_ID:'test-mch', WECHAT_PAY_SERIAL_NO:'test-serial',
      WECHAT_PAY_PRIVATE_KEY:privateKey.export({ type:'pkcs8',format:'pem' }),
      WECHAT_PAY_PLATFORM_CERT:publicKey.export({ type:'spki',format:'pem' }),
      WECHAT_PAY_API_V3_KEY:apiV3Key, WECHAT_PAY_NOTIFY_URL:'https://test.invalid/callback'
    });
    db = await import('../db.js');
    await db.initDB();
    const [{ default: admin }, { default: client }, { JWT_SECRET, hashPassword }, billing, workflow, report, { default: promoter }] = await Promise.all([
      import('../routes/admin.js'), import('../routes/client.js'), import('../helpers.js'),
      import('../appointment-charges.js'), import('../appointment-workflow.js'), import('../operations-report.js'), import('../routes/backend-promoter.js')
    ]);
    const app = express();
    for (const path of ['/api/v1/appointments/pay-callback','/api/v1/orders/pay-callback','/api/v1/pay/refund-callback']) {
      app.use(path, express.raw({ type:'application/json' }));
    }
    app.use(express.json(), admin, client, promoter);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });

    await control.query('USE ' + schema);
    await control.query("INSERT INTO roles(id,name,code,status) VALUES(1000,'Charge admin','super_admin','active'),(1001,'Charge staff','charge_staff','active')");
    await control.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1000,'charge-admin','unused','Admin',1000,'online'),(1001,'charge-staff','unused','Staff',1001,'online')");
    await control.query("INSERT INTO permissions(role_id,permission_resource) VALUES(1001,'appointment:view'),(1001,'appointment:edit')");
    await control.query("INSERT INTO stores(id,name,code,address) VALUES(1,'One','ONE','One'),(2,'Two','TWO','Two')");
    await control.query('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(1001,2)');
    // Explicit fixture scopes: role defaults are now personal, including test roles.
    await control.query('UPDATE roles SET data_scope=? WHERE id=1000',[JSON.stringify({type:"system",all_stores:false,store_ids:[]})]);
    await control.query('UPDATE roles SET data_scope=? WHERE id=1001',[JSON.stringify({type:"store",all_stores:false,store_ids:[2]})]);
    await control.query("INSERT INTO users(id,openid,nickname) VALUES(1,'charge-user','One'),(2,'other-user','Other')");
    await control.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'One','self','CHARGE-P1')");
    await control.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'Doctor','Doctor','Sleep')");
    await control.query("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(1,1,1,CURDATE(),'morning','09:00','12:00')");
    const year = new Date().getFullYear();
    for (const [id, fee, deposit] of [[1,2000,5000],[2,0,5000],[3,2000,0],[4,0,5000],[5,2000,0],[6,0,1000]]) {
      await control.query("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status,consult_fee,deposit_amount) VALUES(?,?,1,1,1,1,1,DATE_ADD(CURDATE(),INTERVAL 1 DAY),'10:00-10:30','pending_payment',?,?)", [id,'CHARGE-A'+id,fee,deposit]);
    }
    const root = jwt.sign({ id:1000, role:'super_admin', token_version:0 }, JWT_SECRET);
    const staff = jwt.sign({ id:1001, role:'charge_staff', token_version:0 }, JWT_SECRET);
    const patient = jwt.sign({ id:1, openid:'charge-user' }, JWT_SECRET);
    const other = jwt.sign({ id:2, openid:'other-user' }, JWT_SECRET);
    async function api(path, token = root, body, method = body ? 'POST' : 'GET') {
      const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method, headers:{ authorization:'Bearer ' + token, 'content-type':'application/json' },
        body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(15000)
      });
      return { status:response.status, body:await response.json() };
    }
    const adminPath = id => '/api/admin/appointments/' + id + '/charges';
    const patientPath = id => '/api/v1/appointments/' + id;
    async function loadAppointment(id) {
      return db.get('SELECT * FROM appointments WHERE id=?',[id]);
    }
    async function prepare(id) {
      return db.transaction(async conn => billing.prepareCharge(conn, await billing.lockChargeAppointment(conn,id),'wechat'));
    }
    const payment = (charge, transactionId) => ({ trade_state:'SUCCESS', out_trade_no:charge.charge_no,
      transaction_id:transactionId, amount:{currency:'CNY',total:billing.chargeAmount(charge)} });

    async function callback(path, payload, valid = true) {
      const nonce = '0123456789ab';
      const associatedData = 'test';
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
      cipher.setAAD(Buffer.from(associatedData));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString('base64');
      const body = JSON.stringify({ resource:{ nonce, associated_data:associatedData, ciphertext } });
      const timestamp = String(Math.floor(Date.now()/1000));
      const signed = [timestamp, nonce, body, ''].join('\n');
      const signature = valid ? crypto.sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64') : 'invalid';
      return fetch('http://127.0.0.1:' + server.address().port + '/api/v1' + path, { method:'POST', body,
        headers:{ 'content-type':'application/json', 'wechatpay-timestamp':timestamp, 'wechatpay-nonce':nonce, 'wechatpay-signature':signature },
        signal:AbortSignal.timeout(15000) });
    }

    await t.test('cash and offline charge snapshots, concurrency and access boundaries', async () => {
      assert.equal((await api(adminPath(1),staff)).status,404);
      assert.equal((await api(adminPath(1),staff,{method:'cash',payment_confirmed:true})).status,403);
      assert.equal((await api(adminPath(1),root,{method:'cash'})).status,400);
      assert.equal((await api(adminPath(1),root,{method:'offline',payment_confirmed:true})).status,400);
      const receipts = await Promise.all([api(adminPath(1),root,{method:'cash',payment_confirmed:true}),api(adminPath(1),root,{method:'cash',payment_confirmed:true})]);
      assert.deepEqual(receipts.map(item=>item.status).sort(),[200,409]);
      const charge = receipts.find(item=>item.status===200).body.data;
      assert.equal(charge.status,'paid');
      assert.equal((await db.get("SELECT COUNT(*) n FROM audit_logs WHERE action='collect_appointment_charge' AND target_id='1'")).n,1);
      assert.equal(billing.chargeAmount(charge),7000);
      assert.equal((await loadAppointment(1)).status,'pending');
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders')).n,0);
      await db.transaction(async conn => workflow.assertAppointmentFeesPaid(conn, await loadAppointment(1)));
      const detail = await api(patientPath(1),patient);
      assert.equal(detail.status,200,JSON.stringify(detail.body));
      assert.equal(detail.body.data.appointment.appointmentCharge.amount,7000);
      assert.equal((await api(patientPath(1),other)).status,404);
      const offline = await api(adminPath(3),root,{method:'offline',payment_confirmed:true,payment_reference:'offline-proof'});
      assert.equal(offline.status,200,JSON.stringify(offline.body));
      assert.equal((await db.get('SELECT payment_reference FROM appointment_charges WHERE appointment_id=3')).payment_reference,'offline-proof');
    });

    await t.test('clinical settlement accepts an independent paid receipt without a product order', async () => {
      await db.run("UPDATE appointments SET status='completed' WHERE id=3");
      const result = await api('/api/admin/appointments/3',root,{status:'arrived'},'PUT');
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal((await loadAppointment(3)).status,'arrived');
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=3')).n,0);
    });

    await t.test('settle verified online payment and sync through existing patient endpoint', async () => {
      const charge = await prepare(2);
      await assert.rejects(billing.settleOnlineCharge({ ...payment(charge,'mismatch'), amount:{currency:'CNY',total:1} }), /不一致/);
      const payload = payment(charge,'WX-CHARGE-2');
      assert.equal((await callback('/appointments/pay-callback',payload,false)).status,401);
      const result = await Promise.all([callback('/appointments/pay-callback',payload),callback('/appointments/pay-callback',payload)]);
      assert.deepEqual(result.map(item=>item.status),[200,200]);
      assert.equal((await db.get("SELECT COUNT(*) n FROM appointment_charges WHERE appointment_id=2 AND status='paid'")).n,1);
      assert.equal((await api(patientPath(2)+'/confirm-pay',patient,{})).status,200);
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders')).n,0);
      assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='appointment' AND business_id='2' AND event_code='paid'")).n,1);
    });

    await t.test('cancel, offline refund confirmation and late verified online receipts', async () => {
      const charge = await prepare(4);
      const cancel = await api(patientPath(4)+'/cancel',patient,{reason:'取消'});
      assert.equal(cancel.status,200,JSON.stringify(cancel.body));
      assert.equal((await billing.settleOnlineCharge(payment(charge,'WX-CHARGE-4'))).status,'refund_pending');
      const refund = await db.get('SELECT * FROM appointment_charge_refunds WHERE charge_id=?',[charge.id]);
      assert.equal(refund.status,'pending');
      assert.equal((await loadAppointment(4)).status,'cancelled');
      let refundPayload;
      const refundResult = await billing.submitChargeRefund(4,charge.id,'取消',()=>{},async request => {
        refundPayload = {out_refund_no:request.outRefundNo,out_trade_no:charge.charge_no,transaction_id:'WX-CHARGE-4',
          refund_id:'WX-REFUND-4',amount:{currency:'CNY',total:5000,refund:5000}};
        return { ...refundPayload, status:'PROCESSING' };
      });
      assert.equal(refundResult.status,'refunding');
      assert.equal((await callback('/pay/refund-callback',{...refundPayload,refund_status:'ABNORMAL'})).status,200);
      assert.equal((await db.get('SELECT status FROM appointment_charge_refunds WHERE charge_id=?',[charge.id])).status,'abnormal');
      const completed = await callback('/pay/refund-callback',{...refundPayload,refund_status:'SUCCESS'});
      assert.equal(completed.status,200);
      assert.equal((await callback('/pay/refund-callback',{...refundPayload,refund_status:'SUCCESS'})).status,200);
      assert.equal((await db.get('SELECT status FROM appointment_charges WHERE id=?',[charge.id])).status,'refunded');
      for (const event of ['refund_pending','payment_conflict','refund_failed','refunded']) assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='appointment' AND business_id='4' AND event_code=?",[event])).n,1);
      const activeCharge = await db.get('SELECT * FROM appointment_charges WHERE appointment_id=1');
      const noRefund = await api(adminPath(1)+'/'+activeCharge.id+'/refund',root,{reason:'预约仍有效',offline_confirmed:true});
      assert.equal(noRefund.status,409);
      assert.equal((await api(patientPath(1)+'/cancel',patient,{reason:'取消'})).status,200);
      assert.equal((await api(adminPath(1)+'/'+activeCharge.id+'/refund',root,{reason:'取消'})).status,400);
      assert.equal((await api(adminPath(1)+'/'+activeCharge.id+'/refund',root,{reason:'取消',offline_confirmed:true})).status,200);
      assert.equal((await api(patientPath(1),patient)).body.data.appointment.appointmentCharge.refundedAmount,7000);
      assert.equal((await db.get("SELECT COUNT(*) n FROM audit_logs WHERE action='refund_appointment_charge' AND target_id='1'")).n,1);
    });

    await t.test('Native callback and operator cancellation are independently recorded', async () => {
      const charge = await db.transaction(async conn => billing.prepareCharge(conn, await billing.lockChargeAppointment(conn,6),'wechat_native'));
      assert.equal((await callback('/orders/pay-callback',payment(charge,'WX-CHARGE-6'))).status,200);
      const cancelled = await api('/api/admin/appointments/6',root,{status:'cancelled',cancel_reason:'改期'},'PUT');
      assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
      const response = await api(adminPath(6));
      assert.equal(response.body.data.charges[0].status,'refund_pending');
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=6')).n,0);
    });

    await t.test('legacy paid orders remain accessible and prevent separate billing', async () => {
      await control.query("INSERT INTO orders(order_no,user_id,type,total_amount,discount_amount,pay_amount,pay_method,pay_at,status,appointment_id) VALUES('CHARGE-OLD',1,'appointment_deposit',2000,0,2000,'wechat',CURRENT_TIMESTAMP,'paid',5)");
      const response = await api(adminPath(5));
      assert.ok(response.body.data.legacy_order_id);
      assert.equal((await api(adminPath(5),root,{method:'cash',payment_confirmed:true})).status,409);
      await db.transaction(async conn => workflow.assertAppointmentFeesPaid(conn,await loadAppointment(5)));
      const result = await report.readStoreReport({role:'super_admin'},{year,store_id:1});
      assert.equal(result.months.reduce((sum,row)=>sum+row.receipts,0),22000);
      assert.equal(result.months.reduce((sum,row)=>sum+row.refunds,0),12000);
      const {readPatientActivity} = await import('../patient-activity.js');
      const activity = await readPatientActivity({role:'super_admin'},1);
      assert.equal(activity.receipts,22000);
      assert.equal(activity.refunds,12000);
      assert.equal((await readPatientActivity({role:'charge_staff',store_ids:[2]},1)).receipts,0);
    });
    await t.test('promoter conversion excludes independent charges and both types of historical fee-only orders', async () => {
      await control.query("INSERT INTO distributors(id,source_type,nickname,invite_code,status) VALUES(99,'backend','Fixture','CHARGE-R','active')");
      await control.query("INSERT INTO promoter_accounts(distributor_id,login_name,password_hash) VALUES(99,'charge-promoter',?)",[hashPassword('FixturePass123')]);
      await control.query('UPDATE appointments SET referral_promoter_id=99 WHERE id IN (2,5)');
      await control.query("INSERT INTO products(id,name,category,image_url,price,status) VALUES(90,'Historical appointment service','service','',2000,'on'),(91,'Retail item','accessory','',1000,'on')");
      const fees = JSON.stringify({appointment_fees:{version:1,consult_fee:2000,deposit_amount:0}});
      const [oldFee] = await control.query("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,pay_method,pay_at,status,appointment_id,cashier_context) VALUES('CHARGE-OLD-CASHIER',1,'offline',2000,2000,'cash',CURRENT_TIMESTAMP,'paid',5,?)",[fees]);
      await control.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,90,'Historical appointment service',2000,1)",[oldFee.insertId]);
      const login = await api('/api/promoter/login',root,{account:'charge-promoter',password:'FixturePass123'});
      assert.equal(login.status,200,JSON.stringify(login.body));
      const read = async () => {
        const response = await api('/api/promoter/patients',login.body.data.token);
        assert.equal(response.status,200,JSON.stringify(response.body));
        return response.body.data.list.map(row=>[row.id,row.progressCode]);
      };
      assert.deepEqual(await read(),[['5','appointed'],['2','appointed']]);
      const [retail] = await control.query("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,pay_method,pay_at,status,appointment_id,cashier_context) VALUES('CHARGE-MIXED',1,'offline',3000,3000,'cash',CURRENT_TIMESTAMP,'paid',5,?)",[fees]);
      await control.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,90,'Historical appointment service',2000,1),(?,91,'Retail item',1000,1)",[retail.insertId,retail.insertId]);
      assert.deepEqual(await read(),[['5','purchased'],['2','appointed']]);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.closePool();
    await control.query('DROP DATABASE ' + schema);
    await control.end();
  }
});
