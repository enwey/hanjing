// Real Express routes and isolated MySQL; only WeChat upstream and timing are controlled.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const fixSelftest = process.env.REG_P0_FIX_SELFTEST === '1';
const output = new URL(fixSelftest
  ? './artifacts/registration-login-phone-fix-selftest-2026-11-06/'
  : './artifacts/registration-login-p0-batch01-2026-11-06/', import.meta.url);
mkdirSync(output, { recursive: true });
const database = 'hanjing_test_reg_p0_' + Date.now();
assert.match(database, /^hanjing_test_reg_p0_\d+$/);
const evidence = { database, startedAt: new Date().toISOString(), method: 'real Express + isolated MySQL; mocked WeChat upstream', results: [], cleanup: false };
const originalFetch = globalThis.fetch;
const originalLog = { log: console.log, warn: console.warn, error: console.error };
const backendErrors = [];
// Never persist raw SQL parameters, PII, tokens or upstream credentials.
console.log = () => {};
console.warn = () => {};
console.error = (...args) => {
  const err = args.find(x => x instanceof Error);
  if (err) backendErrors.push({ code: err.code || '', errno: err.errno || null });
};
let conn, db, server, gate;
const nativeCreatePool = mysql.createPool;
// Hold completed SELECT results until both concurrent requests read the same
// pre-insert state. Queries and writes still execute against actual MySQL.
mysql.createPool = (...args) => {
  const pool = nativeCreatePool(...args);
  const execute = pool.execute.bind(pool);
  pool.execute = async (sql, params) => {
    const result = await execute(sql, params);
    const active = gate;
    if (active && active.match(sql, params) && active.arrivals < 2) {
      active.arrivals++;
      if (active.arrivals === 2) active.release();
      await active.promise;
    }
    return result;
  };
  return pool;
};
function barrier(match) {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  gate = { match, promise, release, arrivals: 0 };
  return gate;
}
let credential = 0;
const identities = new Map(), phones = new Map();
function body(openid, phone) {
  const code = 'fixture-code-' + ++credential;
  const phoneCode = 'fixture-phone-' + credential;
  identities.set(code, openid);
  phones.set(phoneCode, phone);
  return { code, phoneCode };
}
async function call(payload, options = {}) {
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/wx-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    signal: options.signal || AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
const rows = async (sql, params = []) => (await conn.execute(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];
const number = value => Number(value);
let encryptPII, decryptPII;
async function seed(label, phone = null, verified = true) {
  const [result] = await conn.execute('INSERT INTO users(openid,nickname,phone,phone_verified_at) VALUES(?,?,?,?)',
    [label, label, phone ? encryptPII(phone) : null, phone && verified ? new Date() : null]);
  return number(result.insertId);
}
async function login(openid, phone) {
  const response = await call(body(openid, phone));
  assert.equal(response.status, 200, 'authentication HTTP status');
  assert.equal(response.body.code, 0, 'authentication business code');
  const identity = jwt.verify(response.body.data.access_token, process.env.JWT_SECRET);
  assert.equal(String(identity.id), String(response.body.data.user.id), 'token/user identity mismatch');
  assert.ok(response.body.data.user.phone === phone, 'authorized phone mismatch');
  const user = await one('SELECT * FROM users WHERE id=?', [identity.id]);
  assert.ok(user && user.phone_verified_at, 'missing verified account');
  assert.equal(user.openid, openid, 'openid mismatch');
  const patient = await one('SELECT * FROM patients WHERE id=?', [user.self_patient_id]);
  assert.ok(patient, 'missing self profile');
  assert.equal(number(patient.user_id), number(user.id), 'self profile owner');
  assert.equal(patient.relation, 'self');
  assert.ok(decryptPII(user.phone) === phone, 'stored account phone mismatch');
  const links = await rows('SELECT * FROM user_patient_links WHERE user_id=? AND relation=\'self\'', [user.id]);
  assert.equal(links.length, 1, 'self link count');
  assert.equal(number(links[0].patient_id), number(patient.id), 'self link target');
  const profile = await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1/user/profile`, {
    headers: { Authorization: 'Bearer ' + response.body.data.access_token }, signal: AbortSignal.timeout(15000),
  });
  assert.equal(profile.status, 200, 'authenticated profile status');
  const data = (await profile.json()).data;
  assert.ok(data.phone === phone, 'authenticated profile phone');
  return { user, patient, response };
}
async function unique(openid, phone, expectedId) {
  const accounts = await rows('SELECT id FROM users WHERE openid=? OR phone=?', [openid, encryptPII(phone)]);
  assert.equal(accounts.length, 1, 'duplicate identity');
  if (expectedId) assert.equal(number(accounts[0].id), number(expectedId));
  const self = await rows('SELECT id FROM patients WHERE user_id=? AND relation=\'self\'', [accounts[0].id]);
  assert.equal(self.length, 1, 'duplicate self profile');
  return { accountCount: accounts.length, selfCount: self.length, userId: number(accounts[0].id) };
}
async function run(id, fn) {
  if (fixSelftest && id !== 'REG-006') return;
  const item = { id, result: 'running', backendErrors: [] };
  const start = backendErrors.length;
  try { item.observations = await fn(); item.result = 'passed'; }
  catch (error) { item.result = 'failed'; if (error.observations) item.observations = error.observations; item.error = { name: error.name, code: error.code || '', message: error.message.split('\n')[0] }; }
  finally { gate?.release(); gate = null; item.backendErrors = backendErrors.slice(start); evidence.results.push(item); originalLog.log(id + ': ' + item.result); }
}
try {
  // Read the local container credential in memory only; never print or save it.
  const inspected = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8' }))[0];
  const entry = inspected.Config.Env.find(x => x.startsWith('MYSQL_ROOT_PASSWORD='));
  const password = process.env.TEST_DB_PASSWORD ?? entry?.slice('MYSQL_ROOT_PASSWORD='.length);
  assert.ok(password, 'local database credential unavailable');
  conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'root', password, connectTimeout: 10000 });
  await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${database}\``);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: password, DB_NAME: database,
    NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(16).toString('hex'), WX_MINI_APP_ID: 'fixture-app', WX_MINI_APP_SECRET: 'fixture-secret' });
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  ({ encryptPII, decryptPII } = await import('../../hanjing-clinic-backend/helpers.js'));
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname !== 'api.weixin.qq.com') throw Error('unexpected external request');
    if (u.pathname === '/cgi-bin/stable_token') return Response.json({ access_token: 'fixture-token', expires_in: 7200 });
    if (u.pathname === '/sns/jscode2session') {
      const openid = identities.get(u.searchParams.get('js_code'));
      assert.ok(openid, 'unknown fixture credential');
      return Response.json({ openid, unionid: 'union-' + openid });
    }
    if (u.pathname === '/wxa/business/getuserphonenumber') {
      const phone = phones.get(JSON.parse(options.body).code);
      assert.ok(phone, 'unknown fixture phone credential');
      return Response.json({ errcode: 0, phone_info: { purePhoneNumber: phone } });
    }
    throw Error('unexpected WeChat path');
  };
  const app = express(); app.use(express.json());
  let lostResponse;
  app.use((req, res, next) => {
    if (lostResponse && req.path.endsWith('/auth/wx-login')) {
      const active = lostResponse; lostResponse = null;
      res.json = () => { active.committed(); return res; };
    }
    next();
  });
  app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  await run('REG-001', async () => {
    const tables = ['users', 'patients', 'user_patient_links', 'user_memberships', 'user_membership_history'];
    const before = Object.fromEntries(await Promise.all(tables.map(async name => [name, (await rows(`SELECT * FROM ${name} ORDER BY 1`))])));
    const result = await login('reg01', '13800001001');
    assert.ok(result.patient.phone === result.user.phone && decryptPII(result.patient.phone) === '13800001001', 'patient phone encryption');
    for (const name of tables) {
      const after = await rows(`SELECT * FROM ${name} ORDER BY 1`);
      assert.ok(before[name].every(old => after.some(now => JSON.stringify(now) === JSON.stringify(old))), 'unrelated rows changed: ' + name);
      if (['users', 'patients', 'user_patient_links'].includes(name)) assert.equal(after.length - before[name].length, 1, name + ' delta');
    }
    return { ...(await unique('reg01', '13800001001')), fiveTableSnapshotsChecked: true, profileAuthenticated: true };
  });
  await run('REG-002', async () => {
    const first = await login('reg02', '13800001002');
    for (let i = 0; i < 3; i++) {
      const next = await login('reg02', '13800001002');
      assert.equal(next.user.id, first.user.id); assert.equal(next.patient.id, first.patient.id);
    }
    return { ...(await unique('reg02', '13800001002', first.user.id)), repeats: 3 };
  });
  await run('REG-003', async () => {
    const id = await seed('reg03-old', '13800001003');
    const old = await login('reg03-old', '13800001003');
    await conn.execute('INSERT INTO user_notifications(user_id,title,content) VALUES(?,?,?)', [id, 'fixture-marker', 'preserve']);
    const current = await login('reg03-new', '13800001003');
    assert.equal(number(current.user.id), id); assert.equal(current.patient.id, old.patient.id);
    assert.equal((await rows('SELECT id FROM user_notifications WHERE user_id=? AND title=?', [id, 'fixture-marker'])).length, 1);
    return { ...(await unique('reg03-new', '13800001003', id)), existingRecordPreserved: true };
  });
  await run('REG-004', async () => {
    const id = await seed('reg04', '13800001004', false);
    await login('reg04', '13800001004');
    return { ...(await unique('reg04', '13800001004', id)), verifiedAtSet: true };
  });
  await run('REG-005', async () => {
    const id = await seed('reg05'); await login('reg05', '13800001005');
    return { ...(await unique('reg05', '13800001005', id)), phoneAdded: true };
  });
  await run('REG-006', async () => {
    const old = await login('reg06', '13800001006');
    if (fixSelftest) {
      await conn.execute('UPDATE patients SET name=?,id_card=?,gender=1,age=42 WHERE id=?', ['preserved-name', encryptPII('fixture-identity'), old.patient.id]);
      await conn.execute('INSERT INTO patients(patient_no,user_id,name,relation,phone,source) VALUES(?,?,?,?,?,?)',
        ['fixture-family-reg06', old.user.id, 'family-marker', 'other', encryptPII('13800001006'), 'mini_app']);
    }
    const previousPatient = await one('SELECT * FROM patients WHERE id=?', [old.patient.id]);
    const familyBefore = await rows('SELECT * FROM patients WHERE user_id=? AND relation!=\'self\' ORDER BY id', [old.user.id]);
    const next = await login('reg06', '13800002006');
    assert.equal(next.user.id, old.user.id); assert.equal(next.patient.id, old.patient.id);
    const observations = { ...(await unique('reg06', '13800002006', old.user.id)), samePatientId: true, selfPhoneMatchesNewAuthorization: decryptPII(next.patient.phone) === '13800002006' };
    if (!observations.selfPhoneMatchesNewAuthorization) {
      const error = new Error('account phone updated but self profile retains previous phone');
      error.observations = observations;
      throw error;
    }
    if (fixSelftest) {
      for (const [key, value] of Object.entries(previousPatient)) {
        if (!['phone', 'updated_at'].includes(key)) assert.ok(JSON.stringify(next.patient[key]) === JSON.stringify(value), 'unrelated self field changed: ' + key);
      }
      assert.ok(next.patient.phone === next.user.phone, 'phone must reuse single encrypted account value');
      assert.deepEqual(await rows('SELECT * FROM patients WHERE user_id=? AND relation!=\'self\' ORDER BY id', [old.user.id]), familyBefore, 'family data changed');
      const repeated = await login('reg06', '13800002006');
      assert.equal(repeated.patient.id, old.patient.id, 'repeat authorization changed self ID');
      await unique('reg06', '13800002006', old.user.id);
      const tables = ['users', 'patients', 'user_patient_links', 'user_memberships', 'user_membership_history'];
      const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async name => [name, await rows(`SELECT * FROM ${name} ORDER BY 1`)])));
      const beforeRenewal = await snapshot();
      const renewal = body('reg06', '13800002006'); delete renewal.phoneCode;
      const response = await call(renewal);
      assert.equal(response.status, 200, 'verified renewal must succeed');
      assert.deepEqual(await snapshot(), beforeRenewal, 'renewal must not write data');
      Object.assign(observations, { unrelatedSelfFieldsPreserved: true, familyUnchanged: true, singleEncryption: true, repeatedAuthorizationStable: true, renewalFiveTablesUnchanged: true });
    }
    return observations;
  });
  await run('REG-007', async () => {
    const source = await login('reg07-source', '13800001007');
    const target = await login('reg07-target', '13800002007');
    await conn.execute('INSERT INTO user_notifications(user_id,title,content) VALUES(?,?,?)', [source.user.id, 'merge-marker', 'preserve']);
    const result = await login('reg07-source', '13800002007');
    assert.equal(result.user.id, target.user.id); assert.equal(result.patient.id, target.patient.id);
    assert.equal((await rows('SELECT id FROM users WHERE id=?', [source.user.id])).length, 0);
    assert.equal((await rows('SELECT id FROM user_notifications WHERE user_id=? AND title=?', [target.user.id, 'merge-marker'])).length, 1);
    return { ...(await unique('reg07-source', '13800002007', target.user.id)), sourceRemoved: true, markerMigrated: true, scope: 'identity + self profile + notification; full merge matrix not executed' };
  });
  await run('REG-011', async () => {
    let committed;
    const ready = new Promise(resolve => { committed = resolve; });
    lostResponse = { committed };
    const abort = new AbortController();
    const pending = call(body('reg11', '13800001011'), { signal: abort.signal }).catch(error => error);
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(Error('commit acknowledgement timeout')), 15000))]);
    const first = await one('SELECT id,self_patient_id FROM users WHERE openid=?', ['reg11']);
    assert.ok(first?.self_patient_id, 'registration did not commit before response loss');
    abort.abort(); await pending;
    const next = await login('reg11', '13800001011');
    assert.equal(next.user.id, first.id); assert.equal(next.patient.id, first.self_patient_id);
    return { ...(await unique('reg11', '13800001011', first.id)), responseDroppedAfterCommit: true, samePatientId: true };
  });
  for (const [id, same] of [['REG-012', true], ['REG-013', false]]) await run(id, async () => {
    const first = same ? 'reg12' : 'reg13a', second = same ? first : 'reg13b';
    const phone = same ? '13800001012' : '13800001013';
    const active = barrier((sql, params) => same
      ? /^SELECT \* FROM users WHERE openid = \?$/.test(sql) && [first, second].includes(params?.[0])
      : /^SELECT \* FROM users WHERE phone = \?$/.test(sql) && params?.[0] === encryptPII(phone));
    const responses = await Promise.all([call(body(first, phone)), call(body(second, phone))]);
    assert.equal(active.arrivals, 2, 'concurrency barrier not reached'); gate = null;
    assert.ok(responses.some(x => x.status === 200), 'neither registration succeeded');
    await login(first, phone);
    if (!same) await login(second, phone);
    const state = await unique(second, phone);
    return { ...state, concurrentStatuses: responses.map(x => x.status), barrierArrivals: active.arrivals, recoveryAuthenticated: true };
  });
} catch (error) {
  evidence.setupError = { name: error.name, code: error.code || '', message: error.message.split('\n')[0] };
  process.exitCode = 1;
} finally {
  gate?.release(); globalThis.fetch = originalFetch; mysql.createPool = nativeCreatePool;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await db?.closePool();
  if (conn) {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    evidence.cleanup = (await conn.query('SHOW DATABASES LIKE ?', [database]))[0].length === 0;
    await conn.end();
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.results.filter(x => x.result === 'passed').length;
  evidence.failed = evidence.results.filter(x => x.result === 'failed').length;
  writeFileSync(new URL('results.json', output), JSON.stringify(evidence, null, 2));
  Object.assign(console, originalLog);
  console.log(JSON.stringify({ executed: evidence.results.length, passed: evidence.passed, failed: evidence.failed, cleanup: evidence.cleanup, setupError: evidence.setupError }));
  if (evidence.failed || evidence.results.length !== (fixSelftest ? 1 : 10) || !evidence.cleanup) process.exitCode = 1;
}
