// Real Express routes and isolated MySQL; only WeChat upstream and timing are controlled.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const output = new URL('./artifacts/registration-login-p0-api-retest-2026-11-06/', import.meta.url);
mkdirSync(output, { recursive: true });
const database = 'hanjing_test_api20_' + Date.now();
assert.match(database, /^hanjing_test_api20_\d+$/);
const backendRoot = new URL('../../_codex-tmp/registration-api20-source-20261106/', import.meta.url);
function sourceFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && !['node_modules','.git','uploads','tests','logs'].includes(entry.name)) return sourceFiles(new URL(entry.name+'/', dir), prefix+entry.name+'/');
    return entry.isFile() && /\.(m?js|cjs)$/.test(entry.name) ? [new URL(prefix+entry.name, backendRoot).href] : [];
  });
}
const sourcePaths = sourceFiles(backendRoot).sort();
const hashes = () => Object.fromEntries(sourcePaths.map(name => [name, createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')]));
const sourceBefore = hashes();
const evidence = { phase: '20-case API-created-data retest', sourceBefore, database, startedAt: new Date().toISOString(), method: 'real Express + isolated MySQL; mocked WeChat upstream', results: [], cleanup: false };
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
let conn, db, server, activeCase; let dropNextResponse = false;
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
const rows = async (sql, params = []) => { assert.match(sql, /^\s*(SELECT|SHOW)\b/i, 'test evidence connection must be read-only'); return (await conn.execute(sql, params))[0]; };
const one = async (sql, params = []) => (await rows(sql, params))[0];
const number = value => Number(value);
let encryptPII, decryptPII;
async function run(id, fn) {
  const item = { id, result: 'running', backendErrors: [], steps: [] }; activeCase = item;
  const start = backendErrors.length;
  try { item.observations = await fn(); item.result = item.observations.pending ? 'pending' : 'passed'; }
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
  db = await import(new URL('db.js', backendRoot).href);
  await db.initDB();
  ({ encryptPII, decryptPII } = await import(new URL('helpers.js', backendRoot).href));
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
  app.use((req,res,next) => { if (dropNextResponse && req.path.endsWith('/auth/wx-login')) { dropNextResponse=false; res.json=() => {res.destroy(); return res;}; } next(); });
  app.use((await import(new URL('routes/client.js', backendRoot).href)).default);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });



  async function http(method,path,data,token) {
    const response=await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1`+path,{
      method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)
    });
    const payload=await response.json();
    activeCase?.steps.push({method,path:path.replace(/\d+/g,':id'),status:response.status,businessCode:payload.code});
    return {status:response.status,body:payload};
  }
  async function sign(label,phone) {
    const r=await http('POST','/auth/wx-login',body(label,phone));
    assert.equal(r.status,200,'login HTTP');assert.equal(r.body.code,0,'login business');
    const p=r.body.data,identity=jwt.verify(p.access_token,process.env.JWT_SECRET);
    assert.equal(String(identity.id),String(p.user.id),'identity mismatch');assert.ok(p.user.phone===phone,'authorized number mismatch');
    const profile=await http('GET','/user/profile',undefined,p.access_token);assert.equal(profile.status,200);
    return {uid:Number(identity.id),pid:Number(profile.body.data.id),token:p.access_token,profile:profile.body.data};
  }
  async function save(r,serial) {
    const response=await http('PUT','/user/profile',{nickname:'API-user-'+serial,gender:1,birthday:'1990-01-01',idCard:'11010119900101'+String(serial).padStart(4,'0')},r.token);
    assert.equal(response.status,200,'profile save');return response;
  }
  async function family(r,phone,relation='child',idCard) {
    const response=await http('POST','/user/family-members',{name:'API-family',relation,gender:1,birthday:'2010-01-01',phone,...(idCard?{idCard}:{})},r.token);
    assert.equal(response.status,200,'family creation');return Number(response.body.data.id);
  }
  async function ess(r,pid,score=1) {
    const response=await http('POST','/assessments/ess',{patientId:String(pid),answers:Array(8).fill(score)},r.token);
    assert.equal(response.status,200,'assessment creation');return response.body.data.id;
  }
  async function own(r) {return one('SELECT * FROM patients WHERE id=?',[r.pid]);}
  async function stable(r,label,phone) {
    const accounts=await rows('SELECT id FROM users WHERE openid=? OR phone=?',[label,encryptPII(phone)]);assert.equal(accounts.length,1);
    const profiles=await rows("SELECT id FROM patients WHERE user_id=? AND relation='self'",[r.uid]);assert.equal(profiles.length,1);assert.equal(Number(profiles[0].id),r.pid);
  }
  const pending=(reason,observations={})=>({pending:true,reason,...observations});
  await run('REG-001',async()=>{
    const r=await sign('api20-reg1','13800006101');await stable(r,'api20-reg1','13800006101');
    const p=await own(r),u=await one('SELECT * FROM users WHERE id=?',[r.uid]);
    assert.ok(u.phone_verified_at && p.phone===u.phone);
    return {businessDataOnlyViaApi:true,verifiedAccountAndUniqueSelf:true};
  });
  await run('REG-002',async()=>{
    const a=await sign('api20-reg2','13800006102');for(let i=0;i<3;i++){const b=await sign('api20-reg2','13800006102');assert.equal(b.uid,a.uid);assert.equal(b.pid,a.pid);}
    await stable(a,'api20-reg2','13800006102');return {businessDataOnlyViaApi:true,threeSequentialReloginsStable:true};
  });
  await run('REG-003',async()=>{
    const a=await sign('api20-reg3a','13800006103');await ess(a,a.pid);
    const before=await rows('SELECT * FROM ess_assessments WHERE user_id=?',[a.uid]);
    const b=await sign('api20-reg3b','13800006103');assert.equal(a.uid,b.uid);assert.equal(a.pid,b.pid);
    assert.deepEqual(await rows('SELECT * FROM ess_assessments WHERE user_id=?',[a.uid]),before);
    return {businessDataOnlyViaApi:true,newOpenidReusedApiCreatedPhoneAccount:true,assessmentPreserved:true,realWechatCrossIdentityPhoneAuthorizationUnverified:true};
  });
  await run('REG-004',async()=>{
    const r=await sign('api20-reg4','13800006104');const u=await one('SELECT phone_verified_at FROM users WHERE id=?',[r.uid]);assert.ok(u.phone_verified_at);
    return pending('Authorized login creates verified phone; no demonstrated business route removes verification while retaining this WeChat identity.',{normalApiCreatesVerifiedPhone:true});
  });
  await run('REG-005',async()=>{
    const r=await sign('api20-reg5','13800006105');const result=await http('POST','/user/change-phone',{phone:''},r.token);assert.equal(result.status,400);
    return pending('No business route demonstrated to create this existing WeChat account with empty phone; empty-number change rejected.',{emptyPhoneChangeRejected:true});
  });
  await run('REG-006',async()=>{
    const a=await sign('api20-reg6','13800006106');await save(a,106);const before=await own(a);
    const b=await sign('api20-reg6','13800006206');const after=await own(b);assert.equal(a.uid,b.uid);assert.equal(a.pid,b.pid);
    assert.ok(decryptPII(after.phone)==='13800006206');for(const key of Object.keys(before))if(!['phone','updated_at'].includes(key))assert.deepEqual(after[key],before[key],'self field '+key);
    await stable(b,'api20-reg6','13800006206');return {businessDataOnlyViaApi:true,selfPhoneSynchronized:true,allOtherSelfFieldsPreserved:true};
  });
  await run('REG-007',async()=>{
    const a=await sign('api20-reg7a','13800006107'),b=await sign('api20-reg7b','13800006207');await ess(a,a.pid);
    const c=await sign('api20-reg7a','13800006207');assert.equal(c.uid,b.uid);assert.equal(c.pid,b.pid);
    assert.equal((await rows('SELECT id FROM users WHERE id=?',[a.uid])).length,0);
    const assessment=await rows('SELECT * FROM ess_assessments WHERE user_id=? AND patient_id=?',[b.uid,b.pid]);assert.equal(assessment.length,1);
    return {businessDataOnlyViaApi:true,mergedIntoApiCreatedTarget:true,assessmentMigrated:true,realWechatDifferentPhoneGrantsUnverified:true};
  });
  await run('REG-011',async()=>{
    dropNextResponse=true;let disconnected=false;try{await http('POST','/auth/wx-login',body('api20-reg11','13800006111'));}catch{disconnected=true;}
    assert.ok(disconnected);const before=await one('SELECT id,self_patient_id FROM users WHERE openid=?',['api20-reg11']);assert.ok(before?.self_patient_id);
    activeCase.steps.push({method:'POST',path:'/auth/wx-login',transport:'connection closed by test after registration commit'});
    const r=await sign('api20-reg11','13800006111');assert.equal(r.uid,Number(before.id));assert.equal(r.pid,Number(before.self_patient_id));
    return {businessDataOnlyViaApi:true,networkDisconnectAfterCommit:true,retryReusedAccountAndSelf:true,scope:'controlled transport fault, not SQL-prepared state'};
  });
  for(const [id,same] of [['REG-012',true],['REG-013',false]]) await run(id,async()=>{
    const first='api20-'+id+'a',second=same?first:'api20-'+id+'b',phone=same?'13800006112':'13800006113';
    const result=await Promise.all([http('POST','/auth/wx-login',body(first,phone)),http('POST','/auth/wx-login',body(second,phone))]);
    const identities=await rows('SELECT id FROM users WHERE phone=?',[encryptPII(phone)]);assert.equal(identities.length,1);
    await sign(first,phone);if(!same)await sign(second,phone);
    return pending('API concurrent requests exercised without SQL data writes; actual WeChat/client concurrent credential combination not demonstrated, so no business pass.',{concurrentStatuses:result.map(x=>x.status),uniqueAccountAndRecoveryObserved:true});
  });
  await run('REG-016',async()=>{
    const filler=await sign('api20-reg16f','13800006114');await family(filler,'13800006115'); await family(filler,'13800006415');
    const r=await sign('api20-reg16','13800006116');assert.notEqual(r.uid,r.pid);await ess(r,r.pid);await ess(filler,filler.pid,2);
    assert.equal(Number((await own(r)).user_id),r.uid);
    const list=await http('GET','/assessments?patientId='+r.pid,undefined,r.token);assert.equal(list.status,200);assert.equal(list.body.data.length,1);
    assert.equal(Number(list.body.data[0].userId),r.uid);
    return {businessDataOnlyViaApi:true,distinctIdsMapToSameOwner:true,ownAssessmentVisible:true};
  });
  await run('PAT-001',async()=>{
    const r=await sign('api20-pat1','13800006117'),p=await own(r);assert.equal(p.relation,'self');assert.equal(p.source,'mini_app');assert.ok(p.patient_no&&p.card_no);
    const links=await rows('SELECT patient_id,relation FROM user_patient_links WHERE user_id=?',[r.uid]);assert.equal(links.length,1);assert.equal(Number(links[0].patient_id),r.pid);assert.equal(links[0].relation,'self');
    return {businessDataOnlyViaApi:true,defaultsAndLinkCorrect:true};
  });
  await run('PAT-002',async()=>{
    const r=await sign('api20-pat2','13800006118'),p=await own(r),u=await one('SELECT phone FROM users WHERE id=?',[r.uid]);assert.ok(p.phone===u.phone&&decryptPII(p.phone)==='13800006118');
    const detail=await http('GET','/user/family-members/'+r.pid,undefined,r.token);assert.equal(detail.status,200);assert.ok(!JSON.stringify(detail.body).includes('det:'));
    return {businessDataOnlyViaApi:true,singleEncryptionAndNoCiphertextLeak:true};
  });
  await run('PAT-003',async()=>{
    const a=await sign('api20-pat3','13800006119');await save(a,119);await ess(a,a.pid);
    const before=await own(a),records=await rows('SELECT * FROM ess_assessments WHERE user_id=?',[a.uid]);
    const b=await sign('api20-pat3','13800006119');assert.equal(b.pid,a.pid);assert.deepEqual(await own(b),before);assert.deepEqual(await rows('SELECT * FROM ess_assessments WHERE user_id=?',[a.uid]),records);
    return pending('Personal fields and API-created ESS records preserved, but existing clinical treatment records from original case not established via authorized business flow in this empty environment.',{profileAndAssessmentPreserved:true,noSqlFixtures:true});
  });
  await run('PAT-006',async()=>{
    const a=await sign('api20-pat6','13800006120'),pid=await family(a,'13800006220');
    const b=await sign('api20-pat6','13800006220');assert.equal(b.uid,a.uid);assert.equal(b.pid,pid);assert.equal((await own(b)).relation,'self');
    return {businessDataOnlyViaApi:true,apiCreatedFamilyReusedAsSelf:true,scope:'family endpoint permits optional storeId; UI requires store, not verified here'};
  });
  await run('PAT-007',async()=>{
    const other=await sign('api20-pat7f','13800006121'),pid=await family(other,'13800006221');await ess(other,pid);
    const before=await one('SELECT * FROM patients WHERE id=?',[pid]);
    const r=await sign('api20-pat7','13800006221');assert.notEqual(r.pid,pid);assert.deepEqual(await one('SELECT * FROM patients WHERE id=?',[pid]),before);
    assert.equal((await http('GET','/user/family-members/'+pid,undefined,r.token)).status,404);
    const assessmentDenied=await http('GET','/assessments?patientId='+pid,undefined,r.token); assert.ok(assessmentDenied.status>=400 && !Array.isArray(assessmentDenied.body.data),'foreign assessment leaked');
    return {businessDataOnlyViaApi:true,foreignPatientUntouchedAndPrivate:true,assessmentDenialStatus:assessmentDenied.status};
  });
  await run('PAT-008',async()=>{
    const r=await sign('api20-pat8','13800006122');await save(r,122);
    const pid=await family(r,'13800006122','child','110101201001010123'),before=await one('SELECT * FROM patients WHERE id=?',[pid]);
    const again=await sign('api20-pat8','13800006122');assert.equal(again.pid,r.pid);assert.deepEqual(await one('SELECT * FROM patients WHERE id=?',[pid]),before);
    return {businessDataOnlyViaApi:true,documentedSamePhoneFamilyNotClaimed:true};
  });
  await run('PAT-010',async()=>{
    const r=await sign('api20-pat10','13800006123');await save(r,123);
    const spouse=await family(r,'13800006223','spouse'),child=await family(r,'13800006323');await ess(r,spouse);await ess(r,child,2);
    const snapshot=async()=>({p:await rows('SELECT * FROM patients WHERE user_id=? ORDER BY id',[r.uid]),l:await rows('SELECT * FROM user_patient_links WHERE user_id=? ORDER BY id',[r.uid]),e:await rows('SELECT * FROM ess_assessments WHERE user_id=? ORDER BY id',[r.uid])});
    const before=await snapshot();const again=await sign('api20-pat10','13800006123');assert.deepEqual(await snapshot(),before);
    const list=await http('GET','/user/family-members',undefined,again.token);assert.equal(list.body.data.total,3);
    for(const pid of [spouse,child]){const e=await http('GET','/assessments?patientId='+pid,undefined,again.token);assert.equal(e.status,200);assert.equal(e.body.data.length,1);}
    return {businessDataOnlyViaApi:true,familyAndApiCreatedRecordsPreserved:true};
  });
  await run('PAT-015',async()=>{
    const r=await sign('api20-pat15','13800006124');const newer=await family(r,'13800006124','self','110101199001010124');
    const pointer=await one('SELECT self_patient_id FROM users WHERE id=?',[r.uid]);assert.equal(Number(pointer.self_patient_id),r.pid);assert.ok(newer>r.pid);
    const again=await sign('api20-pat15','13800006124');assert.equal(again.pid,r.pid);
    return pending('API can add a newer self-labelled member, but explicit self remains older; original required older unverified duplicate plus newer explicit self not reached by this sequential business path.',{twoSelfLabelsObserved:true,originalHigherExplicitPointerNotReached:true,realConcurrentAuthorizationUnverified:true});
  });
  await run('PAT-016',async()=>{
    const foreign=await sign('api20-pat16f','13800006125'),r=await sign('api20-pat16','13800006126');
    const pointer=await one('SELECT self_patient_id FROM users WHERE id=?',[r.uid]);assert.equal(Number(pointer.self_patient_id),r.pid);
    assert.equal((await http('GET','/user/family-members/'+foreign.pid,undefined,r.token)).status,404);
    return pending('Normal API flow keeps self pointer owned; no business route demonstrated that points it at another account. Healthy-state 404 is not the corrupt-pointer test.',{healthyPointerAndForeignDenialObserved:true});
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
  evidence.pending = evidence.results.filter(x => x.result === 'pending').length;
  evidence.directBusinessSqlWrites = 0;
  evidence.failed = evidence.results.filter(x => x.result === 'failed').length;
  writeFileSync(new URL('results.json', output), JSON.stringify(evidence, null, 2));
  Object.assign(console, originalLog);
  console.log(JSON.stringify({ executed: evidence.results.length, passed: evidence.passed, failed: evidence.failed, pending: evidence.pending, cleanup: evidence.cleanup, setupError: evidence.setupError }));
  if (!evidence.sourceStable || evidence.failed || evidence.results.length !== 20 || !evidence.cleanup) process.exitCode = 1;
}
