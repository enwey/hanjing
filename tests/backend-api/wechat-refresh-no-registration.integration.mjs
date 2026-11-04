import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

test('WeChat renewal never registers accounts or creates patient profiles', {timeout:120000}, async t => {
  const database='hanjing_test_wx_renew_'+Date.now();
  const conn=await mysql.createConnection({host:'127.0.0.1',user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'});
  const nativeFetch=globalThis.fetch;let db,server;
  try {
    await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:process.env.TEST_DB_USER||'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root',DB_NAME:database,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex'),WX_MINI_APP_ID:'fixture-app',WX_MINI_APP_SECRET:'fixture-secret'});
    db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
    const {encryptPII}=await import('../../hanjing-clinic-backend/helpers.js');
    globalThis.fetch=async (url,options)=>{
      const u=new URL(url);
      if(u.hostname!=='api.weixin.qq.com') return nativeFetch(url,options);
      if(u.pathname==='/sns/jscode2session') return Response.json({openid:u.searchParams.get('js_code'),unionid:'fixture-union'});
      if(u.pathname==='/cgi-bin/stable_token') return Response.json({access_token:'fixture-token',expires_in:7200});
      if(u.pathname==='/wxa/business/getuserphonenumber') return Response.json({errcode:0,phone_info:{purePhoneNumber:'13800001234'}});
      throw Error('Unexpected external request');
    };
    const app=express();app.use(express.json());app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const call=async body=>{const r=await nativeFetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/wx-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    const snapshot=async()=>{const result={};for(const table of ['users','patients','user_patient_links','user_memberships','user_membership_history'])result[table]=(await conn.query(`SELECT * FROM \`${table}\` ORDER BY 1`))[0];return result;};
    await t.test('unknown identity: 401 and no account/profile creation',async()=>{
      const before=await snapshot();const r=await call({code:'new-identity'});assert.equal(r.status,401);assert.deepEqual(await snapshot(),before);
    });
    await conn.query("INSERT INTO users(openid,nickname) VALUES ('no-phone','Legacy')");
    await t.test('existing account without phone: 401 and no profile repair',async()=>{
      const before=await snapshot();assert.equal((await call({code:'no-phone'})).status,401);assert.deepEqual(await snapshot(),before);
    });
    await conn.query("INSERT INTO users(openid,nickname,phone) VALUES ('unverified','Unverified',?)",[encryptPII('13800000001')]);
    await t.test('unverified phone requires explicit authorization',async()=>{
      const before=await snapshot();assert.equal((await call({code:'unverified'})).status,401);assert.deepEqual(await snapshot(),before);
    });
    await conn.query("INSERT INTO users(openid,nickname,phone,phone_verified_at) VALUES ('verified','Verified',?,NOW())",[encryptPII('13800000002')]);
    await t.test('verified account without patient renews read-only',async()=>{
      const before=await snapshot();const r=await call({code:'verified'});assert.equal(r.status,200);assert.equal(r.body.data.user.phone,'13800000002');assert.equal(jwt.verify(r.body.data.access_token,process.env.JWT_SECRET).openid,'verified');assert.deepEqual(await snapshot(),before);
    });
    await t.test('explicit phone authorization still creates account and self profile',async()=>{
      const r=await call({code:'authorized',phoneCode:'fixture-phone-code'});assert.equal(r.status,200);assert.equal(r.body.data.user.phone,'13800001234');
      const [[u]]=await conn.query("SELECT * FROM users WHERE openid='authorized'");assert.ok(u.phone_verified_at);assert.ok(u.self_patient_id);
      const [[p]]=await conn.query('SELECT * FROM patients WHERE id=?',[u.self_patient_id]);assert.equal(Number(p.user_id),Number(u.id));
    });
    await t.test('repeated renewal preserves existing account, patient and membership',async()=>{
      const before=await snapshot();for(let i=0;i<3;i++)assert.equal((await call({code:'authorized'})).status,200);assert.deepEqual(await snapshot(),before);
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;await db?.closePool();await conn.query(`DROP DATABASE \`${database}\``);await conn.end();
  }
});
