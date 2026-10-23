import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(new URL('../../hanjing-clinic-backend/package.json', import.meta.url));
const mysql = require('mysql2/promise'), express = require('express'), jwt = require('jsonwebtoken');
const schema = 'hanjing_test_snore_' + Date.now();
const credentials = {host:'127.0.0.1',port:3306,user:process.env.TEST_DB_USER || 'root',password:process.env.TEST_DB_PASSWORD || 'root'};
const control = await mysql.createConnection(credentials);
const results = []; let db, server;
async function check(name, fn) { try { await fn(); results.push({name,status:'PASS'}); } catch(e) { results.push({name,status:'FAIL',actual:e.message}); } }
await control.query('CREATE DATABASE `' + schema + '`');
try {
  Object.assign(process.env,{DB_HOST:credentials.host,DB_PORT:'3306',DB_USER:credentials.user,DB_PASSWORD:credentials.password,DB_NAME:schema,JWT_SECRET:randomBytes(48).toString('hex')});
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  await check('new schema includes score and unique ownership-scoped key',async()=>{
    assert.ok(await db.get("SHOW COLUMNS FROM snore_assessments LIKE 'risk_score'"));
    const keys=await db.query('SHOW INDEX FROM snore_assessments');
    const unique=keys.filter(x=>x.Non_unique===0&&x.Key_name!=='PRIMARY');
    assert.ok(unique.some(x=>x.Column_name==='user_id'));
    assert.ok(unique.some(x=>x.Column_name==='client_record_key'));
  });
  await db.run("INSERT INTO users(id,openid,nickname) VALUES(1,'SNORE-TEST-1','Test'),(2,'SNORE-TEST-2','Other')");
  await db.run("INSERT INTO patients(id,user_id,name) VALUES(1,1,'Test'),(2,2,'Other')");
  await db.run("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(1,1,'self'),(2,2,'self')");
  const helpers=await import('../../hanjing-clinic-backend/helpers.js');
  const router=(await import('../../hanjing-clinic-backend/routes/client.js')).default;
  const app=express(); app.use(express.json(),router);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const tokens=[null,...[1,2].map(id=>jwt.sign({id,openid:'SNORE-TEST-'+id},helpers.JWT_SECRET,{expiresIn:'5m'}))];
  const api=async(path,body,user=1)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/assessments${path}`,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[user],'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
  const payload=(localId,score=18)=>({localId,patientId:1,duration:60,client_side_analysis:true,analysis_result:{avgDecibel:40,peakDecibel:60,snoreRate:10,apneaEvents:0,riskLevel:'normal',riskScore:score}});
  const post=async p=>{const r=await api('/snore',p);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;};
  await check('SNORE-04 sequential retry returns same ID and one database row',async()=>{
    const a=await post(payload('repeat')),b=await post(payload('repeat'));assert.equal(a.id,b.id);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM snore_assessments')).n,1);
  });
  await check('SNORE-04 12 concurrent HTTP requests create one row',async()=>{
    const before=(await db.get('SELECT COUNT(*) AS n FROM snore_assessments')).n;
    const rows=await Promise.all(Array.from({length:12},()=>post(payload('concurrent'))));
    assert.equal(new Set(rows.map(x=>x.id)).size,1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM snore_assessments')).n,before+1);
  });
  await check('SNORE-04 conflicting metrics and score return 409 without overwrite',async()=>{
    for(const patch of [{snoreRate:11},{riskScore:19}]) {const p=payload('repeat');Object.assign(p.analysis_result,patch);assert.equal((await api('/snore',p)).status,409);}
    assert.equal((await post(payload('repeat'))).snoreAnalysis.riskScore,18);
  });
  await check('SNORE-04 same local ID remains isolated by account',async()=>{
    const p=payload('repeat');p.patientId=2;const r=await api('/snore',p,2);assert.equal(r.status,200);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM snore_assessments WHERE user_id=2')).n,1);
  });
  for(const score of [18,0,29]) await check(`RESULT-01 score ${score} survives POST, SQL, list and detail`,async()=>{
    const saved=await post(payload('score-'+score,score));assert.equal(saved.snoreAnalysis.riskScore,score);
    const row=await db.get('SELECT risk_score FROM snore_assessments WHERE id=?',[Number(saved.id.slice(6))]);assert.equal(row.risk_score,score);
    const detail=await api('/snore-analysis/'+saved.id);assert.equal(detail.status,200);assert.equal(detail.body.data.snoreAnalysis.riskScore,score);
    const list=await api('');assert.equal(list.status,200);assert.equal(list.body.data.find(x=>x.id===saved.id).snoreAnalysis.riskScore,score);
  });
  await check('legacy timestamp retry deduplicates',async()=>{
    const p=payload('unused');delete p.localId;p.timestamp=1792600000000;
    assert.equal((await post(p)).id,(await post(p)).id);
  });
} finally {
  if(server) await new Promise(resolve=>server.close(resolve));
  if(db) await db.closePool();
  // Only this run's newly created schema is removed, never the business database.
  assert.match(schema,/^hanjing_test_snore_\d+$/);
  await control.query('DROP DATABASE `'+schema+'`');
  const [left]=await control.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[schema]);
  results.push({name:'temporary schema removed',status:left.length?'FAIL':'PASS'});
  await control.end();
  console.log(JSON.stringify({scope:'real MySQL and HTTP, isolated schema and signed test identity; no WeChat login/device',schema,results},null,2));
  if(results.some(x=>x.status==='FAIL')) process.exitCode=1;
}
