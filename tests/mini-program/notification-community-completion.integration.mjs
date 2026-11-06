import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';
const database='hanjing_test_notice_community_'+Date.now();
const env=JSON.parse(execFileSync('docker',['inspect','hanjing-mysql'],{encoding:'utf8'}))[0].Config.Env;
const password=env.find(s=>s.startsWith('MYSQL_ROOT_PASSWORD=')).slice('MYSQL_ROOT_PASSWORD='.length);
const control=await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const results=[];let db,server;let failed=false;
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS',name)}catch(e){results.push({name,status:'failed',error:e.message});failed=true;console.error('FAIL',name,e.message)}}
try{
await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_USER:'root',DB_PORT:'3306',DB_PASSWORD:password,DB_NAME:database,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex')});
db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
await (await import('../../hanjing-clinic-backend/community-notifications.js')).initCommunityNotifications(db.query);
// Only system identities are seeded; stores, patients, posts, interactions and moderation are created via actual APIs.
await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9100,'专项管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id,all_stores) VALUES(9100,'notice-audit','unused','专项管理员',9100,1)");
await db.run("INSERT INTO roles(id,name,code) VALUES(9101,'专项只读','test_read')");
await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(9101,'content:view')");
await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9101,'notice-read','unused','专项只读',9101)");
const helpers=await import('../../hanjing-clinic-backend/helpers.js');const admin=jwt.sign({id:9100,role:'super_admin',token_version:0},helpers.JWT_SECRET);const restricted=jwt.sign({id:9101,role:'test_read',token_version:0},helpers.JWT_SECRET);
const app=express();app.use(express.json());app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);app.use((await import('../../hanjing-clinic-backend/routes/client.js')).default);server=app.listen(0);await new Promise(r=>server.once('listening',r));
const call=async(path,body,method='POST',token=admin)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()}};
const ok=async(...args)=>{const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r));return r};
await ok('/api/admin/stores',{name:'专项门店',code:'NOTICE',address:'测试地址'});const store=await db.get("SELECT id FROM stores WHERE code='NOTICE'");
const users=[];
for(let i=0;i<3;i++){await ok('/api/admin/patients',{name:'通知患者'+i,phone:'1390000910'+i,store_id:store.id,level:'普通'});const u=await db.get('SELECT id,openid FROM users WHERE nickname=?',['通知患者'+i]);users.push({...u,token:jwt.sign({id:u.id,openid:u.openid},helpers.JWT_SECRET)})}
const post=(await ok('/api/v1/community/posts',{title:'通知测试文章',content:'用于核查通知的文章'},'POST',users[0].token)).data.id;
await test('真实点赞接口将两位用户聚合为一条且同人重赞不增加人数',async()=>{for(const u of users.slice(1))await ok(`/api/v1/community/posts/${post}/like`,{isLiked:true},'POST',u.token);await ok(`/api/v1/community/posts/${post}/like`,{isLiked:false},'POST',users[1].token);await ok(`/api/v1/community/posts/${post}/like`,{isLiked:true},'POST',users[1].token);const rows=await db.query("SELECT * FROM user_notifications WHERE business_id=? AND event_code='like_aggregate'",[post]);assert.equal(rows.length,1);assert.match(rows[0].content,/2 人/)});
await test('真实回复接口通知保存可定位评论ID',async()=>{const r=await ok(`/api/v1/community/posts/${post}/comment`,{content:'专项评论'},'POST',users[1].token);const row=await db.get("SELECT * FROM user_notifications WHERE business_id=? AND title='社区新评论' ORDER BY id DESC LIMIT 1",[post]);const metadata=typeof row.metadata==='string'?JSON.parse(row.metadata):row.metadata;assert.equal(String(metadata.commentId),String(r.data.id));});
await test('举报提交、列表和处理通知完整闭环且重复处理不重复',async()=>{await ok(`/api/v1/community/posts/${post}/report`,{reason:'信息不准确'},'POST',users[1].token);const list=(await ok('/api/admin/content/reports',undefined,'GET')).data.list;const report=list.find(r=>Number(r.post_id)===Number(post));assert.ok(report);const payload={status:'dismissed',result_text:'经核实文章描述与资料一致，本次举报不予采纳。'};await ok('/api/admin/content/reports/'+report.id,payload,'PUT');await ok('/api/admin/content/reports/'+report.id,payload,'PUT');const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='report' AND business_id=? AND event_code='processed'",[report.id]);assert.equal(rows.length,1);assert.equal(Number(rows[0].user_id),Number(users[1].id));assert.match(rows[0].content,/不予采纳/);});
await test('仅文章查看权限不能读取或处理举报',async()=>{assert.equal((await call('/api/admin/content/reports',undefined,'GET',restricted)).status,403);assert.equal((await call('/api/admin/content/reports/1',{status:'resolved',result_text:'处理'},'PUT',restricted)).status,403)});
await test('审核拒绝通知包含真实原因且重复保存不重复',async()=>{const body={status:'rejected',reject_reason:'请补充信息来源，避免夸大说明。'};await ok('/api/admin/content/articles/'+post,body,'PUT');await ok('/api/admin/content/articles/'+post,body,'PUT');const rows=await db.query("SELECT * FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='moderation'",[post]);assert.equal(rows.length,1);assert.match(rows[0].content,/请补充信息来源/);});

await test('本人拒绝稿修改再审核回环且禁止越权及公开帖绕过审核',async()=>{
 const path='/api/v1/community/posts/'+post+'/edit';
 const edit=await ok(path,undefined,'GET',users[0].token);assert.match(edit.data.rejectReason,/请补充信息来源/);
 assert.equal((await call(path,undefined,'GET',users[1].token)).status,404);
 assert.equal((await call(path,{title:'越权',content:'越权内容'},'PUT',users[1].token)).status,404);
 for(const extra of [{status:'approved'},{user_id:users[1].id},{user_role:'admin'}])assert.equal((await call(path,{title:'修改',content:'修改正文',...extra},'PUT',users[0].token)).status,400);
 const body={title:'修改后的文章',content:'已补充来源 & 对照说明',tags:['睡眠科普']};
 const saved=await ok(path,body,'PUT',users[0].token);assert.equal(saved.data.status,'pending');
 const reread=await ok(path,undefined,'GET',users[0].token);assert.equal(reread.data.content,body.content);assert.equal(reread.data.rejectReason,'');
 const state=await db.get('SELECT user_id,user_role,status FROM community_posts WHERE id=?',[post]);assert.equal(Number(state.user_id),Number(users[0].id));assert.equal(state.user_role,'patient');assert.equal(state.status,'pending');
 await ok('/api/admin/content/articles/'+post,{status:'approved'},'PUT');
 assert.equal((await call(path,undefined,'GET',users[0].token)).status,409);
 assert.equal((await call(path,body,'PUT',users[0].token)).status,409);
 const notes=await db.query("SELECT content FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='moderation'",[post]);assert.ok(notes.some(n=>n.content.includes('审核通过')));
});
await test('后台真实现金订单发货通知包含承运商和单号',async()=>{
 await ok('/api/admin/product-categories',{name:'专项分类',code:'notice_test'});
 const product=(await ok('/api/admin/products',{name:'专项商品',price:100,stock:10,category:'notice_test',status:'on'})).data.id;
 const patient=await db.get('SELECT id FROM patients WHERE user_id=?',[users[0].id]);
 await ok('/api/admin/orders',{patient_id:patient.id,store_id:store.id,items:[{product_id:product,quantity:1}],pay_amount:100,pay_method:'cash',payment_confirmed:true,type:'online',shipping_address:{receiver:'测试',phone:'13900009100',detail:'测试地址'}});
 const order=await db.get('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 1',[users[0].id]);
 await ok('/api/admin/orders/'+order.id+'/ship',{carrier:'顺丰',tracking_number:'NOTICE123456'});
 const note=await db.get("SELECT content FROM user_notifications WHERE business_type='order' AND business_id=? AND event_code='shipped'",[order.id]);assert.match(note.content,/顺丰/);assert.match(note.content,/NOTICE123456/);
 await ok('/api/admin/orders',{patient_id:patient.id,store_id:store.id,items:[{product_id:product,quantity:1}],pay_amount:100,pay_method:'cash',payment_confirmed:true,type:'offline',status:'processing'});
 const pickup=await db.get('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 1',[users[0].id]);await ok('/api/admin/orders/'+pickup.id+'/notify',{});
 const arrival=await db.get("SELECT content FROM user_notifications WHERE business_type='order' AND business_id=? AND title='商品已到店'",[pickup.id]);assert.match(arrival.content,/专项门店/);assert.match(arrival.content,/测试地址/);
});
await test('平台删除用户文章保留作者通知且目标不可用与重复删除幂等',async()=>{
 await ok('/api/admin/content/articles/'+post,{reason:'作者申请删除'},'DELETE');
 await ok('/api/admin/content/articles/'+post,{reason:'作者申请删除'},'DELETE');
 const notes=await db.query("SELECT * FROM user_notifications WHERE business_type='post' AND business_id=? AND event_code='moderation_removed'",[post]);assert.equal(notes.length,1);assert.equal(Number(notes[0].user_id),Number(users[0].id));assert.match(notes[0].content,/作者申请删除/);
 const detail=await ok('/api/v1/user/notifications/'+notes[0].id,undefined,'GET',users[0].token);assert.equal(detail.data.target,null);assert.ok(detail.data.unavailable);assert.match(detail.data.content,/已由平台移除/);
});
}catch(e){failed=true;results.push({name:'环境或业务前提',status:'failed',error:e.message});console.error(e)}finally{if(server)await new Promise(r=>server.close(r));if(db)await db.closePool();await control.query(`DROP DATABASE \`${database}\``);await control.end();mkdirSync('tests/mini-program/artifacts/notification-center',{recursive:true});writeFileSync('tests/mini-program/artifacts/notification-center/community-completion.json',JSON.stringify({method:'system identity initialization; actual business APIs create all business states; simulated JWT authorization, no native WeChat',results,cleanup:true},null,2));}
if(failed)process.exitCode=1;
