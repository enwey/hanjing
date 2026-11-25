import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createCipheriv, generateKeyPairSync, privateDecrypt, sign, verify } from 'node:crypto';

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
      if (['application_migrations', 'withdraw_bank_cards', 'wechat_withdraw_authorizations', 'wechat_withdraw_transfers'].includes(name)) continue;
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
    const savedCards = await import('../withdraw-bank-cards.js');
    await savedCards.initWithdrawBankCards(database.query);
    const wechat = await import('../wechat-withdrawals.js');
    await wechat.initWechatWithdrawals(database.query);
    await wechat.initWechatWithdrawals(database.query);
    const app = express();
    app.post(wechat.authorizationCallbackPath, express.raw({ type: 'application/json' }), wechat.receiveWechatAuthorization);
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
    await admin.query("INSERT INTO distributors(id,user_id,nickname,invite_code,source_type,status) VALUES(2,NULL,'Backend fixture','BACKEND_TEST','backend','active')");
    await admin.query("INSERT INTO promoter_accounts(distributor_id,login_name,password_hash) VALUES(2,'test-promoter',?)", [helpers.hashPassword('TestPassword123')]);
    const promoterLogin = await api('/api/promoter/login', '', { account: 'test-promoter', password: 'TestPassword123' });
    assert.equal(promoterLogin.status, 200);
    const promoterToken = promoterLogin.data.data.token;
    const adminToken = jwt.sign({ id: 1, role: 'super_admin', token_version: 0 }, helpers.JWT_SECRET);
    await admin.query("INSERT INTO roles(id,name,code,status) VALUES(1,'Test admin','super_admin','active'),(2,'Test staff','receptionist','active')");
    await admin.query("UPDATE roles SET data_scope=? WHERE id=1", [JSON.stringify({ type: 'system' })]);
    await admin.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1,'test-admin','unused','Admin',1,'online'),(2,'test-staff','unused','Staff',2,'online')");
    const bank = { amount: 15000, method: 'bank', bankInfo: { bankName: 'Test Bank', accountName: 'Test', accountNo: '1234567890123456' } };

    await t.test('parallel settlement credits each commission once', async () => {
      const amounts = await Promise.all([ledger.settleCommissions(1), ledger.settleCommissions(1)]);
      assert.equal(amounts.reduce((a,b) => a+b,0), 20000);
      const [[row]] = await admin.query('SELECT available_commission FROM distributors WHERE id=1');
      assert.equal(row.available_commission, 20000);
    });
    await t.test('bank withdrawals and rules use the general minimum even with a legacy bank setting', async () => {
      await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES ('bank_min_withdraw','80')");
      assert.equal((await api('/api/admin/settings', adminToken, { min_withdraw: 50 })).status, 200);
      assert.equal((await ledger.getDistributionFeatureConfig()).minWithdrawAmount, 5000);
      const rules = await api('/api/v1/distribution/rules', wxToken);
      assert.ok(rules.data.data.withdrawRules.includes('提现门槛：满 50 元即可申请提现；'));
      assert.ok(rules.data.data.commissionRules.some(rule => rule.includes('等待 0 天')));
      assert.ok(rules.data.data.withdrawRules.some(rule => rule.includes('0.2% 手续费')));
      assert.ok(!rules.data.data.withdrawRules.some(rule => rule.includes('银行卡最低提现金额')));
      const rejected = await api('/api/v1/distribution/withdraw', wxToken, { ...bank, amount: 4999 });
      assert.equal(rejected.status, 400);
      assert.match(rejected.data.message, /50\.00/);
      assert.equal((await api('/api/admin/settings', adminToken, { min_withdraw: 1 })).status, 200);
      await admin.query("DELETE FROM system_settings WHERE key_name='bank_min_withdraw'");
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
      const result = await api('/api/v1/distribution/withdraws', wxToken);
      assert.equal(result.status,200);
      assert.equal(result.data.data.list[0].status,'approved');
      assert.equal(result.data.data.list[0].amount,15000);
    });
    await t.test('manual payout requires a reference and cannot be registered twice', async () => {
      const accountPath='/api/admin/distribution/withdraws/' + withdrawal.id + '/account';
      const unauthorizedToken=jwt.sign({id:2,role:'receptionist',token_version:0},helpers.JWT_SECRET);
      assert.equal((await api(accountPath,unauthorizedToken)).status,403);
      const account=await api(accountPath,adminToken);
      assert.equal(account.status,200);
      assert.equal(account.data.data.accountNo,bank.bankInfo.accountNo);
      const path='/api/admin/distribution/withdraws/' + withdrawal.id + '/paid';
      assert.equal((await api(path,adminToken,{reference:''},'PUT')).status,400);
      const results=await Promise.all([api(path,adminToken,{reference:'TEST-RECEIPT-0001'},'PUT'),api(path,adminToken,{reference:'TEST-RECEIPT-0001'},'PUT')]);
      assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
      const result=await api('/api/v1/distribution/withdraws',wxToken);
      assert.equal(result.status,200);
      assert.equal(result.data.data.list[0].status,'paid');
      assert.equal(result.data.data.list[0].actualAmount,14900);
      assert.equal(result.data.data.list[0].accountInfo.accountNoEncrypted,undefined);
      const overview=(await api('/api/v1/distribution/info',wxToken)).data.data;
      assert.equal(overview.totalCommission,20000);
      assert.equal(overview.availableCommission,5000);
      assert.equal(overview.withdrawnAmount,15000);
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
      const promoterResponse=await api('/api/promoter/send-code','',{phone:'13800138001'});
      assert.equal(promoterResponse.status,400);
      assert.match(promoterResponse.data.message,/账号密码登录/);
      const response=await api('/api/v1/user/send-code',wxToken,{phone:'13800138001'});
      assert.equal(response.status,503);
      assert.equal(response.data.data,undefined);
    });
    await t.test('disabled promoter token cannot read patient data', async () => {
      assert.equal((await api('/api/promoter/patients',promoterToken)).status,200);
      await admin.query("UPDATE distributors SET status='inactive' WHERE id=2");
      assert.equal((await api('/api/promoter/patients',promoterToken)).status,401);
      await admin.query("UPDATE distributors SET status='active' WHERE id=2");
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
    await t.test('saved cards are owner-scoped and edits never change withdrawal snapshots', async () => {
      const cardsPath = '/api/v1/distribution/withdraw-bank-cards';
      const withdrawPath = '/api/v1/distribution/withdraw';
      const getCards = async token => (await api(cardsPath, token)).data.data.list;
      const initial = await getCards(wxToken);
      assert.equal(initial.length, 1);
      const first = initial[0];
      assert.equal(first.maskedAccountNo, '**** 3456');
      assert.equal(first.needsAccountNo, false);
      assert.equal(first.accountNoEncrypted, undefined);
      assert.equal(first.accountNo, undefined);

      const otherBank = { bankName: 'Second Bank', accountName: 'Test', accountNo: '1234567890765432' };
      assert.equal((await api(withdrawPath, wxToken, { ...bank, amount: 1000, bankInfo: otherBank })).status, 200);
      const [second] = await getCards(wxToken);
      assert.equal(second.maskedAccountNo, '**** 5432');

      await admin.query("INSERT INTO users(id,openid,nickname) VALUES (3,'test_fixture_3','Third')");
      const otherToken = jwt.sign({ id: 3, openid: 'test_fixture_3' }, helpers.JWT_SECRET);
      assert.deepEqual(await getCards(otherToken), []);
      assert.equal((await api(cardsPath + '/' + first.id, otherToken, otherBank, 'PUT')).status, 404);
      assert.equal((await api(cardsPath + '/' + first.id, otherToken, undefined, 'DELETE')).status, 404);

      assert.equal((await api(cardsPath + '/' + first.id, wxToken, otherBank, 'PUT')).status, 409);
      const newName = { bankName: 'Updated Bank', accountName: 'Test' };
      const update = await api(cardsPath + '/' + first.id, wxToken, newName, 'PUT');
      assert.equal(update.status, 200);
      assert.equal(update.data.data.maskedAccountNo, first.maskedAccountNo);
      assert.equal((await getCards(wxToken))[0].id, second.id);
      assert.equal((await api(withdrawPath, wxToken, { amount: 1000, method: 'bank', bankCardId: first.id })).status, 200);
      assert.deepEqual((await getCards(wxToken)).map(card => card.id), [first.id, second.id]);

      const [[latest]] = await admin.query('SELECT account_info FROM withdraw_records WHERE user_id=1 ORDER BY id DESC LIMIT 1');
      const snapshot = JSON.parse(latest.account_info);
      assert.equal(snapshot.bankName, 'Updated Bank');
      assert.equal(helpers.decryptPII(snapshot.accountNoEncrypted), bank.bankInfo.accountNo);
      assert.equal((await api(cardsPath + '/' + first.id, wxToken, undefined, 'DELETE')).status, 200);
      assert.equal((await api(withdrawPath, wxToken, { amount: 1000, method: 'bank', bankCardId: first.id })).status, 404);
      assert.deepEqual((await getCards(wxToken)).map(card => card.id), [second.id]);
      const [[original]] = await admin.query('SELECT account_info FROM withdraw_records WHERE id=?', [withdrawal.id]);
      assert.equal(JSON.parse(original.account_info).bankName, bank.bankInfo.bankName);
    });

    await t.test('legacy withdrawal cards backfill once and masked-only cards can be completed', async () => {
      const cardsPath = '/api/v1/distribution/withdraw-bank-cards';
      const token = jwt.sign({ id: 3, openid: 'test_fixture_3' }, helpers.JWT_SECRET);
      // Old snapshots are storage-format fixtures for the migration, independent of ledger tests.
      const numbers = ['1234567890100001', '1234567890100002'];
      for (const account of [
        { method: 'bank', bankName: 'Old Bank', accountName: 'Test', accountNoEncrypted: helpers.encryptPII(numbers[0]) },
        { method: 'bank', bankName: 'Other Bank', accountName: 'Test', accountNo: numbers[1] },
        { method: 'bank', bankName: 'Renamed Bank', accountName: 'Test', accountNoEncrypted: helpers.encryptPII(numbers[0]) },
        { method: 'bank', bankName: 'Masked Bank', accountName: 'Test', accountNo: '********0003' },
        { method: 'wechat', label: '微信零钱' },
      ]) {
        await admin.query("INSERT INTO withdraw_records (user_id,amount,fee,actual_amount,status,account_info) VALUES (3,1000,100,900,'rejected',?)",
          [JSON.stringify(account)]);
      }
      await savedCards.backfillWithdrawBankCards(database.query, database.transaction);
      const list = (await api(cardsPath, token)).data.data.list;
      assert.deepEqual(list.map(card => card.bankName), ['Masked Bank', 'Renamed Bank', 'Other Bank']);
      assert.equal(list[0].maskedAccountNo, '**** 0003');
      assert.equal(list[0].needsAccountNo, true);
      assert.equal((await api('/api/v1/distribution/withdraw', wxToken, {
        amount: 1000, method: 'bank', bankCardId: list[1].id,
      })).status, 404);
      const editPath = cardsPath + '/' + list[0].id;
      assert.equal((await api(editPath, token, { bankName: 'Masked Bank', accountName: 'Test' }, 'PUT')).status, 400);
      const completed = await api(editPath, token, {
        bankName: 'Masked Bank', accountName: 'Test', accountNo: '1234567890100003',
      }, 'PUT');
      assert.equal(completed.status, 200);
      assert.equal(completed.data.data.needsAccountNo, false);
      assert.equal((await api(editPath, token, undefined, 'DELETE')).status, 200);
      await savedCards.backfillWithdrawBankCards(database.query, database.transaction);
      assert.deepEqual((await api(cardsPath, token)).data.data.list.map(card => card.id), [list[1].id, list[2].id]);
    });
    await t.test('WeChat authorization, approval, signed reconciliation and credit/debit are idempotent', async t => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const appId = 'wx-test-transfer';
      const mchId = '1234567890';
      const platformSerial = 'PUB_KEY_ID_FIXTURE';
      const apiV3Key = 'Fixture_APIv3_key_12345678901234';
      const payer = 40;
      const openid = 'oFixtureTransfer_1234567890';
      const auths = new Map();
      const transfers = new Map();
      let transferPosts = 0;
      const signedResponse = (payload, valid = true) => {
        const body = JSON.stringify(payload);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = 'test-response';
        return new Response(body, { headers: {
          'Wechatpay-Serial': platformSerial,
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${valid ? body : '{}'}\n`), privateKey).toString('base64')
        } });
      };
      const settings = {
        WECHAT_WITHDRAW_ENABLED: 'true', WECHAT_WITHDRAW_SCENE_ID: '1005',
        WECHAT_WITHDRAW_MIN_CENTS: '10', WECHAT_WITHDRAW_MAX_CENTS: '500000',
        WECHAT_WITHDRAW_NOTIFY_BASE_URL: 'https://example.com',
        WECHAT_APP_ID: appId, WX_MINI_APP_ID: appId, WECHAT_PAY_MCH_ID: mchId, WECHAT_PAY_SERIAL_NO: 'test-merchant-serial',
        WECHAT_PAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        WECHAT_PAY_PLATFORM_CERT: publicKey.export({ type: 'spki', format: 'pem' }),
        WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID: platformSerial, WECHAT_PAY_API_V3_KEY: apiV3Key
      };
      const oldEnv = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
      Object.assign(process.env, settings);
      const originalFetch = globalThis.fetch;
      t.after(() => {
        globalThis.fetch = originalFetch;
        for (const [key, value] of Object.entries(oldEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      });
      let nextTransfer = 'timeout';
      let invalidQuerySignature = false;
      globalThis.fetch = async (target, options) => {
        const url = new URL(target);
        if (url.hostname !== 'api.mch.weixin.qq.com') return originalFetch(target, options);
        assert.equal(options.headers['Wechatpay-Serial'], platformSerial);
        const headers = Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)].map(([, k, v]) => [k, v]));
        assert.equal(headers.mchid, mchId);
        const requestSignature = [options.method, url.pathname + url.search, headers.timestamp, headers.nonce_str, options.body || '', ''].join('\n');
        assert.ok(verify('RSA-SHA256', Buffer.from(requestSignature), publicKey, Buffer.from(headers.signature, 'base64')));
        const path = url.pathname;
        const payload = options.body && JSON.parse(options.body);
        const notFound = () => Response.json({ code: 'NOT_FOUND' }, { status: 404 });
        if (path.endsWith('/user-confirm-authorization')) {
          assert.equal(payload.openid, openid);
          assert.equal(payload.authorization_notify_url, 'https://example.com' + wechat.authorizationCallbackPath);
          const row = {
            ...payload, state: 'WAIT_USER_CONFIRM', package_info: 'wechat-authorization-package'
          };
          auths.set(payload.out_authorization_no, row);
          return signedResponse({ out_authorization_no: row.out_authorization_no, state: row.state, package_info: row.package_info });
        }
        if (path.includes('/user-confirm-authorization/out-authorization-no/')) {
          const row = auths.get(path.split('/').at(-1));
          if (!row) return notFound();
          return signedResponse({ ...row, package_info: undefined });
        }
        if (path.endsWith('/transfer-bills/transfer')) {
          transferPosts++;
          const { out_bill_no, transfer_amount, out_authorization_no, user_name } = payload;
          assert.equal(auths.get(out_authorization_no).state, 'TAKING_EFFECT');
          assert.equal(payload.transfer_scene_id, '1005');
          assert.equal(payload.notify_url, undefined);
          if (transfer_amount >= 200000) {
            assert.equal(privateDecrypt(privateKey, Buffer.from(user_name, 'base64')).toString(), '测试姓名');
          } else {
            assert.equal(user_name, undefined);
          }
          const row = {
            out_bill_no, transfer_amount, appid: appId, mch_id: mchId,
            transfer_bill_no: 'WXTRANSFER' + transferPosts, state: nextTransfer === 'timeout' ? 'SUCCESS' : nextTransfer
          };
          transfers.set(out_bill_no, row);
          if (nextTransfer === 'timeout') throw new Error('simulated connection timeout after acceptance');
          if (nextTransfer === 'FAIL') return Response.json({ code: 'SYSTEM_ERROR' }, { status: 500 });
          return signedResponse(row);
        }
        if (path.includes('/transfer-bills/out-bill-no/')) {
          const row = transfers.get(path.split('/').at(-1));
          return row ? signedResponse(row, !invalidQuerySignature) : notFound();
        }
        throw new Error('Unexpected WeChat mock URL: ' + path);
      };
      const sendCallback = async (row, state, valid) => {
        const eventType = state === 'CLOSED' ? 'CLOSED' : 'CONFIRMED';
        const data = { out_authorization_no: row.out_authorization_no, appid: appId, openid, state, authorization_id: row.authorization_id };
        const nonce = '123456789012';
        const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), nonce);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]).toString('base64');
        const delivery = signedResponse({ event_type: 'MCHTRANSFER.AUTHORIZATION.' + eventType,
          resource: { algorithm: 'AEAD_AES_256_GCM', nonce, ciphertext } }, valid);
        const headers = new Headers(delivery.headers);
        headers.set('Content-Type', 'application/json');
        return fetch('http://127.0.0.1:' + server.address().port + wechat.authorizationCallbackPath, {
          method: 'POST', headers, body: await delivery.text()
        });
      };
      await admin.query('INSERT INTO users(id,openid,nickname) VALUES(?,?,?)', [payer, openid, 'Wechat fixture']);
      await admin.query("INSERT INTO distributors(id,user_id,nickname,invite_code,total_commission,available_commission,status) VALUES(?,?,'Wechat fixture','WXPAY_FIXTURE',500000,500000,'active')", [payer, payer]);
      await admin.query("INSERT INTO orders(id,order_no,user_id,type,total_amount,pay_amount,status,pay_at) VALUES(40,'TEST-WECHAT-ORDER',40,'product',500000,500000,'completed',NOW())");
      await admin.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,commission_level,status) VALUES(40,40,'Fixture',500000,500000,1,'settled')");
      const token = jwt.sign({ id: payer, openid }, helpers.JWT_SECRET);
      const authorize = '/api/v1/distribution/withdraw-wechat-authorization';
      const apply = '/api/v1/distribution/withdraw';
      const records = '/api/v1/distribution/withdraw-records';
      const body = { method: 'wechat', amount: 1000, requestId: 'integration-withdraw-0001' };
      const approved = (id, jwt = adminToken) => api(`/api/admin/distribution/withdraws/${id}/status`, jwt, { approve: true }, 'PUT');
      const list = async () => (await api(records, token)).data.data.list;
      const balance = async () => {
        const [[row]] = await admin.query('SELECT available_commission, withdrawn_amount FROM distributors WHERE id=?', [payer]);
        return [row.available_commission, row.withdrawn_amount];
      };
      const makeDue = id => admin.query('UPDATE wechat_withdraw_transfers SET next_attempt_at=NOW(3) WHERE withdraw_id=?', [id]);

      assert.equal((await api(apply, token, body)).status, 409);
      assert.equal((await api(authorize, token, {})).data.data.package, 'wechat-authorization-package');
      assert.equal((await api(authorize, token, {})).data.data.package, 'wechat-authorization-package');
      assert.equal(auths.size, 1);
      const authorization = auths.values().next().value;
      authorization.authorization_id = 'WX-AUTH-FIXTURE';
      assert.equal((await sendCallback(authorization, 'TAKING_EFFECT', false)).status, 401);
      assert.equal((await sendCallback(authorization, 'TAKING_EFFECT', true)).status, 204);
      authorization.state = 'TAKING_EFFECT';
      assert.deepEqual((await api(authorize, token)).data.data, { enabled: true, authorized: true });
      assert.equal((await api(apply, token, { ...body, amount: 500001 })).status, 400);
      assert.equal((await api(apply, token, { ...body, amount: 200000 })).status, 400);
      const submitted = await Promise.all([api(apply, token, body), api(apply, token, body)]);
      assert.deepEqual(submitted.map(reply => reply.status), [200, 200]);
      assert.deepEqual(await balance(), [499000, 0]);
      const [first] = await list();
      assert.equal(first.status, 'pending');
      assert.deepEqual(first.accountInfo, { method: 'wechat', label: '微信零钱' });
      await wechat.processWechatWithdrawals();
      assert.equal(transferPosts, 0);
      await admin.query("INSERT INTO permissions(role_id, permission_resource) VALUES(2,'withdraw:audit')");
      await admin.query('UPDATE roles SET data_scope=? WHERE id=2', [JSON.stringify({ type: 'system' })]);
      const auditToken = jwt.sign({ id: 2, role: 'receptionist', token_version: 0 }, helpers.JWT_SECRET);
      assert.equal((await approved(first.id, auditToken)).status, 403);
      const reviews = await Promise.all([approved(first.id), approved(first.id)]);
      assert.deepEqual(reviews.map(reply => reply.status).sort(), [200, 409]);
      assert.equal((await api(`/api/admin/distribution/withdraws/${first.id}/paid`, adminToken, { reference: 'manual123' }, 'PUT')).status, 503);
      await Promise.all([wechat.processWechatWithdrawals(), wechat.processWechatWithdrawals()]);
      assert.equal(transferPosts, 1);
      assert.equal((await list())[0].wechatPayoutState, 'reconcile');
      assert.deepEqual(await balance(), [499000, 0]);
      invalidQuerySignature = true;
      await makeDue(first.id);
      await wechat.processWechatWithdrawals();
      assert.deepEqual(await balance(), [499000, 0]);
      invalidQuerySignature = false;
      await makeDue(first.id);
      await Promise.all([wechat.processWechatWithdrawals(), wechat.processWechatWithdrawals()]);
      assert.equal(transferPosts, 1);
      assert.equal((await list())[0].status, 'paid');
      assert.deepEqual(await balance(), [499000, 1000]);

      nextTransfer = 'FAIL';
      assert.equal((await api(apply, token, { ...body, requestId: 'integration-withdraw-0002', amount: 200000, realName: '测试姓名' })).status, 200);
      const [second] = await list();
      assert.equal(second.status, 'pending');
      const [[encrypted]] = await admin.query('SELECT real_name_encrypted FROM wechat_withdraw_transfers WHERE withdraw_id=?', [second.id]);
      assert.match(encrypted.real_name_encrypted, /^det:/);
      assert.equal((await approved(second.id)).status, 200);
      await wechat.processWechatWithdrawals();
      assert.deepEqual(await balance(), [299000, 1000]);
      await makeDue(second.id);
      await wechat.processWechatWithdrawals();
      assert.equal((await list())[0].wechatPayoutState, 'FAIL');
      assert.deepEqual(await balance(), [499000, 1000]);

      assert.equal((await api(apply, token, { ...body, requestId: 'integration-withdraw-0003' })).status, 200);
      const [third] = await list();
      assert.equal((await approved(third.id)).status, 200);
      assert.equal((await sendCallback(authorization, 'CLOSED', true)).status, 204);
      assert.equal((await sendCallback(authorization, 'TAKING_EFFECT', true)).status, 204);
      authorization.state = 'CLOSED';
      assert.equal((await api(authorize, token)).data.data.authorized, false);
      await wechat.processWechatWithdrawals();
      assert.equal((await list())[0].wechatPayoutState, 'FAIL');
      assert.deepEqual(await balance(), [499000, 1000]);
      assert.equal(transferPosts, 2);

      const renewed = await api(authorize, token, {});
      assert.equal(renewed.data.data.package, 'wechat-authorization-package');
      assert.equal(auths.size, 2);
      const secondAuthorization = Array.from(auths.values()).at(-1);
      secondAuthorization.state = 'TAKING_EFFECT';
      secondAuthorization.authorization_id = 'WX-AUTH-RENEWED';
      nextTransfer = 'SUCCESS';
      assert.equal((await api(apply, token, { ...body, requestId: 'integration-withdraw-0004' })).status, 200);
      const [fourth] = await list();
      assert.equal((await approved(fourth.id)).status, 200);
      await wechat.processWechatWithdrawals();
      assert.equal((await list())[0].wechatPayoutState, 'SUCCESS');
      assert.deepEqual(await balance(), [498000, 2000]);
      assert.equal(transferPosts, 3);
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
