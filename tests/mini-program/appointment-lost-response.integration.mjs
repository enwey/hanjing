import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const env = JSON.parse(execFileSync('docker', ['inspect','hanjing-mysql'], {encoding:'utf8'}))[0].Config.Env;
const password = env.find(line => line.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
assert.ok(password);
const schema = 'hanjing_test_lost_booking_' + Date.now();
const control = await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const http = globalThis.fetch;
const evidence = {};
let created, db, server, drop = false;
try {
  await control.query('CREATE DATABASE ' + schema);
  created = true;
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:schema,
    NODE_ENV:'test', JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex'),
    WX_MINI_APP_ID:'fixture-app',WX_MINI_APP_SECRET:'fixture-secret'});
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (u.hostname === 'api.weixin.qq.com') {
      if (u.pathname === '/sns/jscode2session') return Response.json({openid:'fixture-booking-user'});
      if (u.pathname === '/cgi-bin/stable_token') return Response.json({access_token:'fixture-token',expires_in:7200});
      if (u.pathname === '/wxa/business/getuserphonenumber') return Response.json({errcode:0,phone_info:{purePhoneNumber:'13800009101'}});
    }
    throw Error('Unexpected upstream call');
  };
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'fixture-admin','unused','隔离管理员',9000)");
  const admin = jwt.sign({id:9000,role:'super_admin',token_version:0},process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use((req,res,next)=>{
    if (drop && req.method === 'POST' && req.path === '/api/v1/appointments') {
      drop = false;
      const send = res.json.bind(res);
      res.json = body => {
        if (res.statusCode === 200 && body.code === 0) {
          evidence.droppedSuccess = {id:body.data.id,number:body.data.appointmentNo};
          return res.destroy();
        }
        return send(body);
      };
    }
    next();
  });
  app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
  server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  async function call(path,body,token) {
    const r=await http('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const json=await r.json();
    return {status:r.status,...json};
  }
  async function ok(path,body,token) {
    const r=await call(path,body,token);assert.equal(r.status,200,r.message);return r.data;
  }
  const store=await ok('/api/admin/stores',{name:'隔离门店',code:'LOST',address:'隔离地址'},admin);
  const doctor=await ok('/api/admin/doctors',{name:'隔离医生',title:'医师',specialty:'睡眠医学',store_ids:[store.id]},admin);
  const login=await ok('/api/v1/auth/wx-login',{code:'fixture',phoneCode:'fixture-phone'});
  const token=login.access_token;
  const family=await ok('/api/v1/user/family-members',undefined,token);
  const patient=(Array.isArray(family)?family:family.list).find(p=>p.relation==='self');
  assert.ok(patient);
  const {day:date}=await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY),'%Y-%m-%d') day");
  for (const [period,start,end,capacity] of [['morning','09:00:00','10:00:00',2],['afternoon','14:00:00','15:00:00',1]]) {
    await ok('/api/admin/schedules',{doctor_id:doctor.id,store_id:store.id,date,period,start_time:start,end_time:end,slot_interval_minutes:30,people_per_slot:capacity},admin);
  }
  const slots=await ok('/api/v1/day-slots?doctorId='+doctor.id+'&storeId='+store.id+'&date='+date);
  evidence.cases=[];
  for (const [appointmentTime,capacity] of [['09:00-09:30',2],['14:00-14:30',1]]) {
    const slot=slots.find(s=>s.label===appointmentTime && s.status==='available');
    assert.ok(slot);
    const payload={patientId:patient.id,doctorId:doctor.id,storeId:store.id,scheduleId:slot.scheduleId,appointmentDate:date,appointmentTime,type:'first'};
    const rows=()=>db.query('SELECT id,appointment_no,status FROM appointments WHERE patient_id=? AND schedule_id=? AND appointment_time=? ORDER BY id',[patient.id,slot.scheduleId,appointmentTime]);
    assert.equal((await rows()).length,0);
    drop=true;
    await assert.rejects(call('/api/v1/appointments',payload,token),{name:'TypeError'});
    const afterLoss=await rows();
    assert.equal(afterLoss.length,1);
    assert.equal(String(afterLoss[0].id),String(evidence.droppedSuccess.id));
    const retry=await call('/api/v1/appointments',payload,token);
    const afterRetry=await rows();
    evidence.cases.push({capacity,afterLoss,retry:{status:retry.status,code:retry.code,data:retry.data},afterRetry,duplicate:afterRetry.length>1});
    assert.equal(retry.status,200);
    assert.equal(retry.data.reused,true);
    assert.equal(retry.data.appointmentNo,afterLoss[0].appointment_no);
    assert.deepEqual(afterRetry,afterLoss);
  }
  const slot=slots.find(s=>s.label==='09:30-10:00');
  const body={patientId:patient.id,doctorId:doctor.id,storeId:store.id,scheduleId:slot.scheduleId,appointmentDate:date,appointmentTime:slot.label,type:'first'};
  const before=await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=?',[slot.scheduleId]);
  const pair=await Promise.all([call('/api/v1/appointments',body,token),call('/api/v1/appointments',body,token)]);
  const after=await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=?',[slot.scheduleId]);
  evidence.concurrent={replies:pair.map(r=>({status:r.status,id:r.data?.id,reused:r.data?.reused})),occupiedDelta:Number(after.booked_slots)-Number(before.booked_slots)};
  assert.deepEqual(pair.map(r=>r.status),[200,200]);
  assert.equal(pair[0].data.id,pair[1].data.id);
  assert.equal(pair.filter(r=>r.data.reused).length,1);
  assert.equal(evidence.concurrent.occupiedDelta,1);
  const member = await ok('/api/v1/user/family-members', {
    name:'隔离家属',relation:'child',gender:1,birthday:'2010-01-01',phone:'13800009102',
  },token);
  assert.ok(member.id);
  const other = await call('/api/v1/appointments',{...body,patientId:member.id},token);
  evidence.otherPatient={status:other.status,id:other.data?.id,reused:other.data?.reused};
  assert.equal(other.status,200,other.message);
  assert.notEqual(other.data.id,pair[0].data.id);
  assert.equal(other.data.reused,false);
  const full=await call('/api/v1/appointments',body,token);
  assert.equal(full.status,200);
  assert.equal(full.data.id,pair[0].data.id);
  await ok('/api/v1/appointments/'+pair[0].data.id+'/cancel',{reason:'隔离测试'},token);
  const rebook=await call('/api/v1/appointments',body,token);
  evidence.rebook={status:rebook.status,id:rebook.data?.id,reused:rebook.data?.reused};
  assert.equal(rebook.status,200,rebook.message);
  assert.notEqual(rebook.data.id,pair[0].data.id);
  assert.equal(rebook.data.reused,false);
} finally {
  try {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await db?.closePool();
    if(created){await control.query('DROP DATABASE '+schema);evidence.cleaned=true;}
  } finally {
    await control.end();
    const out=new URL(process.env.APPOINTMENT_DB_OUTPUT || './artifacts/appointment-lost-response-fix-2026-11-18/',import.meta.url);
    mkdirSync(out,{recursive:true});
    writeFileSync(new URL('database.json',out),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  }
}
