import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
const database='hanjing_test_notifications_'+Date.now();
const env=JSON.parse(execFileSync('docker',['inspect','hanjing-mysql'],{encoding:'utf8'}))[0].Config.Env;
const password=env.find(s=>s.startsWith('MYSQL_ROOT_PASSWORD=')).split('=').slice(1).join('=');
const connection=await mysql.createConnection({host:'127.0.0.1',user:'root',password});
let db,server;const results=[];let failed=false;
const test=async(name,fn)=>{try{await fn();results.push({name,status:'passed'});console.log('PASS',name);}catch(e){failed=true;results.push({name,status:'failed',error:e.message});console.error('FAIL',name,e.message);}};
try{
 await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:database,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex')});
 db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
 const n=await import('../../hanjing-clinic-backend/notification-center.js');
 await test('迁移重复执行安全',()=>n.initNotificationCenter(db.query));
 const u=(await db.run("INSERT INTO users(openid,nickname) VALUES('notification-a','通知测试A')")).id;
 const other=(await db.run("INSERT INTO users(openid,nickname) VALUES('notification-b','通知测试B')")).id;
 const input={userId:u,title:'测试',content:'A',type:'appointment',businessType:'appointment',businessId:'123',event:'test'};
 await test('并发重试仅一条',async()=>{await Promise.all(Array.from({length:10},()=>n.writeNotification(null,input)));assert.equal(Number((await db.get('SELECT COUNT(*) n FROM user_notifications')).n),1);});
 await test('A到B到A合法变更不误去重',async()=>{await n.writeNotification(null,{...input,content:'B'});await n.writeNotification(null,input);assert.equal(Number((await db.get('SELECT COUNT(*) n FROM user_notifications')).n),3);});
 await test('业务事务回滚不留下通知',async()=>{await assert.rejects(db.transaction(async tx=>{await n.writeNotification(tx,{...input,event:'rollback'});throw Error('rollback');}));assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE event_code='rollback'")).n),0);});
 await test('事件唯一键跨内容回调仍幂等',async()=>{await n.writeNotification(null,{...input,event:'once',onceKey:'charge-1'});await n.writeNotification(null,{...input,event:'once',onceKey:'charge-1',content:'changed'});assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE event_code='once'")).n),1);});
 const app=express();app.use(express.json());n.installNotificationRoutes(app,(req,res,next)=>{req.user={id:Number(req.headers['x-user']||u)};next();});server=app.listen(0);await new Promise(r=>server.once('listening',r));
 const call=async(path,options={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/user/notifications${path}`,options);return {status:response.status,...await response.json()};};
 for(let i=0;i<125;i++)await n.writeNotification(null,{userId:u,title:'分页'+i,content:'正文',type:i%2?'order':'system',event:'page',onceKey:String(i)});
 await n.writeNotification(null,{userId:other,title:'其他账号',content:'隐私',event:'other'});
 await test('超过100条可完整分页且无重复',async()=>{let cursor,ids=[];do{const r=await call('?limit=20'+(cursor?'&before='+cursor:''));assert.equal(r.status,200);ids.push(...r.data.list.map(n=>n.id));cursor=r.data.nextCursor;}while(cursor);assert.equal(ids.length,129);assert.equal(new Set(ids).size,129);});
 await test('分类筛选和全局未读一致',async()=>{const r=await call('?type=order');assert.ok(r.data.list.every(n=>n.type==='order'));assert.equal(r.data.unread,129);});
 await test('分页参数拒绝无效输入',async()=>{for(const q of ['?before=-1','?limit=x','?type=bad'])assert.equal((await call(q)).status,400);});
 await test('详情与已读拒绝跨账号',async()=>{const own=(await call('')).data.list[0].id;assert.equal((await call('/'+own,{headers:{'x-user':String(other)}})).status,404);assert.equal((await call('/'+own+'/read',{method:'POST',headers:{'x-user':String(other)}})).status,404);});
 await test('已删除关联保留通知正文并提示',async()=>{const row=await db.get("SELECT id FROM user_notifications WHERE business_type='appointment' LIMIT 1");const r=await call('/'+row.id);assert.equal(r.status,200);assert.equal(r.data.target,null);assert.match(r.data.unavailable,/不存在/);});
 await test('全部已读不误读并发新消息',async()=>{const snapshot=(await call('')).data.snapshotId;await n.writeNotification(null,{userId:u,title:'新消息',content:'新',event:'new'});const r=await call('/read-all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({through:snapshot})});assert.equal(r.data.unread,1);assert.equal((await call('',{headers:{'x-user':String(other)}})).data.unread,1);});
 await test('旧通知无关联仍可查看',async()=>{const row=await db.run('INSERT INTO user_notifications(user_id,title,content) VALUES(?,?,?)',[u,'历史消息','旧正文']);const r=await call('/'+row.id);assert.equal(r.data.content,'旧正文');assert.equal(r.data.target,null);});
 await test('无接收人不伪造通知',async()=>assert.equal(await n.writeNotification(null,{userId:null,title:'后台账号'}),null));
 await test('空业务提醒任务安全执行',()=>n.processInAppReminders());
 await db.run("INSERT INTO roles(id,name,code) VALUES(9000,'测试角色','notification_test')");
 await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'notification-test','unused','测试医生',9000)");
 await db.run("INSERT INTO stores(id,name,code,address) VALUES(9000,'测试门店','NOTIFY','测试地址')");
 await db.run("INSERT INTO doctors(id,name,title,specialty) VALUES(9000,'测试医生','主任医师','睡眠医学')");
 const patient=(await db.run("INSERT INTO patients(user_id,name,patient_no) VALUES(?,'测试患者','NOTIFY-P')",[u])).id;
 await db.run("UPDATE users SET self_patient_id=? WHERE id=?",[patient,u]);
 await db.run("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(?,?,'self')",[u,patient]);
 await db.run("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(9000,9000,9000,CURDATE(),'morning','00:00','23:59')");
 const appointment=(await db.run("INSERT INTO appointments(appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,consult_fee,deposit_amount) VALUES('NOTIFY-A',?,?,9000,9000,9000,DATE(DATE_ADD(NOW(),INTERVAL 30 MINUTE)),CONCAT(DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 30 MINUTE),'%H:%i'),'-23:59'),2000,5000)",[u,patient])).id;
 const order=(await db.run("INSERT INTO orders(order_no,user_id,total_amount,pay_amount) VALUES('NOTIFY-O',?,1000,1000)",[u])).id;
 const post=(await db.run("INSERT INTO community_posts(user_id,title,content,status) VALUES(?,'测试帖子','正文','approved')",[u])).id;
 const report=(await db.run("INSERT INTO community_reports(user_id,post_id,reason) VALUES(?,?,'测试')",[u,post])).id;
 const medical=(await db.run("INSERT INTO medical_records(patient_id,doctor_id,store_id,visit_date,diagnosis) VALUES(?,9000,9000,CURDATE(),'测试诊断')",[patient])).id;
 const treatment=(await db.run("INSERT INTO treatment_records(patient_id,doctor_id,device_model,initial_advancement,current_advancement,start_date,next_adjust_date) VALUES(?,9000,'测试设备',1,1,CURDATE(),CURDATE())",[patient])).id;
 const afterSale=(await db.run("INSERT INTO after_sales_tickets(patient_id,created_by,issue_type,description) VALUES(?,9000,'设备','测试')",[patient])).id;
 const followup=(await db.run("INSERT INTO follow_up_tasks(patient_id,follower_id,title,due_date) VALUES(?,9000,'测试随访',CURDATE())",[patient])).id;
 const message=(await db.run("INSERT INTO im_messages(patient_id,sender,text) VALUES(?,'doctor','测试回复')",[patient])).id;
 const snore=(await db.run("INSERT INTO snore_assessments(user_id,patient_id,file_url,duration,avg_decibel,peak_decibel,snore_rate,apnea_events) VALUES(?,?,'/test-only.wav',60,50,70,30,0)",[u,patient])).id;
 const promoter=(await db.run("INSERT INTO distributors(user_id,nickname,invite_code) VALUES(?,'测试推广员','NOTIFY-I')",[u])).id;
 const withdraw=(await db.run("INSERT INTO withdraw_records(user_id,amount,actual_amount,account_info) VALUES(?,1000,1000,'test fixture')",[u])).id;
 for(const [kind,id,events] of [['appointment',appointment,['created','paid','rescheduled','refund_pending','refunded','refund_failed','payment_conflict','checkin']],['order',order,['created','paid','shipped','refund_failed']],['post',post,['moderation']],['report',report,['submitted']],['medical',medical,['updated']],['treatment',treatment,['updated']],['after_sale',afterSale,['status']],['followup',followup,['scheduled']],['message',message,['reply']],['snore',snore,['ready']],['promoter',promoter,['status']],['withdraw',withdraw,['submitted']]]){
  await test('业务事件归属与去重：'+kind,async()=>{for(const event of events){await n.notifyBusiness(null,kind,id,event,{amount:1000});await n.notifyBusiness(null,kind,id,event,{amount:1000});const rows=await db.query('SELECT * FROM user_notifications WHERE business_type=? AND business_id=? AND event_code=?',[kind,id,event]);assert.equal(rows.length,1);assert.equal(Number(rows[0].user_id),u);const detail=await call('/'+rows[0].id);assert.equal(detail.status,200);assert.equal(detail.data.unavailable,'');if(['appointment','order','post','medical','snore','promoter','withdraw','message'].includes(kind))assert.ok(detail.data.target);}});
 }
 await test('提醒多实例重跑幂等且改约取消后不误发',async()=>{
   await n.processInAppReminders();await n.processInAppReminders();
   for(const [kind,id,event] of [['appointment',appointment,'reminder'],['followup',followup,'due'],['treatment',treatment,'review_due']])assert.equal(Number((await db.get('SELECT COUNT(*) n FROM user_notifications WHERE business_type=? AND business_id=? AND event_code=?',[kind,id,event])).n),1);
   await db.run("UPDATE appointments SET status='cancelled' WHERE id=?",[appointment]);await db.run("UPDATE follow_up_tasks SET status='cancelled' WHERE id=?",[followup]);await n.processInAppReminders();
   assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='appointment' AND business_id=? AND event_code='reminder'",[appointment])).n),1);
 });
 await test('混合排序规则下提醒与举报结果查询不报错',async()=>{await db.query('ALTER TABLE user_notifications MODIFY business_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL');await n.processInAppReminders();});
 await test('举报处理结果仅通知本人且不重复',async()=>{await db.run("UPDATE community_reports SET status='resolved' WHERE id=?",[report]);await n.processInAppReminders();await n.processInAppReminders();assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='report' AND business_id=? AND event_code='processed'",[report])).n),1);});

 const helpers=await import('../../hanjing-clinic-backend/helpers.js');
 await db.run("UPDATE roles SET code='super_admin',data_scope=? WHERE id=9000",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
 const adminToken=jwt.sign({id:9000,role:'super_admin',token_version:0},helpers.JWT_SECRET);
 const patientToken=jwt.sign({id:u,openid:'notification-a'},helpers.JWT_SECRET);
 const otherToken=jwt.sign({id:other,openid:'notification-b'},helpers.JWT_SECRET);
 app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
 app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);
 const businessCall=async(path,body,method='POST',token=adminToken)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 await test('后台发货接口提交并写入可跳转通知',async()=>{await db.run("UPDATE orders SET status='shipping',type='online' WHERE id=?",[order]);const r=await businessCall('/api/admin/orders/'+order+'/ship',{carrier:'顺丰',tracking_number:'NOTIFY123456'});assert.equal(r.status,200,JSON.stringify(r));const row=await db.get("SELECT id FROM user_notifications WHERE business_type='order' AND business_id=? AND event_code='shipped'",[order]);assert.ok(row);});
 await test('后台审核接口写入通知且重复保存不重复',async()=>{const count=async()=>Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='moderation'",[post])).n);const before=await count();const r=await businessCall('/api/admin/content/articles/'+post,{status:'rejected',reject_reason:'请补充科普信息'},'PUT');assert.equal(r.status,200,JSON.stringify(r));assert.equal(await count(),before+1);assert.equal((await businessCall('/api/admin/content/articles/'+post,{status:'rejected',reject_reason:'请补充科普信息'},'PUT')).status,200);assert.equal(await count(),before+1);});
 await test('评论接口同时通知作者和被回复人且不通知自己',async()=>{await db.run("UPDATE community_posts SET status='approved' WHERE id=?",[post]);const third=(await db.run("INSERT INTO users(openid,nickname) VALUES('notification-c','评论者')")).id;const thirdToken=jwt.sign({id:third,openid:'notification-c'},helpers.JWT_SECRET);const first=await businessCall('/api/v1/community/posts/'+post+'/comment',{content:'测试评论'},'POST',otherToken);assert.equal(first.status,200,JSON.stringify(first));const reply=await businessCall('/api/v1/community/posts/'+post+'/comment',{content:'测试回复',parentId:first.data.id},'POST',thirdToken);assert.equal(reply.status,200,JSON.stringify(reply));const rows=await db.query("SELECT user_id FROM user_notifications WHERE business_type='post' AND business_id=? AND title IN ('社区新评论','社区新回复')",[post]);assert.ok(rows.some(r=>Number(r.user_id)===u));assert.ok(rows.some(r=>Number(r.user_id)===other));assert.ok(!rows.some(r=>Number(r.user_id)===third));});
 await test('帖子重复点赞及取消重赞当天不重复通知',async()=>{const path='/api/v1/community/posts/'+post+'/like';for(const isLiked of [true,true,false,true])assert.equal((await businessCall(path,{isLiked},'POST',otherToken)).status,200);assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='post' AND business_id=? AND title='帖子收到点赞'",[post])).n),1);});
 await test('客服发送接口写入未读回复和通知',async()=>{const r=await businessCall('/api/admin/im/send',{patient_id:patient,text:'请按约到诊'});assert.equal(r.status,200,JSON.stringify(r));const msg=await db.get("SELECT * FROM im_messages WHERE patient_id=? ORDER BY id DESC LIMIT 1",[patient]);assert.equal(msg.is_read,0);assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='message' AND business_id=?",[msg.id]));});
 await test('鼾声提交真实接口重试仅一条报告通知且链接可读取',async()=>{const payload={patientId:String(patient),duration:60,client_side_analysis:true,localId:'notification-snore-retry',analysis_result:{avgDecibel:45,peakDecibel:65,snoreRate:20,apneaEvents:0,riskLevel:'low',riskScore:20}};const r=await businessCall('/api/v1/assessments/snore',payload,'POST',patientToken);assert.equal(r.status,200,JSON.stringify(r));const retry=await businessCall('/api/v1/assessments/snore',payload,'POST',patientToken);assert.equal(retry.data.id,r.data.id);const id=r.data.id.replace('snore-','');const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='snore' AND business_id=?",[id]);assert.equal(rows.length,1);const detail=await call('/'+rows[0].id);assert.ok(detail.data.target.endsWith('id='+r.data.id));assert.equal((await businessCall('/api/v1/assessments/snore-analysis/'+r.data.id,undefined,'GET',patientToken)).status,200);});

 await test('后台创建预约与两端改约统一通知',async()=>{
  await db.run('INSERT INTO doctor_store_mapping(doctor_id,store_id) VALUES(9000,9000)');
  const date=(await db.get("SELECT DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'%Y-%m-%d') day")).day;
  const schedule=(await db.run("INSERT INTO doctor_schedules(doctor_id,store_id,date,period,start_time,end_time,total_slots,people_per_slot,slot_interval_minutes) VALUES(9000,9000,?,'morning','09:00','12:00',6,2,30)",[date])).id;
  const r=await businessCall('/api/admin/appointments',{patient_id:patient,store_id:9000,doctor_id:9000,date,time:'09:00-09:30',period:'morning',type:'first',consult_fee:0,deposit_amount:0});assert.equal(r.status,200,JSON.stringify(r));
  const row=await db.get('SELECT id FROM appointments WHERE schedule_id=? ORDER BY id DESC LIMIT 1',[schedule]);assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='appointment' AND business_id=? AND event_code='created'",[row.id]));
  const admin=await businessCall('/api/admin/appointments/'+row.id,{date,time:'09:30-10:00'},'PUT');assert.equal(admin.status,200,JSON.stringify(admin));
  const patientResult=await businessCall('/api/v1/appointments/'+row.id+'/reschedule',{scheduleId:schedule,appointmentDate:date,appointmentTime:'10:00-10:30'},'POST',patientToken);assert.equal(patientResult.status,200,JSON.stringify(patientResult));
  const messages=await db.query("SELECT content FROM user_notifications WHERE business_type='appointment' AND business_id=? AND event_code='rescheduled'",[row.id]);assert.equal(messages.length,2);assert.ok(messages.every(m=>m.content.includes('原预约：')));
 });
 await test('病历及随访真实创建接口均通知患者',async()=>{
  const r=await businessCall('/api/admin/patients/'+patient+'/medical-records',{doctor_id:9000,store_id:9000,visit_date:'2026-11-06',diagnosis:'测试记录',doctor_advice:'测试医嘱'});assert.equal(r.status,200,JSON.stringify(r));
  const follow=await businessCall('/api/admin/patients/'+patient+'/follow-ups',{follower_id:9000,title:'测试计划',due_date:'2026-11-20'});assert.equal(follow.status,200,JSON.stringify(follow));assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='followup' AND business_id=?",[follow.data.id]));
 });
 await test('会员等级变更幂等且通知可打开权益页',async()=>{
  const membership=await import('../../hanjing-clinic-backend/membership.js');await membership.setUserMembership(u,'normal');await membership.setUserMembership(u,'gold');await membership.setUserMembership(u,'gold');const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='member' AND user_id=?",[u]);assert.equal(rows.length,1);assert.equal((await call('/'+rows[0].id)).data.target,'/pages/profile/member-benefits/index');
 });
 await test('商城退款异常及最终成功通知保留且回调幂等',async()=>{
  await db.run("UPDATE orders SET status='refunding',wechat_refund_no='NOTIFY-REFUND',pay_at=NOW() WHERE id=?",[order]);
  const refund=await import('../../hanjing-clinic-backend/refunds.js');const payload={out_refund_no:'NOTIFY-REFUND',out_trade_no:'NOTIFY-O',refund_id:'NOTIFY-PROVIDER',amount:{currency:'CNY',total:1000,refund:1000},success_time:new Date().toISOString()};
  await refund.completeRefund({...payload,refund_status:'ABNORMAL'});await refund.completeRefund({...payload,refund_status:'SUCCESS'});await refund.completeRefund({...payload,refund_status:'SUCCESS'});
  assert.equal(Number((await db.get("SELECT COUNT(*) n FROM user_notifications WHERE business_type='order' AND business_id=? AND title='退款成功'",[order])).n),1);
 });

 await test('交付异常重取模、到店与首次试戴真实链路通知',async()=>{
  const o=(await db.run("INSERT INTO orders(order_no,user_id,total_amount,pay_amount,status,pay_at) VALUES('NOTIFY-DELIVERY',?,1000,1000,'paid',NOW())",[u])).id;
  const product=(await db.run("INSERT INTO products(name,category,price,image_url,status) VALUES('通知测试设备','device',1000,'','on')")).id;
  await db.run("INSERT INTO order_items(order_id,product_id,product_name,price,quantity,product_category_snapshot) VALUES(?,?,'通知测试设备',1000,1,'device')",[o,product]);
  const c=(await db.run("INSERT INTO fulfillment_cases(order_id,patient_id,store_id,technician_id,created_by,medical_record_id,status) VALUES(?,?,9000,9000,9000,?,'mold_sent')",[o,patient,medical])).id;
  const mold=(await db.run("INSERT INTO fulfillment_molds(fulfillment_case_id,technician_id,mold_no,storage_location) VALUES(?,9000,'NOTIFY-MOLD','测试')",[c])).id;
  await db.run("INSERT INTO fulfillment_mold_profiles(fulfillment_case_id,mold_id,details,updated_by) VALUES(?,?,'{}',9000)",[c,mold]);
  const batch=(await db.run("INSERT INTO fulfillment_factory_batches(batch_no,factory_name,status,created_by) VALUES('NOTIFY-BATCH','测试工厂','shipped',9000)")).id;
  const item=(await db.run("INSERT INTO fulfillment_factory_items(batch_id,fulfillment_case_id,mold_id,status) VALUES(?,?,?,'shipped')",[batch,c,mold])).id;
  for(const action of ['exception','retake']){const r=await businessCall(`/api/admin/fulfillment/batches/${batch}/items/${item}/progress`,{action,feedback:'测试原因'});assert.equal(r.status,200,JSON.stringify(r));assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='fulfillment' AND business_id=? AND event_code=?",[c,'factory_'+action]));}
  await db.run("UPDATE fulfillment_cases SET status='device_received' WHERE id=?",[c]);
  assert.equal((await businessCall(`/api/admin/fulfillment/cases/${c}/notify-fitting`,{})).status,200);
  const fit=await businessCall(`/api/admin/fulfillment/cases/${c}/fitting`,{device_product_id:product,initial_advancement:1,start_date:'2026-11-06',next_adjust_date:'2026-11-20'});assert.equal(fit.status,200,JSON.stringify(fit));
  assert.ok(await db.get("SELECT id FROM user_notifications WHERE business_type='treatment' AND user_id=? AND content LIKE '%通知测试设备%'",[u]));
 });

 await test('正式客户端路由认证、分页与越权详情检查',async()=>{
  const actual=express();actual.use(express.json(),(await import('../../hanjing-clinic-backend/routes/client.js')).default);
  const http=actual.listen(0);await new Promise(r=>http.once('listening',r));
  try{const url=`http://127.0.0.1:${http.address().port}/api/v1/user/notifications`;
    assert.equal((await fetch(url)).status,401);
    const own=await fetch(url+'?limit=2',{headers:{Authorization:'Bearer '+patientToken}});assert.equal(own.status,200);const data=(await own.json()).data;assert.equal(data.list.length,2);assert.ok(data.hasMore);
    assert.equal((await fetch(url+'/'+data.list[0].id,{headers:{Authorization:'Bearer '+otherToken}})).status,404);
    assert.equal((await fetch(url+'/'+data.list[0].id+'/read',{method:'POST',headers:{Authorization:'Bearer '+patientToken}})).status,200);
  }finally{await new Promise(r=>http.close(r));}
 });
 await test('单条已读重复调用不影响其他记录',async()=>{const item=(await call('')).data.list[0];assert.equal((await call('/'+item.id+'/read',{method:'POST'})).status,200);assert.equal((await call('/'+item.id+'/read',{method:'POST'})).status,200);assert.equal(Number((await db.get('SELECT is_read FROM user_notifications WHERE id=?',[item.id])).is_read),1);});

}finally{if(server)await new Promise(r=>server.close(r));if(db)await db.closePool();await connection.query(`DROP DATABASE \`${database}\``);await connection.end();mkdirSync(new URL('./artifacts/notification-center/',import.meta.url),{recursive:true});writeFileSync(new URL('./artifacts/notification-center/integration.json',import.meta.url),JSON.stringify({results,isolatedDatabaseRemoved:true},null,2));}
if(failed)process.exitCode=1;
