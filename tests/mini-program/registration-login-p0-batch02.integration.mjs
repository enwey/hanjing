// Real Express routes and isolated MySQL; only WeChat upstream and timing are controlled.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const output = new URL('./artifacts/registration-login-p0-batch02-2026-11-06/', import.meta.url);
mkdirSync(output, { recursive: true });
const database = 'hanjing_test_reg_p02_' + Date.now();
assert.match(database, /^hanjing_test_reg_p02_\d+$/);
const backendRoot = new URL('../../hanjing-clinic-backend/', import.meta.url);
function sourceFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && !['node_modules','.git','uploads','tests','logs'].includes(entry.name)) return sourceFiles(new URL(entry.name+'/', dir), prefix+entry.name+'/');
    return entry.isFile() && /\.(m?js|cjs)$/.test(entry.name) ? ['../../hanjing-clinic-backend/'+prefix+entry.name] : [];
  });
}
const sourcePaths = sourceFiles(backendRoot).sort();
const hashes = () => Object.fromEntries(sourcePaths.map(name => [name, createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')]));
const sourceBefore = hashes();
const evidence = { phase: 'P0 batch 02 independent testing', sourceBefore, database, startedAt: new Date().toISOString(), method: 'real Express + isolated MySQL; mocked WeChat upstream', results: [], cleanup: false };
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
let conn, db, server;
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
  finally { item.backendErrors = backendErrors.slice(start); evidence.results.push(item); originalLog.log(id + ': ' + item.result); }
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


  await conn.query('ALTER TABLE patients AUTO_INCREMENT=50001');
  async function get(path, token) {
    const result = await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1`+path,
      { headers:{ Authorization:'Bearer '+token }, signal:AbortSignal.timeout(15000) });
    return { status:result.status, body:await result.json() };
  }
  async function auth(openid, phone) {
    const result=await call(body(openid,phone));
    assert.equal(result.status,200,'login status'); assert.equal(result.body.code,0,'login business code');
    const payload=result.body.data;
    const identity=jwt.verify(payload.access_token,process.env.JWT_SECRET);
    assert.equal(String(identity.id),String(payload.user.id),'token/login user mismatch');
    assert.ok(payload.user.phone===phone,'authorized phone mismatch');
    const profile=await get('/user/profile',payload.access_token);
    assert.equal(profile.status,200,'profile auth status'); assert.equal(profile.body.code,0,'profile business code');
    return { token:payload.access_token, identity, user:payload.user, profile:profile.body.data };
  }
  let patientSequence=0;
  async function patient(userId,label,{phone=null,idCard=null,relation='self',point=true}={}) {
    const no='B02-'+ ++patientSequence;
    const [created]=await conn.execute('INSERT INTO patients(patient_no,card_no,user_id,name,relation,phone,id_card,source,gender,age) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [no,no,userId,label,relation,phone?encryptPII(phone):null,idCard?encryptPII(idCard):null,'mini_app',1,36]);
    const id=number(created.insertId);
    await conn.execute('INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(?,?,?)',[userId,id,relation]);
    if(relation==='self' && point) await conn.execute('UPDATE users SET self_patient_id=? WHERE id=?',[id,userId]);
    return id;
  }
  async function device(patientId,label) {
    const [d]=await conn.execute('INSERT INTO patient_devices(patient_id,device_model,device_name_snapshot,bound_at,status) VALUES(?,?,?,?,?)',
      [patientId,label,label,'2026-11-01','active']);
    return number(d.insertId);
  }
  async function personSnapshot(id) { return await one('SELECT * FROM patients WHERE id=?',[id]); }
  async function selfId(userId) { return number((await one('SELECT self_patient_id FROM users WHERE id=?',[userId])).self_patient_id); }
  function check(condition,message,observations) {
    if(!condition) { const error=new Error(message);error.observations=observations;throw error; }
  }
  await run('REG-016',async()=>{
    const uid=await seed('b02-reg16','13800004101');
    const pid=await patient(uid,'identity-marker',{phone:'13800004101',idCard:'110101199001010011'});
    const foreignUid=await seed('b02-reg16-foreign','13800004102');
    const [order]=await conn.execute('INSERT INTO orders(order_no,user_id,total_amount,pay_amount,status) VALUES(?,?,?,?,?)',['B02-OWN',uid,123,123,'completed']);
    await conn.execute('INSERT INTO orders(order_no,user_id,total_amount,pay_amount,status) VALUES(?,?,?,?,?)',['B02-FOREIGN',foreignUid,456,456,'completed']);
    const r=await auth('b02-reg16','13800004101');
    assert.notEqual(number(uid),number(pid),'fixture must distinguish account and patient ID');
    assert.equal(number(r.identity.id),uid); assert.equal(number(r.user.id),uid);
    assert.equal(number(r.profile.id),pid,'profile ID must resolve to this owner self patient');
    assert.equal(number((await personSnapshot(r.profile.id)).user_id),uid);
    const list=await get('/orders',r.token);assert.equal(list.status,200);
    assert.deepEqual(list.body.data.map(x=>number(x.id)),[number(order.insertId)],'orders crossed account boundary');
    return { distinctAccountAndPatientId:true, profileIdMappedToTokenOwner:true, tokenAndLoginUserMatch:true, authenticatedOrdersOnlyOwn:true };
  });
  await run('PAT-001',async()=>{
    const r=await auth('b02-pat01','13800004103');
    const u=await one('SELECT * FROM users WHERE id=?',[r.user.id]);
    const p=await personSnapshot(u.self_patient_id);
    assert.equal(p.relation,'self'); assert.equal(p.source,'mini_app');assert.equal(number(p.user_id),number(u.id));
    assert.ok(p.patient_no && p.card_no && p.patient_no===p.card_no,'patient/card number invalid');
    const link=await rows('SELECT * FROM user_patient_links WHERE user_id=?',[u.id]);
    assert.equal(link.length,1);assert.equal(number(link[0].patient_id),number(p.id));assert.equal(link[0].relation,'self');
    await unique('b02-pat01','13800004103',u.id);
    return { correctDefaults:true, uniqueSelfAndLink:true, patientAndCardNumberValid:true };
  });
  await run('PAT-002',async()=>{
    const r=await auth('b02-pat02','13800004104');
    const u=await one('SELECT * FROM users WHERE id=?',[r.user.id]),p=await personSnapshot(u.self_patient_id);
    assert.ok(u.phone===p.phone && u.phone.startsWith('det:'),'stored phone must share encrypted value');
    assert.ok(decryptPII(u.phone)==='13800004104' && decryptPII(p.phone)==='13800004104','single decryption mismatch');
    const detail=await get('/user/family-members/'+p.id,r.token);assert.equal(detail.status,200);
    assert.ok(detail.body.data.phone==='13800004104' && !JSON.stringify(detail.body).includes('det:'),'encrypted phone leaked in patient API');
    return { singleEncryption:true, databaseCipherNotPlaintext:true, patientApiNoCiphertext:true };
  });
  await run('PAT-003',async()=>{
    const uid=await seed('b02-pat03','13800004105');
    const pid=await patient(uid,'real-name-preserved',{phone:'13800004105',idCard:'110101199001010022'});
    const did=await device(pid,'preserved-therapy');
    const before=await personSnapshot(pid),deviceBefore=await one('SELECT * FROM patient_devices WHERE id=?',[did]);
    const r=await auth('b02-pat03','13800004105');assert.equal(await selfId(uid),pid);
    assert.ok(JSON.stringify(await personSnapshot(pid))===JSON.stringify(before),'real self fields changed');
    assert.deepEqual(await one('SELECT * FROM patient_devices WHERE id=?',[did]),deviceBefore);
    const treatment=await get('/treatment/records?patientId='+pid,r.token);assert.equal(treatment.status,200);
    assert.ok(treatment.body.data.list.some(x=>number(x.id)===did),'existing therapy not accessible');
    await unique('b02-pat03','13800004105',uid);
    return { sameSelfId:true, allSelfFieldsPreserved:true, therapySnapshotPreservedAndReadable:true };
  });
  await run('PAT-006',async()=>{
    const uid=await seed('b02-pat06','13800004106');
    const pid=await patient(uid,'existing-same-phone',{phone:'13800004106',relation:'other',point:false});
    const r=await auth('b02-pat06','13800004106');
    assert.equal(await selfId(uid),pid);const p=await personSnapshot(pid);assert.equal(p.relation,'self');
    assert.equal(number(r.profile.id),pid);assert.equal((await rows('SELECT id FROM patients WHERE user_id=?',[uid])).length,1);
    await unique('b02-pat06','13800004106',uid);
    return { existingPatientReused:true, selfLinkCorrect:true, noDuplicateProfile:true };
  });
  await run('PAT-007',async()=>{
    const foreign=await seed('b02-pat07-foreign','13800004107');
    const pid=await patient(foreign,'foreign-phone-marker',{phone:'13800004108'});
    const did=await device(pid,'foreign-therapy-marker');
    const before=await personSnapshot(pid);
    const r=await auth('b02-pat07-new','13800004108');
    assert.notEqual(number(r.profile.id),pid);assert.notEqual(number(r.user.id),foreign);
    assert.ok(JSON.stringify(await personSnapshot(pid))===JSON.stringify(before),'foreign patient changed');
    assert.equal((await get('/user/family-members/'+pid,r.token)).status,404,'foreign detail visible');
    const family=await get('/user/family-members',r.token);assert.ok(!family.body.data.list.some(x=>number(x.id)===pid));
    const therapy=await get('/treatment/records?patientId='+pid,r.token);
    assert.ok(therapy.status>=400 || !therapy.body.data?.list?.some(x=>number(x.id)===did),'foreign therapy visible');
    return { foreignPatientUntouched:true, newSelfDistinct:true, foreignDetailRejected:true, foreignTherapyHidden:true };
  });
  await run('PAT-008',async()=>{
    const uid=await seed('b02-pat08','13800004109');
    const familyId=await patient(uid,'documented-family',{phone:'13800004109',idCard:'110101199001010033',relation:'child',point:false});
    const self=await patient(uid,'current-self',{phone:'13800004109',idCard:'110101199001010044'});
    const before=await personSnapshot(familyId);
    const r=await auth('b02-pat08','13800004109');
    assert.equal(await selfId(uid),self);assert.equal(number(r.profile.id),self);
    assert.ok(JSON.stringify(await personSnapshot(familyId))===JSON.stringify(before),'documented family was reassigned');
    return { documentedFamilyNotClaimed:true, currentSelfPreserved:true };
  });
  await run('PAT-010',async()=>{
    const uid=await seed('b02-pat10','13800004110');
    const self=await patient(uid,'current-parent',{phone:'13800004110',idCard:'110101199001010055'});
    const spouse=await patient(uid,'spouse-person',{phone:'13800004111',relation:'spouse',point:false});
    const child=await patient(uid,'child-person',{phone:'13800004112',relation:'child',point:false});
    const spouseDevice=await device(spouse,'spouse-device'),childDevice=await device(child,'child-device');
    const snapshot=async()=>({patients:await rows('SELECT * FROM patients WHERE user_id=? ORDER BY id',[uid]),links:await rows('SELECT * FROM user_patient_links WHERE user_id=? ORDER BY id',[uid]),devices:await rows('SELECT * FROM patient_devices WHERE patient_id IN (?,?) ORDER BY id',[spouse,child])});
    const before=await snapshot();const r=await auth('b02-pat10','13800004110');
    assert.ok(JSON.stringify(await snapshot())===JSON.stringify(before),'family or therapy snapshot changed');
    const list=await get('/user/family-members',r.token);assert.equal(list.status,200);
    assert.deepEqual(list.body.data.list.map(x=>number(x.id)).sort((a,b)=>a-b),[self,spouse,child].sort((a,b)=>a-b));
    for(const [pid,did] of [[spouse,spouseDevice],[child,childDevice]]) {
      const result=await get('/treatment/records?patientId='+pid,r.token);assert.equal(result.status,200);
      assert.ok(result.body.data.list.some(x=>number(x.id)===did),'family therapy inaccessible');
    }
    return { oneSelfAndTwoFamilyMembers:true, allRowsPreserved:true, familyAndTherapyApiReadable:true };
  });
  await run('PAT-015',async()=>{
    const uid=await seed('b02-pat15','13800004113');
    const legacy=await patient(uid,'legacy-duplicate-self',{phone:'13800004113',point:false});
    const explicit=await patient(uid,'explicit-documented-self',{phone:'13800004113',idCard:'110101199001010066'});
    const r=await auth('b02-pat15','13800004113');
    const observations={ explicitPatientRetained:!!await personSnapshot(explicit), explicitPointerPreserved:(await selfId(uid))===explicit, selectedLegacy:(await selfId(uid))===legacy, profileUsesExplicit:number(r.profile.id)===explicit };
    check(observations.explicitPatientRetained && observations.explicitPointerPreserved && observations.profileUsesExplicit,'explicit self replaced by lower-ID legacy same-phone patient',observations);
    return observations;
  });
  await run('PAT-016',async()=>{
    const foreign=await seed('b02-pat16-foreign','13800004114');
    const foreignPatient=await patient(foreign,'private-foreign-person',{phone:'13800004114',idCard:'110101199001010077'});
    const uid=await seed('b02-pat16','13800004115');
    const actualSelf=await patient(uid,'legitimate-legacy-self',{phone:'13800004115',idCard:'110101199001010088'});
    await conn.execute('UPDATE users SET self_patient_id=? WHERE id=?',[foreignPatient,uid]);
    const before=await personSnapshot(foreignPatient);
    const r=await auth('b02-pat16','13800004115');
    assert.equal(number(r.profile.id),actualSelf,'profile followed foreign self pointer');
    assert.equal(number((await personSnapshot(r.profile.id)).user_id),uid);
    const detail=await get('/user/family-members/'+foreignPatient,r.token);assert.equal(detail.status,404);
    assert.ok(JSON.stringify(await personSnapshot(foreignPatient))===JSON.stringify(before),'foreign self data changed');
    return { profileFallsBackToOwnedSelf:true, foreignDetailRejected:true, foreignPatientUntouched:true, invalidPointerRepaired:(await selfId(uid))===actualSelf };
  });
} catch (error) {
  evidence.setupError = { name: error.name, code: error.code || '', message: error.message.split('\n')[0] };
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
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
  if (!evidence.sourceStable || evidence.failed || evidence.results.length !== 10 || !evidence.cleanup) process.exitCode = 1;
}
