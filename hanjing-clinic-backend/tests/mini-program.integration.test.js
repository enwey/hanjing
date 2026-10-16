import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('mini-program transactions and data integrity', async t => {
  const schema = 'hanjing_test_mini_' + Date.now();
  const source = process.env.TEST_SCHEMA_SOURCE || 'hanjing_clinic';
  assert.match(source, /^[a-zA-Z0-9_]+$/);
  const admin = await mysql.createConnection({ host: '127.0.0.1', user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || 'root' });
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
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: schema,
      DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'root' });
    db = await import('../db.js');
    await admin.query("INSERT INTO member_levels(code,name,spent_required,sort_order,benefits) VALUES('normal','Test normal',0,0,JSON_ARRAY())");
    const helpers = await import('../helpers.js');
    const client = await import('../routes/client.js');
    const app = express();
    app.use(express.json());
    app.use(client.default);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const token = jwt.sign({ id: 1, openid: 'MINI-TEST-1' }, helpers.JWT_SECRET);
    const api = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
        method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    await admin.query("INSERT INTO users(id,openid,nickname) VALUES(1,'MINI-TEST-1','Fixture'),(2,'MINI-TEST-2','Other')");
    await admin.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'Fixture','self','MINI-P1'),(2,2,'Other','self','MINI-P2')");
    await admin.query("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(1,1,'self'),(2,2,'self')");
    await admin.query("INSERT INTO products(id,name,category,image_url,price,stock,sales_count,status) VALUES(1,'Fixture','accessory','',1000,1,0,'on'),(2,'Other','accessory','',1000,5,0,'on')");
    const shippingAddress = { deliveryMethod: 'online', contactName: 'Fixture', phone: '13800138000', detailAddress: 'Test address' };
    const orderBody = (items, extras = {}) => ({ items, shippingAddress, ...extras });

    await t.test('duplicate line items cannot oversell', async () => {
      const result = await api('/orders', orderBody([{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }]));
      assert.equal(result.status, 400);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 1);
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders')).n, 0);
    });
    let orderId;
    await t.test('concurrent purchases reserve the last unit once', async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => api('/orders', orderBody([{ productId: 1, quantity: 1 }]))));
      assert.equal(results.filter(r => r.status === 200).length, 1);
      assert.ok(results.every(r => [200, 400, 409].includes(r.status)));
      orderId = results.find(r => r.status === 200).body.data.id;
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, 0);
    });
    await t.test('concurrent cancellations return inventory once without changing sales', async () => {
      const results = await Promise.all([api(`/orders/${orderId}/cancel`, {}), api(`/orders/${orderId}/cancel`, {})]);
      assert.equal(results.filter(r => r.status === 200).length, 1);
      assert.deepEqual(await db.get('SELECT stock,sales_count FROM products WHERE id=1'), { stock: 1, sales_count: 0 });
    });
    await admin.query("INSERT INTO coupons(id,title,type,value,min_spend,status) VALUES(1,'Fixture','amount',100,0,'active')");
    await admin.query("INSERT INTO user_coupons(id,user_id,coupon_id,status) VALUES(1,1,1,'active')");
    let couponOrder;
    await t.test('a coupon cannot be consumed by two concurrent orders', async () => {
      const results = await Promise.all([1, 2].map(() => api('/orders', orderBody([{ productId: 2, quantity: 1 }], { couponId: 1 }))));
      assert.equal(results.filter(r => r.status === 200).length, 1);
      couponOrder = results.find(r => r.status === 200).body.data.id;
      assert.equal((await db.get('SELECT stock FROM products WHERE id=2')).stock, 4);
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE coupon_id=1')).n, 1);
    });
    await t.test('verified payment finalization is idempotent and checks the amount', async () => {
      const order = await db.get('SELECT * FROM orders WHERE id=?', [couponOrder]);
      const payload = { trade_state: 'SUCCESS', out_trade_no: order.order_no, transaction_id: 'WX-MINI-TEST', amount: { total: order.pay_amount, currency: 'CNY' } };
      await assert.rejects(db.transaction(c => client.finalizePaidProductOrder(c, order, { ...payload, amount: { total: 1, currency: 'CNY' } })), { statusCode: 409 });
      const results = await Promise.all([1, 2].map(() => db.transaction(c => client.finalizePaidProductOrder(c, order, payload))));
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await db.get('SELECT sales_count FROM products WHERE id=2')).sales_count, 1);
      assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE title='商品购买成功'")).n, 1);
      assert.equal((await api(`/orders/${couponOrder}/cancel`, {})).status, 400);
      await assert.rejects(db.transaction(c => client.finalizePaidProductOrder(c, order, { ...payload, transaction_id: 'DIFFERENT' })), { statusCode: 409 });
    });
    await t.test('shipped order exposes real tracking reference but no invented events', async () => {
      await db.run("UPDATE orders SET status='shipped', shipping_address=? WHERE id=?", [JSON.stringify({ express_company: 'Carrier', tracking_number: 'REAL-TEST' }), couponOrder]);
      const result = await api(`/orders/${couponOrder}/logistics`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.trackingNumber, 'REAL-TEST');
      assert.deepEqual(result.body.data.steps, []);
      assert.deepEqual(result.body.data.list, []);
      assert.equal(result.body.data.available, false);
    });
    await t.test('receipt confirmation changes state only once', async () => {
      const results = await Promise.all([1, 2].map(() => api(`/orders/${couponOrder}/confirm-receipt`, {})));
      assert.equal(results.filter(r => r.status === 200).length, 1);
      assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE title='订单已完成'")).n, 1);
    });
    await admin.query("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status,consult_fee,deposit_amount) VALUES(1,'MINI-APT',2,2,1,1,1,'2026-10-01','10:00','pending_payment',5000,1000)");
    await t.test('appointment payment APIs reject another account before querying WeChat', async () => {
      for (const action of ['pay', 'confirm-pay']) assert.equal((await api('/appointments/1/' + action, {})).status, 404);
    });
    await t.test('appointment payment uses saved fee, original owner, and creates one receipt without a seeded product', async () => {
      const appointment = await db.get('SELECT * FROM appointments WHERE id=1');
      const payload = { trade_state: 'SUCCESS', out_trade_no: 'MINI-APT', transaction_id: 'WX-APT-TEST', amount: { total: 6000, currency: 'CNY' } };
      await assert.rejects(db.transaction(c => client.finalizePaidAppointment(c, appointment, 1, payload)), { statusCode: 404 });
      await assert.rejects(db.transaction(c => client.finalizePaidAppointment(c, appointment, 2, { ...payload, amount: { total: 9999, currency: 'CNY' } })), { statusCode: 409 });
      const results = await Promise.all([1, 2].map(() => db.transaction(c => client.finalizePaidAppointment(c, appointment, 2, payload))));
      assert.equal(results.filter(Boolean).length, 1);
      const orders = await db.query('SELECT user_id,pay_amount FROM orders WHERE appointment_id=1');
      assert.deepEqual(orders, [{ user_id: 2, pay_amount: 6000 }]);
      assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE title='预约支付成功'")).n, 1);
    });
    const report = { duration: 60, patientId: 1, client_side_analysis: true,
      analysis_result: { avgDecibel: 40, peakDecibel: 50, snoreRate: 5, apneaEvents: 0, riskLevel: 'normal' } };
    await t.test('snore writes reject unrelated patients', async () => {
      assert.equal((await api('/assessments/snore', { ...report, patientId: 2 })).status, 404);
      assert.equal((await db.get('SELECT COUNT(*) n FROM snore_assessments')).n, 0);
    });
    await t.test('snore writes reject invalid numeric ranges and unknown risks', async () => {
      for (const bad of [{ snoreRate: 101 }, { peakDecibel: 20 }, { apneaEvents: -1 }, { apneaEvents: 1000 }, { avgDecibel: null }, { riskLevel: 'made-up' }]) {
        assert.equal((await api('/assessments/snore', { ...report, analysis_result: { ...report.analysis_result, ...bad } })).status, 400);
      }
      assert.equal((await api('/assessments/snore', report)).status, 200);
      const saved = await db.get('SELECT user_id, patient_id FROM snore_assessments');
      assert.deepEqual(saved, { user_id: 1, patient_id: 1 });
    });
    await t.test('no evaluations means unknown satisfaction, not 98 percent', async () => {
      const result = await api('/home/stats');
      assert.equal(result.body.data.satisfactionRate, null);
      assert.equal(result.body.data.storeCount, 0);
      assert.equal(result.body.data.totalPatients, 2);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.closePool();
    assert.match(schema, /^hanjing_test_mini_[0-9]+$/);
    await admin.query('DROP DATABASE ' + schema);
    await admin.end();
  }
});
