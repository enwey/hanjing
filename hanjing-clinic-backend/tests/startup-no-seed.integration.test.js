import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

test('startup preserves operator data and never creates sample business records', async (t) => {
  // This test creates its own local schema and never connects to an existing business schema.
  const schema = 'hanjing_test_startup_' + Date.now();
  const admin = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || 'root'
  });
  await admin.query('CREATE DATABASE ' + schema);
  let db;
  try {
    Object.assign(process.env, {
      DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: schema,
      DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'root'
    });
    db = await import('../db.js');
    const restart = async () => { await db.closePool(); await db.initDB(); };
    await restart();
    await admin.query('USE ' + schema);

    const emptyTables = ['users', 'patients', 'doctors', 'stores', 'admin_users', 'products', 'coupons',
      'orders', 'distribution_orders', 'withdraw_records', 'treatment_timelines',
      'device_maintenance', 'device_feedback'];
    await t.test('fresh initialization creates schema but no sample transactions or accounts', async () => {
      for (const table of emptyTables) {
        const [[row]] = await admin.query('SELECT COUNT(*) AS count FROM ' + table);
        assert.equal(row.count, 0, table);
      }
      const [[row]] = await admin.query("SELECT COUNT(*) AS count FROM system_settings WHERE key_name IN ('distribution_settle_days','min_withdraw','withdraw_fee_rate','enable_distribution')");
      assert.equal(row.count, 0, 'financial policy requires operator configuration');
      await assert.rejects((await import('../distribution-ledger.js')).getDistributionFeatureConfig(), {statusCode:503});
    });

    await admin.query("INSERT INTO users (id,openid,nickname) VALUES (1,'STARTUP-TEST','Test user')");
    await admin.query("INSERT INTO patients (id,user_id,name,relation,patient_no) VALUES (1,1,'Test patient','self','TEST-P001'),(2,1,'Test family','child','TEST-P002')");
    await admin.query("INSERT INTO doctors (id,name,title,specialty) VALUES (1,'Test doctor','Test title','Test specialty')");
    await admin.query("INSERT INTO treatment_records (id,patient_id,doctor_id,device_model,device_product_name,start_date) VALUES (1,1,1,'Actual device','Actual device','2026-01-01'),(2,2,1,'待适配阻鼾器','待适配阻鼾器','2026-01-01')");
    await admin.query("INSERT INTO treatment_timelines (user_id,patient_id,treatment_id,event_date,event_title,event_desc) VALUES (1,2,2,'2026-01-01','Operator record','Do not delete this historical record')");
    for (const id of [1,2,3,6,8]) {
      await admin.query(`INSERT INTO products (id,name,category,image_url,gallery_urls,price,original_price,stock,sales_count,status,is_distribution,commission_rate,commission_rate_level1,commission_rate_level2)
        VALUES (?,?,'service','/static/product/screening.png','["operator-image"]',12345,15000,7,0,'on',0,9.25,0,0)`,[id,'Operator product '+id]);
    }
    await admin.query("INSERT INTO coupons (id,title,type,value,min_spend,status,valid_start,valid_end) VALUES (1,'Operator coupon','cash',321,9000,'inactive','2026-01-01','2027-01-01')");
    await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES ('distribution_settle_days','21'),('min_withdraw','75'),('withdraw_fee_rate','0.8'),('enable_distribution','false')");
    await admin.query("UPDATE system_settings SET key_value='operator-template' WHERE key_name='wechat_template_visit_reminder'");
    const [productsBefore] = await admin.query('SELECT * FROM products ORDER BY id');
    const [couponsBefore] = await admin.query('SELECT * FROM coupons ORDER BY id');
    const [settingsBefore] = await admin.query('SELECT * FROM system_settings ORDER BY key_name');
    const [timelineBefore] = await admin.query('SELECT * FROM treatment_timelines ORDER BY id');
    await restart();
    await restart();

    await t.test('repeated startup keeps product prices, intentional zero commission and coupons unchanged', async () => {
      assert.deepEqual((await admin.query('SELECT * FROM products ORDER BY id'))[0], productsBefore);
      assert.deepEqual((await admin.query('SELECT * FROM coupons ORDER BY id'))[0], couponsBefore);
      assert.deepEqual((await admin.query('SELECT * FROM system_settings ORDER BY key_name'))[0], settingsBefore);
    });
    await t.test('existing users and treatment records never receive fabricated clinical data', async () => {
      assert.deepEqual((await admin.query('SELECT * FROM treatment_timelines ORDER BY id'))[0], timelineBefore);
      for (const table of ['device_maintenance','device_feedback']) {
        const [[row]] = await admin.query('SELECT COUNT(*) AS count FROM ' + table);
        assert.equal(row.count,0,table);
      }
      const [[row]] = await admin.query('SELECT COUNT(*) AS count FROM treatment_records');
      assert.equal(row.count,2);
    });
    await t.test('legacy commission schema still migrates once', async () => {
      await admin.query('ALTER TABLE products DROP COLUMN commission_rate_level1');
      await restart();
      const [rows] = await admin.query('SELECT commission_rate_level1 FROM products');
      assert.ok(rows.every(row => Number(row.commission_rate_level1) === 9.25));
      await admin.query('UPDATE products SET commission_rate_level1=0');
      await restart();
      const [after] = await admin.query('SELECT commission_rate_level1 FROM products');
      assert.ok(after.every(row => Number(row.commission_rate_level1) === 0));
    });
  } finally {
    if (db) await db.closePool();
    assert.match(schema,/^hanjing_test_startup_[0-9]+$/);
    await admin.query('DROP DATABASE ' + schema);
    await admin.end();
  }
});
