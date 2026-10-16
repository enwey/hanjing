import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('launch security and payment boundaries', async t => {
  const schema = 'hanjing_test_security_' + Date.now();
  const control = await mysql.createConnection({ host: '127.0.0.1', user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || 'root' });
  let db, server, locker;
  await control.query('CREATE DATABASE ' + schema);
  try {
    const source = process.env.TEST_SCHEMA_SOURCE || 'hanjing_clinic';
    assert.match(source, /^[a-zA-Z0-9_]+$/);
    const [tables] = await control.query('SHOW TABLES FROM ' + source);
    for (const table of tables) {
      const name = Object.values(table)[0];
      assert.match(name, /^[a-zA-Z0-9_]+$/);
      await control.query(`CREATE TABLE ${schema}.${name} LIKE ${source}.${name}`);
    }
    await control.query('USE ' + schema);
    await control.query('CREATE TABLE IF NOT EXISTS private_uploads(file_path VARCHAR(255) PRIMARY KEY,user_id BIGINT,admin_id BIGINT)');
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'root', DB_NAME: schema });
    db = await import('../db.js');
    await control.query("INSERT INTO member_levels(code,name,spent_required,sort_order,benefits) VALUES('normal','Test normal',0,0,JSON_ARRAY())");
    const helpers = await import('../helpers.js');
    const client = await import('../routes/client.js');
    const admin = await import('../routes/admin.js');
    const files = await import('../private-uploads.js');
    const app = express();
    app.use(express.json(), client.default, admin.default);
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ code: err.statusCode || 500 }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const userClaims = { id: 1, openid: 'SEC-1' };
    const token = jwt.sign(userClaims, helpers.JWT_SECRET);
    const staff = jwt.sign({ id: 1, role: 'receptionist' }, helpers.JWT_SECRET);
    const superToken = jwt.sign({ id: 2, role: 'super_admin' }, helpers.JWT_SECRET);
    async function api(path, body, auth = token, method = body === undefined ? 'GET' : 'POST') {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
        headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    }
    await control.query("INSERT INTO users(id,openid,nickname) VALUES(1,'SEC-1','Requester'),(2,'SEC-2','Unrelated')");
    await control.query("INSERT INTO patients(id,user_id,name,relation,patient_no,phone) VALUES(1,1,'Requester','self','SEC-P1',NULL),(2,2,'Unrelated','self','SEC-P2',?)", [helpers.encryptPII('13800138002')]);
    await control.query("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(1,1,'self'),(2,2,'self')");
    await control.query("INSERT INTO snore_assessments(id,user_id,patient_id,file_url,duration,avg_decibel,peak_decibel,snore_rate,apnea_events,risk_level) VALUES(1,2,2,'/uploads/snore/fixture.wav',60,40,50,5,0,'normal')");
    await control.query("INSERT INTO roles(id,name,code,status) VALUES(1,'Staff','receptionist','active'),(2,'Super','super_admin','active')");
    await control.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1,'security-staff','unused','Staff',1,'online'),(2,'security-super','unused','Super',2,'online')");
    await control.query("INSERT INTO product_categories(code,name) VALUES('accessory','Fixture')");
    await control.query("INSERT INTO products(id,name,category,image_url,price,stock,status) VALUES(1,'Fixture','accessory','',1000,5,'on')");

    let familyId;
    await t.test('hand-entered phone creates an isolated family profile, never claims another report', async () => {
      assert.equal((await api('/api/v1/assessments/snore-analysis/snore-1')).status, 404);
      const linked = await api('/api/v1/user/family-members', { name: 'Family fixture', relation: 'other', phone: '13800138002' });
      assert.equal(linked.status, 200);
      familyId = Number(linked.body.data.id);
      assert.notEqual(familyId, 2);
      assert.equal((await api('/api/v1/assessments/snore-analysis/snore-1')).status, 404);
      assert.equal((await db.get('SELECT user_id FROM patients WHERE id=2')).user_id, 2);
    });
    await t.test('self-declared identity is not verification or permission', async () => {
      await control.query('UPDATE patients SET id_card=? WHERE id=2', [helpers.encryptPII('110101199001010011')]);
      assert.equal((await api('/api/v1/user/verify-realname', { realName: 'Other person', idCard: '110101199001010011' })).status, 503);
      assert.notEqual(Number((await db.get('SELECT self_patient_id FROM users WHERE id=1')).self_patient_id), 2);
      assert.equal((await api('/api/v1/user/account-security')).body.data.realNameVerified, false);
    });
    await t.test('family edits cannot move data to another account or expand the report scope', async () => {
      const result = await api('/api/v1/user/family-members/' + familyId, { name: 'Updated fixture', relation: 'other', idCard: '110101199001010011' }, token, 'PUT');
      assert.equal(result.status, 200);
      assert.notEqual(Number(result.body.data.id), 2);
      assert.equal((await api('/api/v1/assessments/snore-analysis/snore-1')).status, 404);
    });
    await t.test('legacy foreign links do not grant access or allow edits', async () => {
      await control.query("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(1,2,'other')");
      for (const suffix of ['family-members/2', 'medical-records']) {
        const r = await api('/api/v1/user/' + suffix);
        if (suffix.includes('/2')) assert.equal(r.status, 404);
      }
      assert.equal((await api('/api/v1/user/family-members/2', { name: 'Tamper' }, token, 'PUT')).status, 404);
      assert.equal((await api('/api/v1/assessments/snore-analysis/snore-1')).status, 404);
    });
    await t.test('no permission means no product writes; valid grants allow valid writes', async () => {
      const product = { name: 'Valid fixture', category: 'accessory', price: 1000, stock: 5 };
      assert.equal((await api('/api/admin/products', product, staff)).status, 403);
      await control.query("INSERT INTO permissions(role_id,permission_resource) VALUES(1,'distribution:edit')");
      assert.equal((await api('/api/admin/products', product, staff)).status, 200);
      for (const bad of [{ price: -1 }, { stock: -1 }, { stock: 1.5 }, { price: '' }, { commission_rate_level1: -1 }, { commission_rate_level1: 70, commission_rate_level2: 40 }]) {
        assert.equal((await api('/api/admin/products', { ...product, ...bad }, superToken)).status, 400);
        assert.equal((await api('/api/admin/products/1', bad, superToken, 'PUT')).status, 400);
      }
    });
    await t.test('current store and resource permissions protect conversations', async () => {
      assert.equal(await helpers.verifyPatientAccess(2, { role: 'receptionist', store_ids: [] }), false);
      await control.query("INSERT INTO permissions(role_id,permission_resource) VALUES(1,'patient:view'),(1,'patient:edit')");
      await control.query("INSERT INTO im_messages(patient_id,sender,sender_name,text,is_read) VALUES(2,'patient','Fixture','Private fixture',0)");
      assert.equal((await api('/api/admin/im/messages?patient_id=2', undefined, staff)).status, 403);
      await control.query("INSERT INTO stores(id,name,code,address) VALUES(99,'Allowed store','SEC-99','Test')");
      await control.query('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(1,99)');
      assert.equal((await api('/api/admin/im/messages?patient_id=2', undefined, staff)).status, 404);
      assert.equal((await api('/api/admin/im/send', { patient_id: 2, text: 'Tamper' }, staff)).status, 404);
      assert.equal((await api('/api/admin/im/messages?patient_id=2', undefined, superToken)).status, 200);
    });
    await t.test('attachments ignore Referer, enforce ownership, and restrict signed tokens to their path', async () => {
      const uploadPath = '/uploads/medical-attachments/fixture.pdf';
      await files.registerPrivateUpload(uploadPath, userClaims);
      assert.equal(await files.canReadPrivateUpload(uploadPath, userClaims), true);
      assert.equal(await files.canReadPrivateUpload(uploadPath, { id: 2, openid: 'SEC-2' }), false);
      assert.equal(await files.canReadPrivateUpload('/uploads/snore/fixture.wav', userClaims), false);
      const check = async (path, headers = {}, query = {}) => {
        let status = 200, passed = false;
        await files.authorizeUpload({ path, headers, query }, { setHeader() {}, status(s) { status = s; return this; }, send() {} }, () => { passed = true; });
        return { status, passed };
      };
      assert.equal((await check('/medical-attachments/fixture.pdf', { referer: 'https://servicewechat.com/anything' })).status, 403);
      const asset = jwt.sign({ ...userClaims, scope: 'asset', path: uploadPath }, helpers.JWT_SECRET, { expiresIn: '1m' });
      assert.equal((await check('/medical-attachments/fixture.pdf', {}, { asset_token: asset })).passed, true);
      assert.equal((await check('/snore/fixture.wav', {}, { asset_token: asset })).status, 403);
      assert.equal((await api('/api/v1/user/profile', undefined, asset)).status, 401);
    });
    await t.test('attachment substrings do not grant access and admin cannot attach an unrelated file', async () => {
      await control.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,visit_date,diagnosis,attachments) VALUES(1,1,1,99,CURDATE(),'Fixture',?)",
        [JSON.stringify([{ url: '/uploads/medical-attachments/private.pdf.extra' }])]);
      assert.equal(await files.canReadPrivateUpload('/uploads/medical-attachments/private.pdf', userClaims), false);
      assert.equal(await files.canReadPrivateUpload('/uploads/medical-attachments/private.pdf.extra', userClaims), true);
      await files.registerPrivateUpload('/uploads/medical-attachments/foreign.pdf', { id: 2, openid: 'SEC-2' });
      await control.query("INSERT INTO permissions(role_id,permission_resource) VALUES(1,'medical_record:edit')");
      assert.equal((await api('/api/admin/patients/1/medical-records/1/attachments', { attachments: [{ url: '/uploads/medical-attachments/foreign.pdf' }] }, staff, 'PUT')).status, 403);
    });
    await t.test('cashier payment endpoints reject unrelated store orders before any channel request', async () => {
      await control.query("INSERT INTO permissions(role_id,permission_resource) VALUES(1,'order:edit'),(1,'order:view')");
      await control.query("INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,status,shipping_address) VALUES(10,'SEC-CASH-SCOPE',2,1000,1000,'pending','{\"storeId\":1}')");
      for (const [path, body] of [['native', { orderId: 10 }], ['micropay', { orderId: 10, authCode: '12345678901234' }], ['orders/10/cancel', {}], ['orders/10/status', undefined]]) {
        assert.equal((await api('/api/admin/pay/' + path, body, staff)).status, 404);
      }
    });
    await t.test('global search and chat list do not expose unrelated store data', async () => {
      const people = await api('/api/admin/global-search?q=Unrelated', undefined, staff);
      assert.equal(people.status, 200);
      assert.deepEqual(people.body.data.patients, []);
      const orders = await api('/api/admin/global-search?q=SEC-CASH-SCOPE', undefined, staff);
      assert.deepEqual(orders.body.data.orders, []);
      const chats = await api('/api/admin/im/users', undefined, staff);
      assert.equal(chats.status, 200);
      assert.ok(!chats.body.data.some(item => Number(item.id) === 2));
      assert.equal((await api('/api/admin/notifications/stats', undefined, staff)).status, 200);
    });
    await t.test('cashier payment finalization validates amount and records concurrent results only once', async () => {
      await control.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,pay_method,shipping_address) VALUES(11,'SEC-CASH',1,'offline',1000,1000,'pending','wechat_native','{}')");
      await control.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(11,1,'Fixture',1000,1)");
      const payment = { trade_state: 'SUCCESS', out_trade_no: 'SEC-CASH', transaction_id: 'SEC-CASH-TX', amount: { total: 1000, currency: 'CNY' } };
      await assert.rejects(admin.finalizeAdminPaidOrder({ id: 11 }, { ...payment, amount: { total: 1, currency: 'CNY' } }));
      const before = Number((await db.get('SELECT sales_count FROM products WHERE id=1')).sales_count);
      await Promise.all([admin.finalizeAdminPaidOrder({ id: 11 }, payment), admin.finalizeAdminPaidOrder({ id: 11 }, payment)]);
      assert.equal(Number((await db.get('SELECT sales_count FROM products WHERE id=1')).sales_count), before + 1);
    });
    await t.test('concurrent cashier cancellation restores inventory only once', async () => {
      await control.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,shipping_address) VALUES(12,'SEC-CASH-CANCEL',1,'offline',1000,1000,'pending','{}')");
      await control.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(12,1,'Fixture',1000,1)");
      const stock = Number((await db.get('SELECT stock FROM products WHERE id=1')).stock);
      const results = await Promise.all([api('/api/admin/pay/orders/12/cancel', {}, superToken), api('/api/admin/pay/orders/12/cancel', {}, superToken)]);
      assert.equal(results.filter(result => result.status === 200).length, 1);
      assert.equal(Number((await db.get('SELECT stock FROM products WHERE id=1')).stock), stock + 1);
    });
    await t.test('concurrent refund cannot be overwritten by a stale shipping operation', async () => {
      await control.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,shipping_address) VALUES(1,'SEC-SHIP',1,'online',1000,1000,'shipping','{}')");
      locker = await mysql.createConnection({ host: '127.0.0.1', user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || 'root', database: schema });
      await locker.beginTransaction();
      await locker.query("UPDATE orders SET status='refund_pending',shipping_address=? WHERE id=1", [JSON.stringify({ refund_request: 'fixture' })]);
      const pending = api('/api/admin/orders/1/ship', { carrier: 'Fixture', trackingNo: 'SEC123456' }, superToken);
      let waiting = false;
      for (let i = 0; i < 40; i++) {
        const [rows] = await control.query('SHOW FULL PROCESSLIST');
        waiting = rows.some(p => p.db === schema && /UPDATE orders SET status = 'shipped'/.test(p.Info || ''));
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await locker.commit();
      const result = await pending;
      assert.ok(waiting);
      assert.equal(result.status, 409);
      const saved = await db.get('SELECT status,shipping_address FROM orders WHERE id=1');
      assert.equal(saved.status, 'refund_pending');
      assert.ok(JSON.stringify(saved.shipping_address).includes('refund_request'));
    });
    await t.test('late payment enters refund review exactly once without reserving or restoring stock twice', async () => {
      await control.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,shipping_address) VALUES(2,'SEC-LATE',1,'online',1000,1000,'pending','{}')");
      await control.query("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(2,1,'Fixture',1000,1)");
      await db.transaction(conn => client.cancelPendingProductOrder(conn, 2, 1));
      const stock = (await db.get('SELECT stock FROM products WHERE id=1')).stock;
      const payment = { trade_state: 'SUCCESS', out_trade_no: 'SEC-LATE', transaction_id: 'SEC-TXN', amount: { total: 1000, currency: 'CNY' } };
      await db.transaction(conn => client.finalizePaidProductOrder(conn, { id: 2 }, payment));
      await db.transaction(conn => client.finalizePaidProductOrder(conn, { id: 2 }, payment));
      const order = await db.get('SELECT status,pay_at,wechat_transaction_id FROM orders WHERE id=2');
      assert.equal(order.status, 'refund_pending');
      assert.ok(order.pay_at);
      assert.equal(order.wechat_transaction_id, 'SEC-TXN');
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock, stock);
      assert.equal((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE title='取消订单收到付款'")).n, 1);
    });
    await t.test('cancellation waits for a confirmed provider close and preserves state on ambiguity', async () => {
      await control.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,shipping_address,wechat_prepay_id) VALUES(3,'SEC-CLOSE',1,'online',1000,1000,'pending','{}','REQUESTING')");
      const failure = { query: async () => { throw new Error('provider timeout'); }, close: async () => assert.fail('must not close after failed query') };
      await assert.rejects(db.transaction(conn => client.cancelPendingProductOrder(conn, 3, 1, false, failure)));
      assert.equal((await db.get('SELECT status FROM orders WHERE id=3')).status, 'pending');
      let closed = false;
      const provider = { query: async () => ({ trade_state: closed ? 'CLOSED' : 'NOTPAY' }), close: async () => { closed = true; } };
      assert.equal(await db.transaction(conn => client.cancelPendingProductOrder(conn, 3, 1, false, provider)), true);
      assert.equal(closed, true);
    });
  } finally {
    if (locker) { await locker.rollback(); await locker.end(); }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.closePool();
    assert.match(schema, /^hanjing_test_security_[0-9]+$/);
    await control.query('DROP DATABASE ' + schema);
    await control.end();
  }
});
