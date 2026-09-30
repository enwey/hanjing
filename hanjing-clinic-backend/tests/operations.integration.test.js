import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('operations uses verified records, current permissions and real workflow states', async t => {
  const schema = 'hanjing_test_operations_' + Date.now();
  const source = process.env.TEST_SCHEMA_SOURCE || 'hanjing_clinic';
  assert.match(source, /^[a-zA-Z0-9_]+$/);
  const admin = await mysql.createConnection({ host: '127.0.0.1', port: 3306,
    user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || 'root' });
  let db, server;
  await admin.query('CREATE DATABASE ' + schema);
  try {
    const [tables] = await admin.query('SHOW TABLES FROM ' + source);
    for (const table of tables) {
      const name = Object.values(table)[0];
      assert.match(name, /^[a-zA-Z0-9_]+$/);
      await admin.query('CREATE TABLE ' + schema + '.' + name + ' LIKE ' + source + '.' + name);
    }
    await admin.query('USE ' + schema);
    await admin.query("SET time_zone = '+08:00'");
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: schema,
      DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'root' });
    db = await import('../db.js');
    const helpers = await import('../helpers.js');
    const refunds = await import('../refunds.js');
    const report = await import('../operations-report.js');
    const pay = await import('../wechatPay.js');
    const app = express();
    app.use(express.json());
    app.use((await import('../routes/admin.js')).default);
    app.use((await import('../routes/client.js')).default);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const api = async (path, token, body, method = body ? 'POST' : 'GET') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    await admin.query("INSERT INTO roles(id,name,code,status) VALUES(1,'Admin','super_admin','active'),(2,'Staff','receptionist','active')");
    await admin.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status,store_id) VALUES(1,'test-admin','unused','Admin',1,'online',NULL),(2,'test-staff','unused','Staff',2,'online',1)");
    const token = jwt.sign({ id: 1, role: 'super_admin' }, helpers.JWT_SECRET);
    const staff = jwt.sign({ id: 2, role: 'super_admin' }, helpers.JWT_SECRET);
    await admin.query("INSERT INTO users(id,openid,nickname) VALUES(1,'OPERATIONS-TEST','Fixture')");
    await admin.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'Fixture','self','TEST-P1')");
    await admin.query("INSERT INTO stores(id,name,code,address) VALUES(1,'Store A','A','Address A'),(2,'Store B','B','Address B')");
    await admin.query("INSERT INTO doctors(id,name,title,specialty,rating,consult_fee) VALUES(1,'Doctor A','Doctor','Sleep',5,999900),(2,'Doctor B','Doctor','Sleep',5,999900)");
    await admin.query(`INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status,consult_fee)
      VALUES(1,'TEST-A1',1,1,1,1,1,'2026-09-01','10:00','completed',999900),
      (2,'TEST-A2',1,1,2,2,1,'2026-09-01','11:00','completed',999900),
      (3,'TEST-A3',1,1,1,1,1,DATE_ADD(CURDATE(), INTERVAL 2 MONTH),'10:00','pending',999900)`);
    await admin.query(`INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,pay_at,status,appointment_id,wechat_transaction_id,shipping_address)
      VALUES(1,'TEST-O1',1,10000,10000,'2026-09-01 10:00:00','paid',1,'WX-TEST-1',JSON_OBJECT('express_company','Real Carrier','tracking_number','REAL123')),
      (2,'TEST-O2',1,20000,20000,'2026-09-01 10:00:00','paid',2,'WX-TEST-2',NULL),
      (3,'TEST-O3',1,7000,7000,'2026-09-01 10:00:00','paid',NULL,'WX-TEST-3',NULL)`);
    await admin.query("INSERT INTO products(id,name,category,image_url,price,stock,sales_count,status) VALUES(1,'Fixture product','accessory','',10000,5,1,'on')");
    await admin.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(1,1,'Fixture product',10000,1)");
    await admin.query("INSERT INTO distributors(id,user_id,nickname,invite_code,total_commission,available_commission,status) VALUES(1,1,'Fixture','OPS-TEST',1000,100,'active')");
    await admin.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,commission_level,status) VALUES(1,1,'Fixture',10000,1000,1,'settled')");
    await admin.query("INSERT INTO appointment_evaluations(appointment_id,doctor_id,user_id,rating,created_at) VALUES(1,1,1,3,'2026-09-01 12:00:00')");

    await t.test('SMS cannot return or accept a fake verification code', async () => {
      for (const path of ['send-code', 'sms-login']) {
        const result = await api('/api/admin/' + path, '', { phone: '13800138000', smsCode: '123456' });
        assert.equal(result.status, 503);
        assert.equal(result.body.data, undefined);
      }
    });
    await t.test('current DB role wins over a privileged stale JWT', async () => {
      for (const path of ['/api/admin/settings', '/api/admin/orders/refunds']) assert.equal((await api(path, staff)).status, 403);
      assert.equal((await api('/api/admin/settings', staff, { min_withdraw: 1 })).status, 403);
      assert.equal((await api('/api/admin/roles', staff, { name: 'bad', code: 'super_admin' })).status, 403);
      assert.equal((await api('/api/admin/orders/1/refund', staff, { approve: true }, 'PUT')).status, 403);
    });
    await t.test('stopped account and role invalidate existing tokens', async () => {
      await admin.query("UPDATE admin_users SET status='offline' WHERE id=1");
      assert.equal((await api('/api/admin/settings', token)).status, 403);
      await admin.query("UPDATE admin_users SET status='online' WHERE id=1");
      await admin.query("UPDATE roles SET status='inactive' WHERE id=1");
      assert.equal((await api('/api/admin/settings', token)).status, 403);
      await admin.query("UPDATE roles SET status='active' WHERE id=1");
    });
    await t.test('secret settings are redacted and blank updates preserve the secret', async () => {
      await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES('wechat_pay_private_key','TEST-NOT-A-REAL-KEY')");
      const result = await api('/api/admin/settings', token);
      assert.equal(result.body.data.wechat_pay_private_key, '');
      assert.equal(result.body.configured.wechat_pay_private_key, true);
      assert.equal((await api('/api/admin/settings', token, { wechat_pay_private_key: '', min_withdraw: 10 })).status, 200);
      assert.equal((await db.get("SELECT key_value FROM system_settings WHERE key_name='wechat_pay_private_key'")).key_value, 'TEST-NOT-A-REAL-KEY');
      for (const bad of [{ min_withdraw: 0 }, { withdraw_fee_rate: 100 }, { distribution_settle_days: '' }, { commission1: -1 }, { auto_approve_withdraw: true }]) {
        assert.equal((await api('/api/admin/settings', token, bad)).status, 400);
      }
    });
    await t.test('invoice unavailable and logistics contains no invented events', async () => {
      assert.equal((await api('/api/admin/orders/1/invoice', token, { title: 'Test' })).status, 503);
      assert.equal((await db.get('SELECT invoice_info FROM orders WHERE id=1')).invoice_info, null);
      const result = await api('/api/admin/orders/1/tracking', token);
      assert.deepEqual(result.body.data.steps, []);
      assert.equal(result.body.data.trackingNo, 'REAL123');
      assert.equal(result.body.data.available, false);
      assert.deepEqual((await api('/api/admin/im/users', token)).body.data, []);
    });
    await t.test('report uses receipts, explicit store attribution and actual ratings', async () => {
      const result = await report.readStoreReport({ role: 'super_admin' }, { year: 2026, store_id: 1 });
      assert.equal(result.months[8].net, 10000);
      assert.equal(result.months[8].rating, 3);
      assert.equal(result.months[8].doctors[0].net, 10000);
      const other = await report.readStoreReport({ role: 'super_admin' }, { year: 2026, store_id: 2 });
      assert.equal(other.months[8].net, 20000);
      assert.equal(other.months[8].rating, null);
      await assert.rejects(report.readStoreReport({ role: 'receptionist', store_id: 1 }, { year: 2026, store_id: 2 }), { statusCode: 403 });
    });
    await t.test('monthly dashboard excludes future months and has no fictional zero-base growth', async () => {
      const result = await api('/api/admin/dashboard/stats?range=month', token);
      assert.equal(result.status, 200);
      const expected = await db.get("SELECT COUNT(*) n FROM appointments WHERE appointment_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01') AND appointment_date < DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY)");
      assert.equal(result.body.data.totalAppointments, expected.n);
      assert.notEqual(result.body.data.trends.revenue.trend, '+100%');
    });
    await t.test('refund application and rejection leave money and stock untouched', async () => {
      await refunds.applyRefund(1, 1, 'Test request');
      assert.equal((await db.get('SELECT status FROM orders WHERE id=1')).status, 'refund_pending');
      assert.equal((await db.get('SELECT available_commission FROM distributors WHERE id=1')).available_commission, 100);
      await refunds.reviewRefund(1, false, 1);
      assert.equal((await db.get('SELECT status FROM orders WHERE id=1')).status, 'paid');
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 5);
      await assert.rejects(refunds.reviewRefund(1, false, 2), { statusCode: 403 });
      assert.equal((await api('/api/admin/orders/1/refund', token, { approve: 'false' }, 'PUT')).status, 400);
      await refunds.applyRefund(1, 1, 'Test request');
    });
    let calls = 0;
    const provider = { missing: async () => [], create: async () => { calls++; return { status: 'PROCESSING' }; } };
    await t.test('concurrent approvals submit once; PROCESSING is not SUCCESS', async () => {
      const result = await Promise.allSettled([refunds.reviewRefund(1, true, 1, provider), refunds.reviewRefund(1, true, 1, provider)]);
      assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(calls, 1);
      assert.equal((await db.get('SELECT status FROM orders WHERE id=1')).status, 'refunding');
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 5);
      assert.equal((await db.get('SELECT available_commission FROM distributors WHERE id=1')).available_commission, 100);
      assert.equal((await api('/api/admin/orders/refunds', token)).body.data.find(row => row.id === 1).status, 'processing');
      assert.equal((await api('/api/admin/orders/refunds', token)).body.data.find(row => row.id === 1).commissionTotal, 1000);
    });
    const success = { status: 'SUCCESS', out_refund_no: 'HJR1', refund_id: 'WX-REFUND-1', out_trade_no: 'TEST-O1',
      success_time: '2026-09-02T10:00:00+08:00', amount: { refund: 10000, total: 10000, currency: 'CNY' } };
    await t.test('wrong refund amount cannot change accounting', async () => {
      await assert.rejects(refunds.completeRefund({ ...success, amount: { ...success.amount, refund: 1 } }), { statusCode: 409 });
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 5);
    });
    await t.test('successful refund applies once, preserves real debt and uses provider date', async () => {
      const result = await Promise.all([refunds.completeRefund(success), refunds.completeRefund(success)]);
      assert.equal(result.filter(Boolean).length, 1);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 6);
      assert.equal((await db.get('SELECT available_commission FROM distributors WHERE id=1')).available_commission, -900);
      assert.equal((await db.get("SELECT DATE_FORMAT(refund_at,'%Y-%m-%d') d FROM orders WHERE id=1")).d, '2026-09-02');
      const resultReport = await report.readStoreReport({ role: 'super_admin' }, { year: 2026, store_id: 1 });
      assert.equal(resultReport.months[8].receipts, 10000);
      assert.equal(resultReport.months[8].refunds, 10000);
      assert.equal(resultReport.months[8].net, 0);
      await refunds.syncRefund(1, 1, async () => success);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 6);
    });
    await t.test('network ambiguity keeps a stable reference and blocks resubmission', async () => {
      await refunds.applyRefund(2, 1, 'Test timeout');
      await assert.rejects(refunds.reviewRefund(2, true, 1, { missing: async () => [], create: async () => { throw new Error('timeout'); } }), { statusCode: 502 });
      const row = await db.get('SELECT * FROM orders WHERE id=2');
      assert.equal(row.status, 'refunding');
      assert.equal(row.wechat_refund_no, 'HJR2');
      await assert.rejects(refunds.reviewRefund(2, true, 1, provider), { statusCode: 409 });
      assert.equal(calls, 1);
    });
    await t.test('concurrent appointment cancellation releases one slot and preserves refund metadata', async () => {
      await admin.query("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time,booked_slots) VALUES(10,1,1,DATE_ADD(CURDATE(),INTERVAL 5 DAY),'am','09:00','12:00',2)");
      await admin.query(`INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status)
        VALUES(10,'TEST-CANCEL',1,1,1,1,10,DATE_ADD(CURDATE(),INTERVAL 5 DAY),'10:00','pending')`);
      await admin.query(`INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,pay_at,status,appointment_id,type,shipping_address)
        VALUES(10,'TEST-DEPOSIT',1,1000,1000,NOW(),'paid',10,'appointment_deposit',JSON_OBJECT('storeId',1,'refund_rejected_at','old'))`);
      const clientToken = jwt.sign({ id: 1, openid: 'OPERATIONS-TEST' }, helpers.JWT_SECRET);
      const results = await Promise.all([api('/api/v1/appointments/10/cancel', clientToken, { reason: 'test' }), api('/api/v1/appointments/10/cancel', clientToken, { reason: 'test' })]);
      assert.equal(results.filter(r => r.status === 200).length, 1);
      assert.ok(results.every(r => [200,400,409].includes(r.status)));
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=10')).booked_slots, 1);
      const order = await db.get('SELECT status,shipping_address FROM orders WHERE id=10');
      assert.equal(order.status, 'refund_pending');
      const address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address;
      assert.equal(address.storeId, 1);
      assert.ok(address.refund_applied_at);
      assert.equal(address.refund_rejected_at, undefined);
    });
    await t.test('unconfigured callback verification fails closed', async () => {
      for (const key of ['WECHAT_PAY_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT_PATH']) delete process.env[key];
      assert.equal(await pay.verifyWechatPayCallback({ get: () => '' }, '{}'), false);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.closePool();
    assert.match(schema, /^hanjing_test_operations_[0-9]+$/);
    await admin.query('DROP DATABASE ' + schema);
    await admin.end();
  }
});
