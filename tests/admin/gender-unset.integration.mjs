import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_gender_' + Date.now();
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
  const patient = await call('/api/admin/patients', { name: '通知测试就诊人', phone: '13900001234', gender: '', age: 40, store_id: store.id });
  const p = await db.get('SELECT * FROM patients WHERE id=?', [patient.id]);

  app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  const user=await db.get('SELECT * FROM users WHERE id=?',[p.user_id]);
  const clientToken=jwt.sign({id:user.id,openid:user.openid},helpers.JWT_SECRET);

  const profile=async(body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/user/profile`,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+clientToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return (await r.json()).data;};
  await check('未设置性别的新患者在小程序和后台均为0',async()=>{assert.equal((await profile()).gender,0);assert.equal((await call('/api/admin/patients/'+p.id,undefined,'GET')).gender,0)});
  await check('只保存昵称不改变未设置性别',async()=>{const x=await profile({nickname:'资料测试',gender:0,birthday:''});assert.equal(x.gender,0);assert.equal((await call('/api/admin/patients/'+p.id,undefined,'GET')).gender,0)});
  await check('主动选择性别和生日后各端读取一致',async()=>{const x=await profile({nickname:'资料测试',gender:2,birthday:'1995-06-01'});assert.equal(x.gender,2);assert.equal(x.birthday,'1995-06-01');const y=await call('/api/admin/patients/'+p.id,undefined,'GET');assert.equal(y.gender,2);assert.ok(String(y.birthday).startsWith('1995-06-01')||new Date(y.birthday).getFullYear()===1995)});
  await check('后续只改昵称保留已选性别生日',async()=>{const x=await profile({nickname:'更新昵称'});assert.equal(x.gender,2);assert.equal(x.birthday,'1995-06-01')});
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/gender-unset/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
