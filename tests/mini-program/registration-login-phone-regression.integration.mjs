// Real Express routes and isolated MySQL; only WeChat upstream and timing are controlled.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const output = new URL('./artifacts/registration-login-phone-regression-2026-11-06/', import.meta.url);
mkdirSync(output, { recursive: true });
const database = 'hanjing_test_phone_reg_' + Date.now();
assert.match(database, /^hanjing_test_phone_reg_\d+$/);
const sourcePaths = ['../../hanjing-clinic-backend/routes/client.js', '../../hanjing-clinic-backend/db.js'];
const hashes = () => Object.fromEntries(sourcePaths.map(name => [name, createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')]));
const sourceBefore = hashes();
const evidence = { phase: 'independent regression', sourceBefore, database, startedAt: new Date().toISOString(), method: 'real Express + isolated MySQL; mocked WeChat upstream', results: [], cleanup: false };
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

  const phoneA = '13800003101', phoneB = '13800003102', phoneC = '13800003103';
  let ownerId, patientId, originalPatient;
  const snapshot = async () => Object.fromEntries(await Promise.all(
    ['users','patients','user_patient_links','user_memberships','user_membership_history'].map(async name => [name, await rows(`SELECT * FROM ${name} ORDER BY 1`)])
  ));
  await run('PHONE-REG-01', async () => {
    const first = await login('independent-reg', phoneA);
    ownerId = first.user.id; patientId = first.patient.id;
    await conn.execute('UPDATE patients SET name=?,id_card=?,gender=2,age=39 WHERE id=?',
      ['regression-known-person', encryptPII('fixture-document-regression'), patientId]);
    originalPatient = await one('SELECT * FROM patients WHERE id=?', [patientId]);
    const changed = await login('independent-reg', phoneB);
    assert.equal(changed.user.id, ownerId, 'account ID changed');
    assert.equal(changed.patient.id, patientId, 'self ID changed');
    assert.ok(decryptPII(changed.patient.phone) === phoneB, 'original defect: self phone remains old');
    assert.ok(changed.patient.phone === changed.user.phone, 'single encryption mismatch');
    for (const [key,value] of Object.entries(originalPatient)) {
      if (!['phone','updated_at'].includes(key)) assert.ok(JSON.stringify(changed.patient[key]) === JSON.stringify(value), 'self field changed: '+key);
    }
    await unique('independent-reg',phoneB,ownerId);
    return { sameAccountAndPatient: true, selfPhoneSynchronized: true, singleEncryption: true, allOtherSelfFieldsPreserved: true, profileAuthenticated: true };
  });
  await run('PHONE-REG-02', async () => {
    assert.ok(ownerId && patientId, 'baseline setup required');
    for (const phone of [phoneB,phoneC,phoneC]) {
      const changed = await login('independent-reg',phone);
      assert.equal(changed.user.id,ownerId); assert.equal(changed.patient.id,patientId);
      assert.ok(decryptPII(changed.patient.phone)===phone,'repeated authorization self phone');
      await unique('independent-reg',phone,ownerId);
    }
    return { repeatedAndSecondPhoneChange: true, duplicateIdentityOrSelf: false };
  });
  await run('PHONE-REG-03', async () => {
    assert.ok(ownerId && patientId, 'baseline setup required');
    await conn.execute('INSERT INTO patients(patient_no,user_id,name,relation,phone,source) VALUES(?,?,?,?,?,?)',
      ['REG-FAMILY',ownerId,'family-preserved','other',encryptPII(phoneC),'mini_app']);
    const other = await login('other-regression-owner','13800003104');
    const protectedRows = async () => ({
      patients: await rows('SELECT * FROM patients WHERE id!=? ORDER BY id',[patientId]),
      otherUser: await rows('SELECT * FROM users WHERE id=?',[other.user.id]),
      links: await rows('SELECT * FROM user_patient_links ORDER BY id'),
    });
    const before=await protectedRows();
    const changed=await login('independent-reg',phoneA);
    assert.ok(decryptPII(changed.patient.phone)===phoneA,'authorized phone not changed');
    assert.ok(JSON.stringify(await protectedRows())===JSON.stringify(before),'family/other account/link rows changed');
    return { familySharingPreviousPhonePreserved: true, unrelatedOwnerPreserved: true, patientLinksPreserved: true };
  });
  await run('PHONE-REG-04', async () => {
    // A deliberately inconsistent existing self phone must NOT be repaired by renewal.
    await conn.execute('UPDATE patients SET phone=? WHERE id=?',[encryptPII(phoneB),patientId]);
    const before=await snapshot();
    const renewal=body('independent-reg',phoneA); delete renewal.phoneCode;
    const result=await call(renewal);
    assert.equal(result.status,200);
    const identity=jwt.verify(result.body.data.access_token,process.env.JWT_SECRET);
    assert.equal(Number(identity.id),Number(ownerId));
    assert.ok(JSON.stringify(await snapshot())===JSON.stringify(before),'no-phone renewal wrote data');
    return { verifiedRenewalSucceeded: true, fiveTableSnapshotsUnchanged: true, preexistingMismatchNotSilentlyRepaired: true };
  });
  await run('PHONE-REG-05', async () => {
    await seed('unverified-regression','13800003105',false);
    const before=await snapshot();
    const renewal=body('unverified-regression','13800003105'); delete renewal.phoneCode;
    const result=await call(renewal);
    assert.equal(result.status,401);
    assert.ok(JSON.stringify(await snapshot())===JSON.stringify(before),'rejected renewal wrote data');
    return { unverifiedPhoneRejected: true, noPatientCreationOrPhoneRewrite: true, fiveTableSnapshotsUnchanged: true };
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
  evidence.sourceAfter = hashes();
  evidence.sourceStable = JSON.stringify(evidence.sourceAfter) === JSON.stringify(sourceBefore);
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.results.filter(x => x.result === 'passed').length;
  evidence.failed = evidence.results.filter(x => x.result === 'failed').length;
  writeFileSync(new URL('results.json', output), JSON.stringify(evidence, null, 2));
  Object.assign(console, originalLog);
  console.log(JSON.stringify({ executed: evidence.results.length, passed: evidence.passed, failed: evidence.failed, cleanup: evidence.cleanup, setupError: evidence.setupError }));
  if (!evidence.sourceStable || evidence.failed || evidence.results.length !== 5 || !evidence.cleanup) process.exitCode = 1;
}
