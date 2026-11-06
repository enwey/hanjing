import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_phone_' + Date.now();
const env = JSON.parse(execFileSync('docker', ['inspect', 'hanjing-mysql'], { encoding: 'utf8', timeout: 15000 }))[0].Config.Env;
const password = env.find(s => s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password });
const results = [], steps = []; let db, server;
const check = async (name, action) => { await action(); results.push({ name, status: 'passed' }); console.log('PASS', name); };
try {
  await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database, NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(16).toString('hex') });
  db = await import('../../hanjing-clinic-backend/db.js'); await db.initDB();
  // Only the isolated administrator/security bootstrap is initialized with SQL.
  // Stores, doctors, patients, schedules, bookings and records below use actual APIs.
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)", [JSON.stringify({ type: 'system', all_stores: false, store_ids: [] })]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'clinical-notify','unused','隔离管理员',9000)");
  const helpers = await import('../../hanjing-clinic-backend/helpers.js');
  const token = jwt.sign({ id: 9000, role: 'super_admin', token_version: 0 }, helpers.JWT_SECRET);
  const app = express(); app.use(express.json()); app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const call = async (path, body, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json(); steps.push({ method, path, status: response.status });
    assert.equal(response.status, 200, JSON.stringify(json)); return json.data;
  };
  const store = await call('/api/admin/stores', { name: '通知测试门店', code: 'NTC', address: '隔离测试地址' });
  const doctor = await call('/api/admin/doctors', { name: '通知测试医生', title: '主任医师', specialty: '睡眠医学', store_ids: [store.id] });
  const patient = await call('/api/admin/patients', { name: '通知测试就诊人', phone: '13900001234', gender: '男', age: 40, store_id: store.id });
  const p = await db.get('SELECT * FROM patients WHERE id=?', [patient.id]);

  app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  const user=await db.get('SELECT * FROM users WHERE id=?',[p.user_id]);
  const clientToken=jwt.sign({id:user.id,openid:user.openid},helpers.JWT_SECRET);
  const familyRes=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/user/family-members`,{method:'POST',headers:{Authorization:'Bearer '+clientToken,'Content-Type':'application/json'},body:JSON.stringify({name:'手机号搜索家属',relation:'spouse',gender:2,age:35,phone:'13800005678',storeId:store.id})});
  assert.equal(familyRes.status,200,await familyRes.text());
  const family=await db.get("SELECT * FROM patients WHERE name='手机号搜索家属'");assert.ok(family.phone.startsWith('det:'));
  const search=async(q,page=false)=>call('/api/admin/patients?search='+encodeURIComponent(q)+(page?'&page=1&pageSize=10':''),undefined,'GET');
  await check('完整手机号检索小程序加密患者且保持脱敏',async()=>{const rows=await search('13800005678');assert.ok(rows.some(r=>r.id===family.id));assert.equal(rows.find(r=>r.id===family.id).phone,'138****5678')});
  await check('后台明文手机号兼容检索',async()=>{assert.ok((await search('13900001234')).some(r=>r.id===p.id))});
  await check('登记账号手机号可查关联就诊人',async()=>{assert.ok((await search('13900001234')).some(r=>r.id===family.id))});
  await check('姓名搜索仍有效',async()=>{assert.ok((await search('手机号搜索家属')).some(r=>r.id===family.id))});
  await check('前后空格不影响手机号搜索',async()=>{assert.ok((await search(' 13800005678 ')).some(r=>r.id===family.id))});
  await check('分页数据和总数一致',async()=>{const r=await search('13800005678',true);assert.equal(r.pagination.total,1);assert.equal(r.list[0].id,family.id)});
  await check('不存在手机号返回空列表',async()=>{assert.deepEqual(await search('13799998888'),[])});
  await check('手机号搜索不能越过个人数据范围',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9001,'搜索受限角色','search_restricted',?)",[JSON.stringify({type:'personal',all_stores:false,store_ids:[]})]);
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9001,'patient:view')");
    await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9001,'search-restricted','unused','搜索受限成员',9001)");
    const restricted=jwt.sign({id:9001,role:'search_restricted',token_version:0},helpers.JWT_SECRET);
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/patients?search=13800005678`,{headers:{Authorization:'Bearer '+restricted}});
    assert.equal(r.status,200);assert.deepEqual((await r.json()).data,[]);
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/appointment-patient-phone-search/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
