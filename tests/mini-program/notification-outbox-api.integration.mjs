import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
const database='hanjing_test_notify_outbox_'+Date.now();
const env=JSON.parse(execFileSync('docker',['inspect','hanjing-mysql'],{encoding:'utf8'}))[0].Config.Env;
const password=env.find(s=>s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control=await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const results=[],steps=[];let db,server;
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name);};
try{
 await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:database,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex')});
 await control.query('USE '+database);
 db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
 await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
 await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'outbox-notify','unused','隔离管理员',9000)");
 const helpers=await import('../../hanjing-clinic-backend/helpers.js'),notifications=await import('../../hanjing-clinic-backend/notification-center.js');
 const adminToken=jwt.sign({id:9000,role:'super_admin',token_version:0},helpers.JWT_SECRET);
 const app=express();app.use(express.json());app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
 server=app.listen(0);await new Promise(r=>server.once('listening',r));
 const call=async(path,body,method='POST',token=adminToken,expected=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const json=await r.json();steps.push({path,method,status:r.status});assert.equal(r.status,expected,JSON.stringify(json));return json.data;};
 const store=await call('/api/admin/stores',{name:'通知恢复门店',code:'NTO',address:'隔离测试地址'});
 const doctor=await call('/api/admin/doctors',{name:'通知恢复医生',title:'主任医师',specialty:'睡眠医学',store_ids:[store.id]});
 const people=[];
 for(let i=0;i<4;i++){const p=await call('/api/admin/patients',{name:'恢复测试就诊人'+i,phone:'1390000456'+i,store_id:store.id});const row=await db.get('SELECT p.*,u.openid FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=?',[p.id]);people.push({...row,token:jwt.sign({id:row.user_id,openid:row.openid},helpers.JWT_SECRET)});}
 const [person,actor1,actor2,actor3]=people;
 const dates=await db.get("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') today,DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 1 DAY),'%Y-%m-%d') tomorrow,DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'%Y-%m-%d') later");
 const schedule={doctor_id:doctor.id,store_id:store.id,date:dates.later,period:'morning',start_time:'09:00:00',end_time:'12:00:00',slot_interval_minutes:30,people_per_slot:5};
 await call('/api/admin/schedules',schedule);
 const trigger=()=>control.query("CREATE TRIGGER reject_notification BEFORE INSERT ON user_notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='TEST_DELIVERY_FAILURE'");
 const restore=()=>control.query('DROP TRIGGER IF EXISTS reject_notification');
 const recover=()=>notifications.processNotificationOutbox(100,new Date(Date.now()+180000));
 let booking;
 await check('通知投递失败不阻断真实预约创建，故障解除补发且重复执行不重复',async()=>{
  await trigger();booking=await call('/api/admin/appointments',{patient_id:person.id,store_id:store.id,doctor_id:doctor.id,date:dates.later,time:'09:00-09:30',type:'first',consult_fee:0,deposit_amount:0});
  assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[booking.id])).status,'pending');
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM notification_outbox WHERE status='pending' AND user_id=?",[person.user_id])).n),1);
  assert.equal(Number((await db.get('SELECT COUNT(*) n FROM user_notifications WHERE user_id=?',[person.user_id])).n),0);
  await restore();await recover();await recover();
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='appointment' AND business_id=?",[booking.id])).n),1);
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM notification_outbox WHERE status='pending'")).n),0);
 });
 await check('业务事务后续失败同时回滚已写通知与outbox',async()=>{
  const before=await db.get('SELECT COUNT(*) n FROM notification_outbox');
  await control.query("CREATE TRIGGER reject_schedule BEFORE UPDATE ON doctor_schedules FOR EACH ROW BEGIN IF NEW.status='archived' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='TEST_BUSINESS_FAILURE'; END IF; END");
  await call('/api/admin/schedules',{doctor_id:doctor.id,date:dates.later,period:'morning',is_rest:true},'POST',adminToken,500);
  await control.query('DROP TRIGGER reject_schedule');
  assert.equal(Number((await db.get('SELECT COUNT(*) n FROM notification_outbox')).n),Number(before.n));
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE event_code='schedule_impact'")).n),0);
  assert.equal((await db.get('SELECT status FROM doctor_schedules WHERE id=(SELECT schedule_id FROM appointments WHERE id=?)',[booking.id])).status,'available');
 });
 let post;
 await check('真实多人点赞旧pending晚恢复不覆盖已送达的新聚合',async()=>{
  post=await call('/api/v1/community/posts',{title:'睡眠记录交流',content:'记录一次日常体验',tags:[]},'POST',person.token);
  await trigger();await call('/api/v1/community/posts/'+post.id+'/like',{isLiked:true},'POST',actor1.token);await restore();
  await call('/api/v1/community/posts/'+post.id+'/like',{isLiked:true},'POST',actor2.token);
  const current=await db.get("SELECT * FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='like_aggregate'",[post.id]);assert.match(current.content,/2 人/);
  await recover();const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='like_aggregate'",[post.id]);
  assert.equal(rows.length,1);assert.match(rows[0].content,/2 人/);assert.equal(String(rows[0].read_version),String(current.read_version));
 });
 await check('明日随访由真实API安排后提前通知且不重复',async()=>{
  const followup=await call('/api/admin/patients/'+person.id+'/follow-ups',{follower_id:9000,title:'次日随访',due_date:dates.tomorrow});
  await notifications.processInAppReminders();await notifications.processInAppReminders();
  const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='followup' AND business_id=? AND event_code='upcoming'",[followup.id]);assert.equal(rows.length,1);assert.match(rows[0].content,/恢复测试就诊人0/);assert.ok(rows[0].content.includes(dates.tomorrow));
  const detail=await call('/api/v1/user/notifications/'+rows[0].id,undefined,'GET',person.token);assert.equal(detail.businessDetail.title,'随访安排');assert.ok(detail.businessDetail.actions.length);
 });
 await check('较新聚合延迟补发后旧快照全部已读及单条已读均不误读新版本',async()=>{
  const snapshot=await call('/api/v1/user/notifications',undefined,'GET',person.token);
  const old=await db.get("SELECT * FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='like_aggregate'",[post.id]);
  await trigger();await call('/api/v1/community/posts/'+post.id+'/like',{isLiked:true},'POST',actor3.token);await restore();await recover();
  const fresh=await db.get('SELECT * FROM user_notifications WHERE id=?',[old.id]);assert.match(fresh.content,/3 人/);assert.ok(Number(fresh.read_version)>Number(snapshot.snapshotVersion));
  await call('/api/v1/user/notifications/read-all',{through:snapshot.snapshotId,throughVersion:snapshot.snapshotVersion},'POST',person.token);
  assert.equal(Number((await db.get('SELECT is_read FROM user_notifications WHERE id=?',[old.id])).is_read),0);
  const read=await call('/api/v1/user/notifications/'+old.id+'/read',{throughVersion:String(old.read_version)},'POST',person.token);assert.equal(read.isRead,false);
 });
 await check('真实治疗建档及调整生成明日复诊提醒且不重复',async()=>{
  const product=await call('/api/admin/products',{name:'隔离测试阻鼾器',category:'device',price:10000,stock:5,status:'on',image_url:'/static/products/default.png'});
  const treatment=await call('/api/admin/patients/'+person.id+'/treatment',{doctor_id:doctor.id,device_product_id:product.id,initial_advancement:1,start_date:dates.today});
  await call('/api/admin/patients/'+person.id+'/treatment/adjustments',{treatment_id:treatment.id,adjust_date:dates.today,operator_id:doctor.id,adjusted_advancement:2,next_adjust_date:dates.tomorrow});
  await notifications.processInAppReminders();await notifications.processInAppReminders();
  const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='treatment' AND business_id=? AND event_code='review_upcoming'",[treatment.id]);assert.equal(rows.length,1);assert.ok(rows[0].content.includes(dates.tomorrow));
  const detail=await call('/api/v1/user/notifications/'+rows[0].id,undefined,'GET',person.token);assert.equal(detail.businessDetail.title,'治疗方案详情');assert.equal(detail.target,null);
  const fields=detail.businessDetail.sections.flatMap(s=>s.fields);assert.ok(fields.some(f=>f.label==='当前前移量' && Number.parseFloat(f.value)===2 && f.value.endsWith(' mm')));assert.ok(fields.some(f=>f.label==='设备' && f.value==='隔离测试阻鼾器'));assert.ok(detail.businessDetail.actions.some(a=>a.path==='/pages/appointment/booking/index'));
 });
 await check('失败随访提醒在真实取消接口执行后不再补发',async()=>{
  const followup=await call('/api/admin/patients/'+person.id+'/follow-ups',{follower_id:9000,title:'取消随访校验',due_date:dates.tomorrow});
  await trigger();await notifications.processInAppReminders();await restore();
  await call('/api/admin/patients/'+person.id+'/follow-ups/'+followup.id,{status:'cancelled'},'PUT');await recover();
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='followup' AND business_id=? AND event_code='upcoming'",[followup.id])).n),0);
  assert.ok(await db.get("SELECT id FROM notification_outbox WHERE status='discarded' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.businessId'))=?",[String(followup.id)]));
 });
 await check('模块并发：同账号不同事件等待先前事务提交，旧快照不涵盖后提交版本',async()=>{
  let release,ready;const hold=new Promise(r=>release=r),firstWritten=new Promise(r=>ready=r);
  const first=db.transaction(async conn=>{await notifications.writeNotification(conn,{userId:person.user_id,title:'模块并发一',content:'事务控制验证',event:'module-serial-1'});ready();await hold;});
  await firstWritten;
  const second=db.transaction(conn=>notifications.writeNotification(conn,{userId:person.user_id,title:'模块并发二',content:'事务控制验证',event:'module-serial-2'}));
  let blocked,snapshot;
  try{blocked=await Promise.race([second.then(()=>false),new Promise(r=>setTimeout(()=>r(true),150))]);snapshot=await call('/api/v1/user/notifications',undefined,'GET',person.token);}finally{release();}
  await Promise.all([first,second]);assert.equal(blocked,true,'同账号第二通知事务必须等待首笔提交');
  const rows=await db.query("SELECT * FROM user_notifications WHERE event_code IN ('module-serial-1','module-serial-2') ORDER BY read_version");assert.equal(rows.length,2);assert.equal(rows[0].event_code,'module-serial-1');assert.ok(rows.every(r=>Number(r.read_version)>Number(snapshot.snapshotVersion)));
  await call('/api/v1/user/notifications/read-all',{through:snapshot.snapshotId,throughVersion:snapshot.snapshotVersion},'POST',person.token);
  const unread=await db.query("SELECT is_read FROM user_notifications WHERE event_code IN ('module-serial-1','module-serial-2')");assert.ok(unread.every(r=>Number(r.is_read)===0));
 });
}catch(error){results.push({name:'执行错误',status:'failed',error:error.stack});console.error(error);process.exitCode=1;}
finally{if(server)await new Promise(r=>server.close(r));if(db)await db.closePool();await control.query(`DROP DATABASE IF EXISTS \`${database}\``);await control.end();const dir=new URL('./artifacts/notification-outbox/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('api.json',dir),JSON.stringify({results,steps,databaseDropped:true,boundaries:'隔离权限初始化；业务前提均来自HTTP；触发器只用于投递/事务故障注入；未测真实微信登录'},null,2));}
