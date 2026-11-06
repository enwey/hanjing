import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const database = 'hanjing_test_archive_' + Date.now();
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
  const date = (await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'%Y-%m-%d') day")).day;
  const schedulePayload = { doctor_id: doctor.id, store_id: store.id, date, period: 'morning', start_time: '09:00:00', end_time: '12:00:00', slot_interval_minutes: 30, people_per_slot: 5 };
  await call('/api/admin/schedules', schedulePayload);
  const booking = async (time = '09:00-09:30') => call('/api/admin/appointments', { patient_id: patient.id, store_id: store.id, doctor_id: doctor.id, date, time, type: 'first', consult_fee: 0, deposit_amount: 0 });
  const notice = async id => db.query("SELECT * FROM user_notifications WHERE business_type='appointment' AND business_id=? ORDER BY id", [id]);


  const a=await booking(), b=await booking('09:30-10:00'), empty=await booking('10:00-10:30');
  for(const [appt,diagnosis] of [[a,'第一次诊断'],[b,'第二次诊断']]) {
    await call('/api/admin/appointments/'+appt.id,{status:'checked_in'},'PUT');
    await call('/api/admin/appointments/'+appt.id+'/complete-consultation',{medical_record:{diagnosis,doctor_advice:'保持规律作息',doctor_id:doctor.id,store_id:store.id}});
  }
  const path='/api/admin/patients/'+patient.id+'/medical-records';
  await check('按预约筛选返回对应诊断，不混入其他就诊',async()=>{
    for(const [appt,diagnosis] of [[a,'第一次诊断'],[b,'第二次诊断']]) {
      const rows=await call(path+'?appointment_id='+appt.id,undefined,'GET');
      assert.equal(rows.length,1);assert.equal(rows[0].diagnosis,diagnosis);assert.equal(rows[0].appointment_id,appt.id);
    }
  });
  await check('未建档的预约返回空列表',async()=>assert.deepEqual(await call(path+'?appointment_id='+empty.id,undefined,'GET'),[]));
  await check('无筛选时保留原患者病历列表',async()=>assert.equal((await call(path,undefined,'GET')).length,2));
  await check('拒绝无效预约参数',async()=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+path+'?appointment_id=bad',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,400);
  });
  await check('其他患者不能读取当前预约病历',async()=>{
    const other=await call('/api/admin/patients',{name:'另一位患者',phone:'13900001235',gender:'女',age:30,store_id:store.id});
    assert.deepEqual(await call('/api/admin/patients/'+other.id+'/medical-records?appointment_id='+a.id,undefined,'GET'),[]);
  });
  await check('没有病历权限的账号拒绝访问',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9001,'预约查看员','archive_reader',?)",[JSON.stringify({type:'system',store_ids:[]})]);
    await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9001,'archive-reader','unused','预约查看员',9001)");
    const restricted=jwt.sign({id:9001,role:'archive_reader',token_version:0},helpers.JWT_SECRET);
    const response=await fetch('http://127.0.0.1:'+server.address().port+path+'?appointment_id='+a.id,{headers:{Authorization:'Bearer '+restricted}});assert.equal(response.status,403);
  });

  await check('有病历功能但个人范围无关联时禁止读取',async()=>{
    await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9002,'个人病历角色','archive_personal',?)",[JSON.stringify({type:'personal',store_ids:[]})]);
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9002,'medical_record:view')");
    await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9002,'archive-personal','unused','个人病历账号',9002)");
    const restricted=jwt.sign({id:9002,role:'archive_personal',token_version:0},helpers.JWT_SECRET);
    const response=await fetch('http://127.0.0.1:'+server.address().port+path+'?appointment_id='+a.id,{headers:{Authorization:'Bearer '+restricted}});assert.equal(response.status,403);
  });
} catch (error) { results.push({ name: '执行错误', status: 'failed', error: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.closePool();
  await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end();
  const dir = new URL('./artifacts/appointment-history-archive/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('api.json', dir), JSON.stringify({ results, steps, databaseDropped: true, boundaries: '隔离管理员初始化；业务前提均由HTTP API创建；不含微信真机与生产支付' }, null, 2));
}
