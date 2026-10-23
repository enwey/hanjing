import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const schema = 'hanjing_test_promoter_reset_' + Date.now();
const credentials = { host: '127.0.0.1', user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || 'root' };
const control = await mysql.createConnection(credentials);
let db;
await control.query('CREATE DATABASE `' + schema + '`');
try {
  Object.assign(process.env, { DB_HOST: credentials.host, DB_USER: credentials.user, DB_PASSWORD: credentials.password, DB_NAME: schema });
  db = await import('../db.js');
  const { hashPassword, verifyPassword } = await import('../helpers.js');
  await db.run('CREATE TABLE distributors(id INT PRIMARY KEY,status VARCHAR(30),source_type VARCHAR(30))');
  await db.run('CREATE TABLE promoter_accounts(distributor_id INT PRIMARY KEY,login_name VARCHAR(64),password_hash VARCHAR(255),token_version INT DEFAULT 0)');
  await db.run('CREATE TABLE audit_logs(id INT AUTO_INCREMENT PRIMARY KEY,admin_id INT,action VARCHAR(64),target_type VARCHAR(64),target_id VARCHAR(64),details TEXT,status VARCHAR(30))');
  const oldPassword = 'Old' + crypto.randomBytes(12).toString('hex') + '1';
  const newPassword = 'New' + crypto.randomBytes(12).toString('hex') + '2';
  await db.run("INSERT INTO distributors VALUES(1,'active','backend')");
  await db.run('INSERT INTO promoter_accounts VALUES(1,?,?,0)', ['fixture_account', hashPassword(oldPassword)]);
  const { registerBackendPromoterAdmin } = await import('../backend-promoter-admin.js');
  let reset;
  registerBackendPromoterAdmin({ post() {}, get() {}, put(path, ...handlers) { if (path.endsWith('/:id/password')) reset = handlers.at(-1); } });
  const source = readFileSync(new URL('../routes/backend-promoter.js', import.meta.url), 'utf8');
  let login;
  vm.runInNewContext(source.slice(source.indexOf("app.post('/api/promoter/login'"), source.indexOf("app.post('/api/promoter/send-code'")), {
    app: { post(_path, ...handlers) { login = handlers.at(-1); } }, process,
    createRateLimiter: () => () => {}, get: db.get, verifyPassword, dummy: hashPassword('dummy'),
    jwt: { sign: payload => JSON.stringify(payload) }, JWT_SECRET: 'test', identity: row => ({ id: row.id })
  });
  const invoke = async (handler, req) => {
    let status = 200, body;
    const res = { status(value) { status = value; return res; }, json(value) { body = value; } };
    await handler(req, res); return { status, body };
  };
  const attempt = password => invoke(login, { body: { account: 'fixture_account', password } });
  assert.equal((await attempt(oldPassword)).status, 200);
  assert.equal((await invoke(reset, { params: { id: '1' }, user: { id: 1 }, body: { password: newPassword } })).status, 200);
  assert.equal((await attempt(oldPassword)).status, 401);
  const success = await attempt(newPassword);
  assert.equal(success.status, 200);
  assert.equal(JSON.parse(success.body.data.token).token_version, 1);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM audit_logs')).n, 1);
  console.log('PASS: old password works before reset; reset saved/audited; old password rejected; new password accepted; token version increased. Real isolated MySQL, actual handlers, JWT signing stubbed; not browser/HTTP auth regression.');
} finally {
  if (db) await db.closePool();
  assert.match(schema, /^hanjing_test_promoter_reset_\d+$/);
  await control.query('DROP DATABASE `' + schema + '`');
  await control.end();
  console.log('Temporary test database removed; business accounts unchanged.');
}
