import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const database='hanjing_test_family_im_'+Date.now();
const env=JSON.parse(execFileSync('docker',['inspect','hanjing-mysql'],{encoding:'utf8'}))[0].Config.Env;
const password=env.find(s=>s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const control=await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const results=[],steps=[],sockets=[];let db,server,wss;
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
const event=(ws,type)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('timeout '+type));},5000);const handler=(...args)=>{cleanup();resolve(args);};function cleanup(){clearTimeout(timer);ws.off(type,handler);}ws.once(type,handler);});
const incoming=ws=>event(ws,'message').then(([raw])=>JSON.parse(raw));
try{
 await control.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:database,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex')});
 db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
 await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
 await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'family-im','unused','隔离管理员',9000)");
 const helpers=await import('../../hanjing-clinic-backend/helpers.js'),im=await import('../../hanjing-clinic-backend/im-socket.js');
 const adminToken=jwt.sign({id:9000,role:'super_admin',token_version:0},helpers.JWT_SECRET);
 const app=express();app.use(express.json());app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
 server=app.listen(0);await new Promise(r=>server.once('listening',r));wss=im.initWebSocket(server);
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,method='POST',token=adminToken,expected=200)=>{const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const json=await response.json();steps.push({path,method,status:response.status});assert.equal(response.status,expected,JSON.stringify(json));return json;};
 const store=(await call('/api/admin/stores',{name:'家庭客服测试门店',code:'IMF',address:'隔离地址'})).data;
 const people=[];for(let i=0;i<2;i++){const p=(await call('/api/admin/patients',{name:'客服测试本人'+i,phone:'1390000721'+i,store_id:store.id})).data;const row=await db.get('SELECT p.*,u.openid FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=?',[p.id]);people.push({...row,token:jwt.sign({id:row.user_id,openid:row.openid},helpers.JWT_SECRET)});}
 const [person,other]=people;
 const family=(await call('/api/v1/user/family-members',{name:'客服测试家属',relation:'parent',age:60,gender:'female',storeId:store.id},'POST',person.token)).data;
 const familyId=family.id;
 assert.ok(familyId);
 const connect=async(token,patientId,expected=101)=>{const ws=new WebSocket(base.replace('http:','ws:')+'/api/v1/im/ws?token='+encodeURIComponent(token)+(patientId?'&patientId='+patientId:''));sockets.push(ws);ws.on('error',()=>{});if(expected===101)await event(ws,'open');else{const [,res]=await event(ws,'unexpected-response');assert.equal(res.statusCode,expected);ws.terminate();}return ws;};
 await check('HTTP家庭会话与默认本人会话消息严格区分',async()=>{
  await call('/api/v1/im/send',{patientId:familyId,text:'家属咨询'},'POST',person.token);
  await call('/api/v1/im/send',{text:'本人咨询'},'POST',person.token);
  const f=await call('/api/v1/im/messages?patientId='+familyId,undefined,'GET',person.token),self=await call('/api/v1/im/messages',undefined,'GET',person.token);
  assert.equal(f.conversation.patientId,String(familyId));assert.ok(f.data.some(m=>m.text==='家属咨询'));assert.ok(!f.data.some(m=>m.text==='本人咨询'));assert.ok(self.data.some(m=>m.text==='本人咨询'));assert.ok(!self.data.some(m=>m.text==='家属咨询'));
 });
 await check('他人账号不能读写或连接家庭会话',async()=>{await call('/api/v1/im/messages?patientId='+familyId,undefined,'GET',other.token,404);await call('/api/v1/im/send',{patientId:familyId,text:'越权'},'POST',other.token,404);await connect(other.token,familyId,404);});
 await check('后台离线回复通知目标属于家庭就诊人',async()=>{
  await call('/api/admin/im/send',{patient_id:familyId,text:'家属请周三到店'});
  const rows=await db.query("SELECT id FROM user_notifications WHERE user_id=? AND business_type='message' ORDER BY id DESC",[person.user_id]);assert.ok(rows.length);
  const d=(await call('/api/v1/user/notifications/'+rows[0].id,undefined,'GET',person.token)).data;
  assert.ok(d.target && d.target.includes('patientId='+familyId));assert.ok(JSON.stringify(d.businessDetail).includes('家属请周三到店'));
 });
 const a=await connect(person.token,familyId);let b=await connect(person.token,familyId);
 await check('WebSocket家庭发送归属正确且后台回复实时到达两个连接',async()=>{
  const ack=incoming(a);a.send(JSON.stringify({text:'WS家属咨询'}));const saved=await ack;assert.equal(saved.type,'ack');const row=await db.get('SELECT patient_id FROM im_messages WHERE id=?',[saved.id]);assert.equal(Number(row.patient_id),Number(familyId));
  const one=incoming(a),two=incoming(b);await call('/api/admin/im/send',{patient_id:familyId,text:'同时收到的服务回复'});assert.equal((await one).text,'同时收到的服务回复');assert.equal((await two).text,'同时收到的服务回复');
 });
 await check('关闭一个连接不移除同患者其他活跃连接',async()=>{const closed=event(a,'close');a.close();await closed;assert.equal(await im.isPatientConversationOpen(familyId),true);const message=incoming(b);await call('/api/admin/im/send',{patient_id:familyId,text:'保留连接回复'});assert.equal((await message).text,'保留连接回复');});
 await check('实际推送回调失败仍返回成功并保留未读和通知',async()=>{
  const peer=[...wss.clients].find(ws=>ws.patientId===Number(familyId));const original=peer.send;
  peer.send=(data,callback)=>callback(Error('TEST_TRANSPORT_CLOSED'));
  try{await call('/api/admin/im/send',{patient_id:familyId,text:'发送窗口断开'});}finally{peer.send=original;}
  const message=await db.get('SELECT * FROM im_messages WHERE patient_id=? AND text=?',[familyId,'发送窗口断开']);assert.equal(Number(message.is_read),0);
  const notice=await db.get("SELECT id FROM user_notifications WHERE business_type='message' AND business_id=?",[message.id]);assert.ok(notice);
 });
 await check('推送失败前HTTP已读取不会被补偿改回未读或新增通知',async()=>{
  const peer=[...wss.clients].find(ws=>ws.patientId===Number(familyId));const original=peer.send;
  peer.send=(data,callback)=>{call('/api/v1/im/messages?patientId='+familyId,undefined,'GET',person.token).then(()=>callback(Error('TEST_READ_BEFORE_DISCONNECT')),callback);};
  try{await call('/api/admin/im/send',{patient_id:familyId,text:'读完后推送断开'});}finally{peer.send=original;}
  const message=await db.get('SELECT * FROM im_messages WHERE patient_id=? AND text=?',[familyId,'读完后推送断开']);assert.equal(Number(message.is_read),1);
  const notice=await db.get("SELECT id FROM user_notifications WHERE business_type='message' AND business_id=?",[message.id]);assert.ok(!notice);
 });
 await check('提交后投递中断由定时任务补发且迟到回调不重复',async()=>{
  const peer=[...wss.clients].find(ws=>ws.patientId===Number(familyId));const original=peer.send;let release;
  peer.send=(data,callback)=>{release=callback;};
  const pending=call('/api/admin/im/send',{patient_id:familyId,text:'提交后进程中断窗口'});
  try {
   for(let i=0;i<100 && !release;i++)await new Promise(r=>setTimeout(r,20));assert.ok(release);
   const closed=event(b,'close');b.terminate();await closed;
   await new Promise(r=>setTimeout(r,16000));
   const notifications=await import('../../hanjing-clinic-backend/notification-center.js');await notifications.processInAppReminders();await notifications.processInAppReminders();
   const message=await db.get('SELECT * FROM im_messages WHERE patient_id=? AND text=?',[familyId,'提交后进程中断窗口']);
   assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='message' AND business_id=?",[message.id])).n),1);
   release(Error('TEST_LATE_TRANSPORT_FAILURE'));release=null;await pending;
   assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='message' AND business_id=?",[message.id])).n),1);
  }finally{peer.send=original;if(release)release(Error('TEST_RELEASE'));}
  b=await connect(person.token,familyId);
 });
 await check('撤销家庭关联后HTTP读写与WS推送均拒绝',async()=>{
  await call('/api/v1/user/family-members/'+familyId,undefined,'DELETE',person.token);
  await call('/api/v1/im/messages?patientId='+familyId,undefined,'GET',person.token,404);await call('/api/v1/im/send',{patientId:familyId,text:'撤销后发送'},'POST',person.token,404);
  const received=[];b.on('message',raw=>received.push(JSON.parse(raw)));const closed=event(b,'close');await call('/api/admin/im/send',{patient_id:familyId,text:'撤销后不可推送'});const [code]=await closed;assert.equal(code,1008);assert.equal(received.length,0);assert.equal(await im.isPatientConversationOpen(familyId),false);
 });
 const family2=(await call('/api/v1/user/family-members',{name:'写权限测试家属',relation:'child',age:10},'POST',person.token)).data;
 const c=await connect(person.token,family2.id);
 await check('已建立WS在授权撤销后再次写入被拒绝',async()=>{await call('/api/v1/user/family-members/'+family2.id,undefined,'DELETE',person.token);const closed=event(c,'close');c.send(JSON.stringify({text:'已撤销WS写入'}));const [code]=await closed;assert.equal(code,1008);const row=await db.get('SELECT COUNT(*) n FROM im_messages WHERE patient_id=? AND text=?',[family2.id,'已撤销WS写入']);assert.equal(Number(row.n),0);});
 await check('本人默认WebSocket保持可用',async()=>{const self=await connect(person.token);const response=incoming(self);self.send(JSON.stringify({text:'默认本人WS'}));const ack=await response;const row=await db.get('SELECT patient_id FROM im_messages WHERE id=?',[ack.id]);assert.equal(Number(row.patient_id),Number(person.id));});
}catch(error){results.push({name:'执行错误',status:'failed',error:error.stack});console.error(error);process.exitCode=1;}
finally{for(const ws of sockets)ws.terminate();if(wss)await new Promise(r=>wss.close(r));if(server)await new Promise(r=>server.close(r));if(db)await db.closePool();await control.query(`DROP DATABASE IF EXISTS \`${database}\``);await control.end();const dir=new URL('./artifacts/notification-family-im/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('api.json',dir),JSON.stringify({results,steps,databaseDropped:true,boundaries:'Only roles/admin seed; patients,family links,messages and link revocation via real API. Synthetic JWT substitutes actual WeChat authorization. Real HTTP+WebSocket, no native mini renderer.'},null,2));}
