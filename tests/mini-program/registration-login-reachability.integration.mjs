// Real Express routes and isolated MySQL; only WeChat upstream and timing are controlled.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const output = new URL('./artifacts/registration-login-reachability-2026-11-06/', import.meta.url);
mkdirSync(output, { recursive: true });
const database = 'hanjing_test_reach_' + Date.now();
assert.match(database, /^hanjing_test_reach_\d+$/);
const sourcePaths = ['../../hanjing-clinic-backend/routes/client.js', '../../hanjing-clinic-backend/db.js'];
const hashes = () => Object.fromEntries(sourcePaths.map(name => [name, createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')]));
const sourceBefore = hashes();
const evidence = { phase: 'API reachability audit; no direct business-data writes', sourceBefore, database, startedAt: new Date().toISOString(), method: 'real Express + isolated MySQL; mocked WeChat upstream', results: [], cleanup: false };
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
mysql.createPool = (...args) => {
  const pool = nativeCreatePool(...args), execute = pool.execute.bind(pool);
  pool.execute = async (sql, params) => {
    const result = await execute(sql, params);
    if (gate && /FROM user_patient_links upl/.test(sql) && /upl.relation = 'self'/.test(sql) && /ORDER BY upl.id ASC/.test(sql) && gate.waiters.length < 2) {
      const active = gate;
      let release;
      const wait = new Promise(resolve => { release = resolve; });
      active.waiters.push({ release, userId: Number(params[0]) });
      active.arrivals[active.waiters.length-1]();
      await wait;
    }
    return result;
  };
  return pool;
};
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
async function run(id, fn) {
  const item = { id, result: 'running', backendErrors: [] };
  const start = backendErrors.length;
  try { item.observations = await fn(); item.result = 'passed'; }
  catch (error) { item.result = 'failed'; if (error.observations) item.observations = error.observations; item.error = { name: error.name, code: error.code || '', message: error.message.split('\n')[0] }; }
  finally { gate?.waiters.forEach(x=>x.release()); gate = null; item.backendErrors = backendErrors.slice(start); evidence.results.push(item); originalLog.log(id + ': ' + item.result); }
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
  app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });


  async function patients(uid) { return rows('SELECT id,user_id,relation,phone,id_card FROM patients WHERE user_id=? ORDER BY id',[uid]); }
  async function account(uid) { return one('SELECT id,self_patient_id FROM users WHERE id=?',[uid]); }
  async function updateProfile(token, idCard = '110101199001010011') {
    const result=await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1/user/profile`,{
      method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({nickname:'API-reachable-person',gender:1,birthday:'1990-01-01',idCard}), signal:AbortSignal.timeout(15000)
    });
    assert.equal(result.status,200,'profile save failed');return result.json();
  }
  async function concurrent(openid,phone1,phone2) {
    let firstArrived,secondArrived;
    const firstReady=new Promise(r=>{firstArrived=r;}),secondReady=new Promise(r=>{secondArrived=r;});
    const active={waiters:[],arrivals:[firstArrived,secondArrived]};gate=active;
    const within=async promise=>{
      let timer;
      try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('reachability interleaving not reached')),10000);})]);}
      finally {clearTimeout(timer);}
    };
    const p1=call(body(openid,phone1));
    await within(firstReady);
    const p2=call(body(openid,phone2));
    await within(secondReady);
    assert.equal(active.waiters[0].userId,active.waiters[1].userId,'requests did not share account');
    active.waiters[0].release();const first=await p1;
    active.waiters[1].release();const second=await p2;
    gate=null;
    assert.equal(first.status,200);assert.equal(second.status,200);
    return {uid:active.waiters[0].userId,token:second.body.data.access_token,statuses:[first.status,second.status]};
  }
  await run('REACH-01',async()=>{
    let uid;
    for(let i=0;i<3;i++) {
      const result=await call(body('reach-normal','13800005101'));assert.equal(result.status,200);
      uid=Number(jwt.verify(result.body.data.access_token,process.env.JWT_SECRET).id);
      assert.equal((await patients(uid)).length,1,'sequential login created duplicate');
    }
    return {sequentialThreeLogins:true,selfPatientCount:1,businessDataCreatedOnlyByApi:true};
  });
  await run('REACH-02',async()=>{
    const r=await concurrent('reach-same','13800005102','13800005102');
    const before=await patients(r.uid);
    await updateProfile(r.token);
    const saved=await patients(r.uid);
    const login=await call(body('reach-same','13800005102'));assert.equal(login.status,200);
    const after=await patients(r.uid);
    return {businessDataCreatedOnlyByApi:true,controlledTwoRequestInterleaving:true,concurrentStatuses:r.statuses,
      patientsAfterConcurrent:before.length,patientsAfterSave:saved.length,patientsAfterRelogin:after.length,
      allSamePhoneProfilesReceivedIdentity:saved.every(x=>!!x.id_card),originalDestructiveStateReproduced:after.length<saved.length};
  });
  await run('REACH-03',async()=>{
    const r=await concurrent('reach-different','13800005103','13800005104');
    const before=await patients(r.uid),pointBefore=await account(r.uid);
    await updateProfile(r.token, '110101199001010022');
    const saved=await patients(r.uid);
    const current=saved.find(x=>Number(x.id)===Number(pointBefore.self_patient_id));
    const older=saved.find(x=>Number(x.id)!==Number(pointBefore.self_patient_id));
    assert.ok(current && older,'concurrent requests did not produce two profiles');
    const authorizedOldPhone=decryptPII(older.phone);
    const response=await call(body('reach-different',authorizedOldPhone));assert.equal(response.status,200);
    const after=await patients(r.uid),pointAfter=await account(r.uid);
    return {businessDataCreatedOnlyByApi:true,controlledTwoRequestInterleaving:true,concurrentStatuses:r.statuses,
      patientsAfterConcurrent:before.length,patientsAfterSave:saved.length,patientsAfterRelogin:after.length,
      explicitHadIdentityBefore:!!current.id_card,olderHadNoIdentity:!older.id_card,
      explicitPatientDeleted:!after.some(x=>Number(x.id)===Number(current.id)),
      pointerChangedToOlder:Number(pointAfter.self_patient_id)===Number(older.id),
      scope:'concurrent API logins with different authorized phones; real WeChat multi-session grants/UI reachability unverified'};
  });
} catch (error) {
  evidence.setupError = { name: error.name, code: error.code || '', message: error.message.split('\n')[0] };
  process.exitCode = 1;
} finally {
  gate?.waiters.forEach(x=>x.release()); globalThis.fetch = originalFetch; mysql.createPool = nativeCreatePool;
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
  if (!evidence.sourceStable || evidence.failed || evidence.results.length !== 3 || !evidence.cleanup) process.exitCode = 1;
}
