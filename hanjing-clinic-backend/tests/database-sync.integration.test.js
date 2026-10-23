import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('database schema self-check and sync endpoint', async () => {
  const schema = 'hanjing_test_sync_' + Date.now();
  const dbUser = process.env.TEST_DB_USER || 'root';
  const dbPassword = process.env.TEST_DB_PASSWORD || 'root';
  const adminConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: dbUser,
    password: dbPassword
  });

  let server, db;
  await adminConn.query('CREATE DATABASE ' + schema);

  try {
    Object.assign(process.env, {
      DB_HOST: '127.0.0.1',
      DB_PORT: '3306',
      DB_NAME: schema,
      DB_USER: dbUser,
      DB_PASSWORD: dbPassword
    });

    db = await import('../db.js');
    const helpers = await import('../helpers.js');

    // 1. Directly invoke syncDatabaseSchema
    const syncRes = await db.syncDatabaseSchema();
    assert.equal(syncRes.success, true);
    assert.equal(syncRes.database, schema);
    assert.ok(syncRes.tableCount > 20, 'Expected at least 20 tables in full schema');
    assert.ok(Array.isArray(syncRes.tables));
    assert.ok(syncRes.tables.some(t => t.name === 'patient_crm_records'));
    assert.ok(syncRes.tables.some(t => t.name === 'appointments'));
    assert.ok(syncRes.tables.some(t => t.name === 'fulfillment_cases'));

    // Check specific columns on newly created/migrated tables
    const [crmCols] = await adminConn.query(`SHOW COLUMNS FROM \`${schema}\`.patient_crm_records LIKE 'follower_id'`);
    assert.equal(crmCols.length, 1, 'follower_id column should exist on patient_crm_records');

    const [apptCols] = await adminConn.query(`SHOW COLUMNS FROM \`${schema}\`.appointments LIKE 'source'`);
    assert.equal(apptCols.length, 1, 'source column should exist on appointments');

    // 2. Setup super_admin and normal role in the database for HTTP testing
    await adminConn.query(`USE \`${schema}\``);
    await adminConn.query("INSERT INTO roles(id, name, code, status) VALUES (1, 'Super Admin', 'super_admin', 'active'), (2, 'Doctor', 'doctor', 'active')");
    await adminConn.query("INSERT INTO admin_users(id, username, password_hash, name, role_id, status) VALUES (1, 'super', 'hash', 'Super', 1, 'online'), (2, 'doc', 'hash', 'Doctor', 2, 'online')");

    // 3. Setup Express app with admin route
    const app = express();
    app.use(express.json());
    app.use((await import('../routes/admin.js')).default);
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));

    server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;

    const requestApi = async (token) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/database/sync`, {
        method: 'POST',
        headers
      });
      return { status: res.status, body: await res.json() };
    };

    // 4. Test unauthorized (no token) -> 401
    const unauthRes = await requestApi(null);
    assert.equal(unauthRes.status, 401);

    // 5. Test forbidden (doctor role, non super_admin) -> 403
    const doctorToken = jwt.sign({ id: 2, role: 'doctor', token_version: 0 }, helpers.JWT_SECRET);
    const forbiddenRes = await requestApi(doctorToken);
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.code, 403);

    // 6. Test success (super_admin role) -> 200
    const superAdminToken = jwt.sign({ id: 1, role: 'super_admin', token_version: 0 }, helpers.JWT_SECRET);
    const successRes = await requestApi(superAdminToken);
    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.code, 200);
    assert.equal(successRes.body.data.success, true);
    assert.equal(successRes.body.data.database, schema);
    assert.ok(successRes.body.data.tableCount > 20);

    // 7. Verify audit log was recorded
    const [auditLogs] = await adminConn.query("SELECT * FROM audit_logs WHERE action = 'sync_database_schema'");
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].admin_id, 1);
    assert.equal(auditLogs[0].target_type, 'system');
    assert.equal(auditLogs[0].status, 'success');

  } finally {
    if (server) server.close();
    try {
      if (db) await db.closePool();
    } catch (e) {}
    try {
      await adminConn.query('DROP DATABASE IF EXISTS ' + schema);
    } catch (e) {}
    await adminConn.end();
  }
});
