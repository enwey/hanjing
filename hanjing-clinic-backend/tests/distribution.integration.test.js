import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('distribution uses actual records and atomic accounting', async (t) => {
  // A new local schema contains fixtures only; no business database rows are modified.
  const schema = 'hanjing_test_distribution_' + Date.now();
  const source = process.env.TEST_SCHEMA_SOURCE || 'hanjing_clinic';
  assert.match(source, /^[a-zA-Z0-9_]+$/);
  const admin = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || 'root'
  });
  await admin.query('CREATE DATABASE ' + schema);
  let database;
  let server;
  try {
    const [tables] = await admin.query('SHOW TABLES FROM ' + source);
    for (const row of tables) {
      const name = Object.values(row)[0];
      assert.match(name, /^[a-zA-Z0-9_]+$/);
      await admin.query('CREATE TABLE ' + schema + '.' + name + ' LIKE ' + source + '.' + name);
    }
    await admin.query('USE ' + schema);
    const [columns] = await admin.query('SHOW COLUMNS FROM withdraw_records');
    for (const [name, type] of [['remark','TEXT'],['reviewed_at','TIMESTAMP NULL'],['payout_reference','VARCHAR(120) NULL']]) {
      if (!columns.some(c => c.Field === name)) await admin.query('ALTER TABLE withdraw_records ADD COLUMN ' + name + ' ' + type);
    }
    await admin.query('ALTER TABLE withdraw_records MODIFY account_info TEXT NOT NULL');
    const [indexes] = await admin.query('SHOW INDEX FROM withdraw_records');
    if (!indexes.some(i => i.Key_name === 'uniq_withdraw_payout_reference')) {
      await admin.query('CREATE UNIQUE INDEX uniq_withdraw_payout_reference ON withdraw_records(payout_reference)');
    }
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '3306';
    process.env.DB_NAME = schema;
    process.env.DB_USER = process.env.TEST_DB_USER || 'root';
    process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'root';
    database = await import('../db.js');
    await admin.query("INSERT INTO member_levels(code,name,spent_required,sort_order,benefits) VALUES('normal','Test normal',0,0,JSON_ARRAY())");
    const ledger = await import('../distribution-ledger.js');
    const helpers = await import('../helpers.js');
    const app = express();
    app.use(express.json());
    app.use((await import('../routes/promoter.js')).default);
    app.use((await import('../routes/client.js')).default);
    app.use((await import('../routes/admin.js')).default);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const api = async (path, token, body, method = body ? 'POST' : 'GET') => {
      const res = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: res.status, data: await res.json() };
    };
    await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES ('distribution_settle_days','0'),('min_withdraw','1'),('withdraw_fee_rate','0.2'),('enable_distribution','true')");
    await admin.query("INSERT INTO users(id,openid,nickname,phone) VALUES (1,'test_fixture_1','Test','13800138001')");
    await admin.query("INSERT INTO distributors(id,user_id,nickname,invite_code,total_commission,available_commission,withdrawn_amount,status) VALUES(1,1,'Test','TEST',20000,0,0,'active')");
    await admin.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,pay_at,updated_at) VALUES (1,'TEST-ORDER',1,'product',200000,200000,'completed',NOW(),DATE_SUB(NOW(),INTERVAL 1 DAY))");
    await admin.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,commission_level,status,lock_until) VALUES(1,1,'Test',200000,20000,1,'pending',DATE_SUB(NOW(),INTERVAL 1 DAY))");
    const wxToken = jwt.sign({ id: 1, openid: 'test_fixture_1' }, helpers.JWT_SECRET);
    const promoterToken = jwt.sign({ user_id: 1, promoter_id: 1, scope: 'promoter' }, helpers.JWT_SECRET);
    const adminToken = jwt.sign({ id: 1, role: 'super_admin' }, helpers.JWT_SECRET);
    await admin.query("INSERT INTO roles(id,name,code,status) VALUES(1,'Test admin','super_admin','active'),(2,'Test staff','receptionist','active')");
    await admin.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1,'test-admin','unused','Admin',1,'online'),(2,'test-staff','unused','Staff',2,'online')");
    const bank = { amount: 15000, method: 'bank', bankInfo: { bankName: 'Test Bank', accountName: 'Test', accountNo: '1234567890123456' } };

    await t.test('parallel settlement credits each commission once', async () => {
      const amounts = await Promise.all([ledger.settleCommissions(1), ledger.settleCommissions(1)]);
      assert.equal(amounts.reduce((a,b) => a+b,0), 20000);
      const [[row]] = await admin.query('SELECT available_commission FROM distributors WHERE id=1');
      assert.equal(row.available_commission, 20000);
    });
    await t.test('parallel withdrawals cannot overdraw', async () => {
      const responses = await Promise.all([api('/api/v1/distribution/withdraw', wxToken, bank), api('/api/v1/distribution/withdraw', wxToken, bank)]);
      assert.deepEqual(responses.map(x=>x.status).sort(),[200,400]);
      const [[row]] = await admin.query('SELECT available_commission FROM distributors WHERE id=1');
      assert.equal(row.available_commission,5000);
    });
    const [[withdrawal]] = await admin.query('SELECT * FROM withdraw_records LIMIT 1');
    await t.test('approval never claims money has been transferred', async () => {
      const responses = await Promise.all([
        api('/api/admin/distribution/withdraws/' + withdrawal.id + '/status',adminToken,{approve:true},'PUT'),
        api('/api/admin/distribution/withdraws/' + withdrawal.id + '/status',adminToken,{approve:true},'PUT')
      ]);
      assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
      const [[row]] = await admin.query('SELECT withdrawn_amount FROM distributors WHERE id=1');
      assert.equal(row.withdrawn_amount,0);
      const result = await api('/api/promoter/dashboard', promoterToken);
      assert.equal(result.data.data.summary.pendingWithdrawAmount,15000);
      assert.equal(result.data.data.summary.reconciliationRequired,false);
    });
    await t.test('manual payout requires a reference and cannot be registered twice', async () => {
      const accountPath='/api/admin/distribution/withdraws/' + withdrawal.id + '/account';
      const unauthorizedToken=jwt.sign({id:2,role:'receptionist'},helpers.JWT_SECRET);
      assert.equal((await api(accountPath,unauthorizedToken)).status,403);
      const account=await api(accountPath,adminToken);
      assert.equal(account.status,200);
      assert.equal(account.data.data.accountNo,bank.bankInfo.accountNo);
      const path='/api/admin/distribution/withdraws/' + withdrawal.id + '/paid';
      assert.equal((await api(path,adminToken,{reference:''},'PUT')).status,400);
      const results=await Promise.all([api(path,adminToken,{reference:'TEST-RECEIPT-0001'},'PUT'),api(path,adminToken,{reference:'TEST-RECEIPT-0001'},'PUT')]);
      assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
      const result=await api('/api/promoter/withdraws',promoterToken);
      assert.equal(result.data.data[0].status,'paid');
      assert.equal(result.data.data[0].actualAmount,14900);
      assert.equal(result.data.data[0].accountInfo.accountNoEncrypted,undefined);
      const overview=(await api('/api/promoter/dashboard',promoterToken)).data.data.summary;
      assert.equal(overview.totalCommission,20000);
      assert.equal(overview.availableCommission,5000);
      assert.equal(overview.withdrawnAmount,15000);
      assert.equal(overview.reconciliationRequired,false);
    });
    await t.test('wechat payout is unavailable without a real provider', async () => {
      assert.equal((await api('/api/v1/distribution/withdraw',wxToken,{amount:1000,method:'wechat'})).status,503);
    });
    await t.test('mismatched ledger blocks withdrawal', async () => {
      await admin.query('UPDATE distributors SET available_commission=6000 WHERE id=1');
      assert.equal((await api('/api/v1/distribution/withdraw',wxToken,{...bank,amount:1000})).status,409);
      await admin.query('UPDATE distributors SET available_commission=5000 WHERE id=1');
    });
    await t.test('rejection releases reserved amount exactly once', async () => {
      assert.equal((await api('/api/v1/distribution/withdraw',wxToken,{...bank,amount:1000})).status,200);
      const [[row]]=await admin.query('SELECT id FROM withdraw_records ORDER BY id DESC LIMIT 1');
      const path='/api/admin/distribution/withdraws/' + row.id + '/status';
      const replies=await Promise.all([api(path,adminToken,{approve:false,remark:'Account mismatch'},'PUT'),api(path,adminToken,{approve:false,remark:'Account mismatch'},'PUT')]);
      assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
      const [[balance]]=await admin.query('SELECT available_commission FROM distributors WHERE id=1');
      assert.equal(balance.available_commission,5000);
    });
    await t.test('unpaid completed orders never settle commission', async () => {
      await admin.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,updated_at) VALUES (2,'TEST-UNPAID',1,'product',1000,1000,'completed',DATE_SUB(NOW(),INTERVAL 1 DAY))");
      await admin.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,commission_level,status,lock_until) VALUES(2,1,'Test',1000,100,1,'pending',DATE_SUB(NOW(),INTERVAL 1 DAY))");
      assert.equal(await ledger.settleCommissions(1),0);
    });
    await t.test('unconfigured or invalid financial rules block operations', async () => {
      await admin.query("UPDATE system_settings SET key_value='invalid' WHERE key_name='withdraw_fee_rate'");
      await assert.rejects(ledger.getDistributionFeatureConfig(),{statusCode:503});
      assert.equal((await api('/api/promoter/dashboard',promoterToken)).status,503);
      assert.equal((await api('/api/v1/distribution/rules',wxToken)).status,503);
      await admin.query("DELETE FROM system_settings WHERE key_name='withdraw_fee_rate'");
      await assert.rejects(ledger.getDistributionFeatureConfig(),{statusCode:503});
      await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES('withdraw_fee_rate','0.2')");
    });
    await t.test('SMS endpoints never simulate delivery', async () => {
      assert.equal((await api('/api/promoter/send-code','',{phone:'13800138001'})).status,503);
      const response=await api('/api/v1/user/send-code',wxToken,{phone:'13800138001'});
      assert.equal(response.status,503);
      assert.equal(response.data.data,undefined);
    });
    await t.test('disabled promoter token cannot read patient data', async () => {
      await admin.query("UPDATE distributors SET status='inactive' WHERE id=1");
      assert.equal((await api('/api/promoter/patients',promoterToken)).status,403);
      await admin.query("UPDATE distributors SET status='active' WHERE id=1");
    });
    await t.test('zero commission remains zero in the product API and new order snapshots', async () => {
      await admin.query("INSERT INTO products(id,name,category,image_url,price,stock,status,is_distribution,commission_rate,commission_rate_level1,commission_rate_level2) VALUES(15,'Test zero commission','accessory','',1000,10,'on',1,9.25,0,0)");
      const catalog=await api('/api/v1/distribution/products',wxToken);
      const product=catalog.data.data.list.find(item => item.id === '15');
      assert.equal(Number(product.commissionRateLevel1),0);
      assert.equal(product.commission,0);
      const order=await api('/api/v1/orders',wxToken,{
        items:[{productId:15,quantity:1}],
        shippingAddress:{contactName:'Test',phone:'13800138001',detailAddress:'Test address'}
      });
      assert.equal(order.status,200,JSON.stringify(order.data));
      const [[snapshot]]=await admin.query('SELECT commission_rate_level1_snapshot,commission_rate_snapshot FROM order_items WHERE order_id=?',[order.data.data.id]);
      assert.equal(Number(snapshot.commission_rate_level1_snapshot),0);
      assert.equal(Number(snapshot.commission_rate_snapshot),0);
    });
    await t.test('no payment simulation even when old switch is true', async () => {
      process.env.NODE_ENV='development';
      process.env.ENABLE_MOCK_WECHAT_PAY='true';
      assert.equal((await import('../wechatPay.js')).allowDevMockWechatPay(),false);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
    if (database) await database.closePool();
    // Only the fresh, explicitly named test schema is removed.
    assert.match(schema,/^hanjing_test_distribution_[0-9]+$/);
    await admin.query('DROP DATABASE ' + schema);
    await admin.end();
  }
});
