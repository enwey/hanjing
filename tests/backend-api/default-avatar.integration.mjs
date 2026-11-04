import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
import {BRAND_AVATAR,publicAvatar} from '../../hanjing-clinic-backend/brand-avatar.js';
test('known defaults are normalized while uploads and empty values remain unchanged',()=>{
 for(const path of ['/static/images/brand-koala.png','/static/icons/koala-outline.svg','/static/demo/avatar.jpg','/api/v1/community/brand-logo.png','/static/images/brand-logo.png']) {
  assert.equal(publicAvatar(path),BRAND_AVATAR);assert.equal(publicAvatar('https://clinic.example'+path+'?cached=1'),BRAND_AVATAR);
 }
 for(const p of ['/uploads/personal.png','https://cdn.example/avatar.jpg','wxfile://avatar',''])assert.equal(publicAvatar(p),p);
 assert.equal(publicAvatar(null),'');
});
test('actual client API returns current default avatars without rewriting stored photos',{timeout:120000},async()=>{
 const schema='hanjing_test_avatar_'+Date.now();let db,server;
 const conn=await mysql.createConnection({host:'127.0.0.1',user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'});
 try {
  await conn.query(`CREATE DATABASE ${schema}`);await conn.query(`USE ${schema}`);
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_USER:process.env.TEST_DB_USER||'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root',DB_NAME:schema,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex')});
  db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
  await conn.query("INSERT INTO users(id,openid,nickname,avatar_url) VALUES(990,'avatar-fixture','Fixture','/static/demo/avatar.jpg')");
  await conn.query("INSERT INTO patients(id,patient_no,user_id,name,avatar_url) VALUES(990,'AVATAR-FIX',990,'Fixture','/static/images/brand-koala.png')");
  await conn.query("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(990,990,'self')");
  await conn.query("INSERT INTO community_posts(id,user_id,user_role,title,content,status) VALUES(990,990,'admin','Fixture','Text','approved'),(991,990,'patient','Fixture','Text','approved')");
  await conn.query("INSERT INTO doctors(id,name,title,specialty,avatar_url) VALUES(990,'Fixture','Fixture','Fixture','/static/icons/koala-outline.svg')");
  const app=express();app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const token=jwt.sign({id:990,openid:'avatar-fixture'},process.env.JWT_SECRET,{expiresIn:'5m'});
  const get=async p=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1`+p,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return (await r.json()).data;};
  assert.equal((await get('/user/profile')).avatar,BRAND_AVATAR);
  assert.equal((await get('/user/family-members')).list[0].avatar,BRAND_AVATAR);
  assert.ok((await get('/community/posts')).every(p=>p.avatar===BRAND_AVATAR));
  assert.equal((await get('/doctors')).find(d=>d.id===990).avatarUrl,BRAND_AVATAR);
  await conn.query("UPDATE users SET avatar_url='https://cdn.example/personal.jpg' WHERE id=990");
  assert.equal((await get('/user/profile')).avatar,'https://cdn.example/personal.jpg');
  const posts=await get('/community/posts');assert.equal(posts.find(p=>p.id===991).avatar,'https://cdn.example/personal.jpg');assert.equal(posts.find(p=>p.id===990).avatar,BRAND_AVATAR);
  const [[p]]=await conn.query('SELECT avatar_url FROM patients WHERE id=990');assert.equal(p.avatar_url,'/static/images/brand-koala.png');
 }finally{if(server)await new Promise(r=>server.close(r));await db?.closePool();await conn.query(`DROP DATABASE IF EXISTS ${schema}`);await conn.end();}
});
