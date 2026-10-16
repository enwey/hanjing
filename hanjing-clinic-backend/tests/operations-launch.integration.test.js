import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';
import { runClinicalIntegrityTests } from './clinical-integrity-cases.js';
import { runPaymentIntegrityTests } from './payment-integrity-cases.js';
import { runAccountDisplayTests } from './account-display-cases.js';

test('operations launch fixes preserve scope, payment, stock and fulfillment invariants', async t => {
  const schema = 'hanjing_test_ops_launch_' + Date.now();
  const credentials = { host: '127.0.0.1', port: 3306, user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || 'root' };
  const control = await mysql.createConnection(credentials);
  let db, server;
  await control.query('CREATE DATABASE ' + schema);
  try {
    Object.assign(process.env, { DB_HOST: credentials.host, DB_PORT: '3306', DB_USER: credentials.user, DB_PASSWORD: credentials.password, DB_NAME: schema });
    db = await import('../db.js');
    await db.initDB();
    const helpers = await import('../helpers.js');
    const admin = await import('../routes/admin.js');
    const clientRoutes = await import('../routes/client.js');
    const refunds = await import('../refunds.js');
    const files = await import('../private-uploads.js');
    const app = express();
    app.use(express.json(), admin.default);
    app.use(clientRoutes.default);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message }));
    server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
    await control.query('USE ' + schema);
    await control.query("INSERT INTO roles(id,name,code,status) VALUES(1000,'Launch admin','super_admin','active'),(1001,'Launch staff','launch_staff','active')");
    const superRole = await db.get("SELECT id FROM roles WHERE code='super_admin'");
    await control.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1000,'launch-admin','unused','Admin',?,'online'),(1001,'launch-staff','unused','Staff',1001,'online'),(1002,'launch-tech','unused','Technician',1001,'online')", [superRole.id]);
    for (const permission of ['patient:view','patient:edit','order:view','order:edit','medical_record:view']) {
      await control.query('INSERT INTO permissions(role_id,permission_resource) VALUES(1001,?)',[permission]);
    }
    await control.query("INSERT INTO stores(id,name,code,address) VALUES(1,'One','ONE','One'),(2,'Two','TWO','Two')");
    await control.query('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(1001,1),(1002,1)');
    await control.query("INSERT INTO users(id,openid,nickname) VALUES(1,'LAUNCH-1','One'),(2,'LAUNCH-2','Two'),(3,'LAUNCH-3','L1'),(4,'LAUNCH-4','L2')");
    await control.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'One','self','LAUNCH-P1'),(2,2,'Two','self','LAUNCH-P2')");
    await control.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'Doctor','Doctor','Sleep')");
    await control.query("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(1,1,1,CURDATE(),'am','09:00','12:00')");
    await control.query("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(1,'LAUNCH-A1',1,1,1,1,1,CURDATE(),'10:00','completed'),(2,'LAUNCH-A2',2,2,2,1,1,CURDATE(),'11:00','completed'),(3,'LAUNCH-A3',1,1,2,1,1,CURDATE(),'12:00','completed')");
    await control.query("INSERT INTO products(id,name,category,image_url,price,stock,sales_count,status,is_distribution,commission_rate_level1,commission_rate_level2) VALUES(1,'Device','device','',10000,20,0,'on',1,10,3),(2,'Last item','accessory','',1000,1,0,'on',0,0,0),(3,'Zero rate','accessory','',1000,20,0,'on',1,0,0)");
    await control.query("INSERT INTO distributors(id,user_id,nickname,invite_code,status) VALUES(1,3,'L1','LAUNCH-L1','active'),(2,4,'L2','LAUNCH-L2','active')");
    await control.query('INSERT INTO distribution_relationships(parent_user_id,child_user_id,level) VALUES(3,1,1),(4,1,2)');
    await control.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,appointment_id,visit_date,diagnosis,attachments) VALUES(1,1,1,1,1,CURDATE(),'Fixture',JSON_ARRAY(JSON_OBJECT('url','/uploads/medical-attachments/launch.pdf')))");
    const root = jwt.sign({id:1000,role:'super_admin'}, helpers.JWT_SECRET);
    const staff = jwt.sign({id:1001,role:'launch_staff'}, helpers.JWT_SECRET);
    async function api(path, body, token=staff, method=body===undefined?'GET':'POST') {
      const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      const text = await r.text();
      let responseBody;
      try { responseBody = JSON.parse(text); } catch { responseBody = { message: text }; }
      return {status:r.status,body:responseBody};
    }
    const bill = {patient_id:1,appointment_id:1,items:[{product_id:1,quantity:1,price:10000}],pay_amount:10000,discount_amount:0,pay_method:'cash',payment_confirmed:true};
    await t.test('destructive endpoints are retired, with no data loss', async()=>{
      for(const p of ['reset-test-data','initialize-demo-data']) assert.equal((await api('/settings/'+p,{confirmation:'anything'},root)).status,410);
      assert.equal((await db.get('SELECT COUNT(*) n FROM users')).n,4);
    });
    await t.test('CRM and cashier reject unrelated patients and stores',async()=>{
      assert.equal((await api('/patients/2/crm-records')).status,403);
      assert.equal((await api('/patients/2/crm-records',{content:'bad'})).status,403);
      assert.equal((await api('/patients/1/crm-records')).status,200);
      assert.equal((await api('/patients/1/crm-records',{content:'valid',stage:'follow_up',follower_id:1001})).status,200);
      assert.equal((await api('/orders',{...bill,patient_id:2,appointment_id:2})).status,403);
      assert.equal((await api('/orders',{...bill,appointment_id:3})).status,403);
      assert.equal((await api('/orders',{...bill,appointment_id:undefined,store_id:2})).status,403);
      assert.deepEqual((await api('/orders/cashier-stores')).body.data.map(x=>Number(x.id)),[1]);
    });
    await t.test('unknown payments, unconfirmed receipts and invalid prices cannot create orders',async()=>{
      for(const patch of [{pay_method:undefined},{pay_method:'wechat'},{pay_method:'unknown'},{payment_confirmed:false},{items:[{product_id:1,quantity:1,price:-100}]},{items:[{product_id:1,quantity:true,price:10000}]},{items:[bill.items[0],bill.items[0]]},{pay_amount:1},{shipping_address:'not-json'}]) {
        const r=await api('/orders',{...bill,...patch});assert.equal(r.status,400,JSON.stringify(r.body));
      }
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders')).n,0);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,20);
    });
    await t.test('two concurrent buyers cannot oversell the final item',async()=>{
      const last={...bill,items:[{product_id:2,quantity:1,price:1000}],pay_amount:1000};
      const results=await Promise.all([api('/orders',last),api('/orders',last)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=2')).stock,0);
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders')).n,1);
    });
    await t.test('cash commissions use configured L1/L2 rates and zero stays zero',async()=>{
      const r=await api('/orders',bill);assert.equal(r.status,200,JSON.stringify(r.body));
      assert.deepEqual((await db.query('SELECT commission_level,commission_amount FROM distribution_orders WHERE order_id=? ORDER BY commission_level',[r.body.data.order_id])).map(x=>[x.commission_level,x.commission_amount]),[[1,1000],[2,300]]);
      const zero=await api('/orders',{...bill,items:[{product_id:3,quantity:1,price:1000}],pay_amount:1000});
      assert.equal(zero.status,200);assert.equal((await db.get('SELECT COUNT(*) n FROM distribution_orders WHERE order_id=?',[zero.body.data.order_id])).n,0);
    });
    await t.test('discounts reduce commission proportionally; free orders earn none',async()=>{
      const partial=await api('/orders',{...bill,discount_amount:5000,pay_amount:5000});
      assert.equal(partial.status,200);
      assert.deepEqual((await db.query('SELECT commission_amount FROM distribution_orders WHERE order_id=? ORDER BY commission_level',[partial.body.data.order_id])).map(x=>x.commission_amount),[500,150]);
      const free=await api('/orders',{...bill,discount_amount:10000,pay_amount:0});
      assert.equal(free.status,200);
      assert.equal((await db.get('SELECT COUNT(*) n FROM distribution_orders WHERE order_id=?',[free.body.data.order_id])).n,0);
    });
    let nativeId;
    await t.test('standalone checkout persists store; verified payment creates one linked fulfillment',async()=>{
      const r=await api('/orders',{...bill,pay_method:'wechat_native',technician_id:1002,status:'processing'});
      assert.equal(r.status,200,JSON.stringify(r.body));nativeId=r.body.data.order_id;
      assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[nativeId])).status,'pending');
      assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_cases WHERE order_id=?',[nativeId])).n,0);
      assert.equal((await db.get('SELECT COUNT(*) n FROM distribution_orders WHERE order_id=?',[nativeId])).n,0);
      const payment={trade_state:'SUCCESS',out_trade_no:r.body.data.order_no,transaction_id:'LAUNCH-WX',amount:{total:10000,currency:'CNY'}};
      await Promise.all([admin.finalizeAdminPaidOrder({id:nativeId},payment),admin.finalizeAdminPaidOrder({id:nativeId},payment)]);
      const cases=await db.query('SELECT * FROM fulfillment_cases WHERE order_id=?',[nativeId]);
      assert.equal(cases.length,1);assert.equal(Number(cases[0].technician_id),1002);assert.equal(Number(cases[0].medical_record_id),1);assert.equal(Number(cases[0].store_id),1);
      assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[nativeId])).status,'processing');
      assert.equal((await db.get('SELECT COUNT(*) n FROM distribution_orders WHERE order_id=?',[nativeId])).n,2);
      const standalone=await api('/orders',{...bill,appointment_id:undefined,store_id:1});
      assert.equal(standalone.status,200,JSON.stringify(standalone.body));
      assert.equal((await api('/orders/'+standalone.body.data.order_id)).status,200);
    });
    await t.test('native and micropay orders are accepted for real-channel refund review',async()=>{
      for(const method of ['wechat_native','wechat_micropay']) {
        const r=await api('/orders',{...bill,pay_method:method,status:'processing'});
        assert.equal(r.status,200);
        const id=r.body.data.order_id;
        await admin.finalizeAdminPaidOrder({id},{trade_state:'SUCCESS',out_trade_no:r.body.data.order_no,transaction_id:'WX-'+id,amount:{total:10000,currency:'CNY'}});
        await refunds.applyRefund(id,1,'Fixture refund');
        await refunds.reviewRefund(id,false,1000);
        assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'processing');
        await refunds.applyRefund(id,1,'Fixture refund');
        let calls=0;
        await refunds.reviewRefund(id,true,1000,{missing:async()=>[],create:async()=>{calls++;return {status:'PROCESSING'};}});
        assert.equal(calls,1);
        const before=(await db.get('SELECT stock FROM products WHERE id=1')).stock;
        const success={status:'SUCCESS',out_refund_no:'HJR'+id,out_trade_no:r.body.data.order_no,refund_id:'R'+id,success_time:new Date().toISOString(),amount:{total:10000,refund:10000,currency:'CNY'}};
        await refunds.completeRefund(success);await refunds.completeRefund(success);
        assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,before+1);
      }
    });
    await t.test('another store order remains private even when the same patient visited this store',async()=>{
      await db.run("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,status,appointment_id) VALUES('FOREIGN-STORE',1,'online',10000,10000,'shipping',3)");
      const o=await db.get("SELECT id FROM orders WHERE order_no='FOREIGN-STORE'");
      assert.equal((await api('/orders/'+o.id)).status,404);
      assert.equal((await api('/orders/'+o.id+'/tracking')).status,404);
      for(const suffix of ['ship','notify','complete']) assert.equal((await api('/orders/'+o.id+'/'+suffix,{carrier:'Fixture',trackingNo:'FIX12345'})).status,404);
      assert.ok(!(await api('/orders')).body.data.some(x=>Number(x.id)===Number(o.id)));
    });
    await t.test('assigned staff can access clinical attachments and after-sales without system permission',async()=>{
      assert.equal(await files.canReadPrivateUpload('/uploads/medical-attachments/launch.pdf',{id:1001,role:'launch_staff'}),true);
      await db.run('DELETE FROM admin_user_stores WHERE admin_user_id=1001');
      assert.equal(await files.canReadPrivateUpload('/uploads/medical-attachments/launch.pdf',{id:1001,role:'launch_staff'}),false);
      await db.run('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(1001,1)');
      assert.equal((await api('/after-sales-tickets')).status,200);
      const c=await db.get('SELECT id FROM fulfillment_cases WHERE order_id=?',[nativeId]);
      assert.equal((await api('/after-sales-tickets',{fulfillment_case_id:c.id,issue_type:'Fixture',description:'Fixture'})).status,200);
    });
    await t.test('pagination rejects unbounded pages and searches all scoped cases',async()=>{
      const first=await api('/fulfillment/cases?page=1&pageSize=1');
      assert.equal(first.status,200);assert.equal(first.body.data.length,1);assert.ok(first.body.pagination.total>=1);
      assert.equal((await api('/fulfillment/cases?pageSize=10000')).status,400);
      assert.equal((await api('/fulfillment/cases?search=NO-SUCH-PATIENT')).body.pagination.total,0);
      assert.equal((await api('/fulfillment/ready-molds?page=0')).status,400);
      assert.equal((await api('/fulfillment/batches?pageSize=101')).status,400);
      assert.equal((await api('/fulfillment/batches')).body.pagination.total,0);
    });
    await t.test('legacy membership migrates without downgrading or dropping recovery fields',async()=>{
      const columns=await db.query("SHOW COLUMNS FROM users LIKE 'member_level'");
      if(!columns.length)await db.run('ALTER TABLE users ADD COLUMN member_level VARCHAR(30) NULL');
      await db.run("INSERT INTO users(id,openid,nickname,member_level) VALUES(999,'LEGACY-LAUNCH','Legacy','gold')");
      await db.initDB();await db.initDB();
      assert.equal((await db.get('SELECT l.code FROM user_memberships m JOIN member_levels l ON l.id=m.level_id WHERE m.user_id=999')).code,'gold');
      assert.equal((await db.get('SELECT member_level FROM users WHERE id=999')).member_level,'gold');
    });
    await t.test('case, mold, batch and after-sales permissions follow the order and case stores',async()=>{
      const foreign=await db.get("SELECT id FROM orders WHERE order_no='FOREIGN-STORE'");
      assert.equal((await api('/fulfillment/cases',{order_id:foreign.id,patient_id:1,store_id:1})).status,404);
      assert.equal((await api('/fulfillment/cases',{order_id:foreign.id,patient_id:1,store_id:1},root)).status,400);
      const created=await api('/fulfillment/cases',{order_id:foreign.id,patient_id:1,store_id:2,technician_id:1002},root);
      assert.equal(created.status,200,JSON.stringify(created.body));
      const id=created.body.data.id;
      for(const suffix of ['detail','events','mold','mold-files/1']) assert.equal((await api('/fulfillment/cases/'+id+'/'+suffix)).status,404);
      assert.equal((await api('/fulfillment/cases/'+id+'/assign',{technician_id:1001})).status,404);
      assert.equal((await api('/fulfillment/cases/'+id+'/mold',{revision:0,details:{parameters:[]}})).status,404);
      assert.ok(!(await api('/fulfillment/cases')).body.data.some(c=>Number(c.id)===Number(id)));
      const mold={mold_no:'REVIEW-FOREIGN',storage_location:'Shelf',taken_date:'2026-10-15',method:'scan',wear_hours:8,wear_period:'night',requirements:'fixture',parameters:[{name:'size',value:'1'}]};
      assert.equal((await api('/fulfillment/cases/'+id+'/mold',{complete:true,revision:0,details:mold},root)).status,200);
      assert.ok(!(await api('/fulfillment/ready-molds')).body.data.some(c=>Number(c.id)===Number(id)));
      const batch=await api('/fulfillment/batches',{case_ids:[id],factory_name:'Fixture'},root);
      assert.equal(batch.status,200);
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id)).status,404);
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id+'/cancel',{})).status,404);
      assert.ok(!(await api('/fulfillment/batches')).body.data.some(b=>Number(b.id)===Number(batch.body.data.id)));
      const ticket=await api('/after-sales-tickets',{fulfillment_case_id:id,issue_type:'Fixture',description:'Foreign'},root);
      assert.equal(ticket.status,200);
      assert.ok(!(await api('/after-sales-tickets')).body.data.some(x=>Number(x.id)===Number(ticket.body.data.id)));
      assert.equal((await api('/after-sales-tickets/'+ticket.body.data.id,{status:'closed'},staff,'PUT')).status,404);
    });
    await t.test('refund freezes delivery, rejection resumes it, successful refund keeps it blocked',async()=>{
      const c=await db.get('SELECT * FROM fulfillment_cases WHERE order_id=?',[nativeId]);
      const path='/fulfillment/cases/'+c.id;
      await refunds.applyRefund(nativeId,1,'Freeze delivery');
      assert.equal((await api(path+'/mold',{revision:0,details:{parameters:[]}})).status,409);
      assert.equal((await api(path+'/assign',{technician_id:1002})).status,409);
      assert.equal((await api(path+'/mold')).body.data.editable,false);
      await refunds.reviewRefund(nativeId,false,1000);
      const mold={mold_no:'REVIEW-OWN',storage_location:'Shelf',taken_date:'2026-10-15',method:'scan',wear_hours:8,wear_period:'night',requirements:'fixture',parameters:[{name:'size',value:'1'}]};
      assert.equal((await api(path+'/mold',{complete:true,revision:0,details:mold})).status,200);
      let batch=await api('/fulfillment/batches',{case_ids:[c.id],factory_name:'Fixture'});
      assert.equal(batch.status,200,JSON.stringify(batch.body));
      await refunds.applyRefund(nativeId,1,'Freeze shipment');
      const shipment={carrier:'Fixture',tracking_no:'TRACK-REVIEW',confirmed:true};
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id+'/ship',shipment)).status,409);
      assert.equal((await db.get('SELECT status FROM fulfillment_factory_batches WHERE id=?',[batch.body.data.id])).status,'draft');
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id+'/cancel',{})).status,200);
      assert.ok(!(await api('/fulfillment/ready-molds')).body.data.some(x=>Number(x.id)===Number(c.id)));
      assert.equal((await api('/fulfillment/batches',{case_ids:[c.id],factory_name:'Fixture'})).status,409);
      await refunds.reviewRefund(nativeId,false,1000);
      batch=await api('/fulfillment/batches',{case_ids:[c.id],factory_name:'Fixture'});
      assert.equal(batch.status,200);
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id+'/ship',shipment)).status,200);
      await refunds.applyRefund(nativeId,1,'Final refund');
      await refunds.reviewRefund(nativeId,true,1000,{missing:async()=>[],create:async()=>({status:'PROCESSING'})});
      const order=await db.get('SELECT order_no FROM orders WHERE id=?',[nativeId]);
      await refunds.completeRefund({status:'SUCCESS',out_refund_no:'HJR'+nativeId,out_trade_no:order.order_no,refund_id:'REVIEW-R',success_time:new Date().toISOString(),amount:{total:10000,refund:10000,currency:'CNY'}});
      const item=await db.get('SELECT id FROM fulfillment_factory_items WHERE batch_id=?',[batch.body.data.id]);
      assert.equal((await api('/fulfillment/batches/'+batch.body.data.id+'/items/'+item.id+'/progress',{action:'received'})).status,409);
      await db.run("UPDATE fulfillment_cases SET status='device_received' WHERE id=?",[c.id]);
      assert.equal((await api(path+'/notify-fitting',{})).status,409);
      await db.run("UPDATE fulfillment_cases SET status='ready_for_fitting' WHERE id=?",[c.id]);
      assert.equal((await api(path+'/fitting',{})).status,409);
      assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_fittings WHERE fulfillment_case_id=?',[c.id])).n,0);
    });
    await t.test('arrival notification cannot overwrite a concurrent refund',async()=>{
      const billResult=await api('/orders',{...bill,status:'processing'});
      assert.equal(billResult.status,200);
      const id=billResult.body.data.order_id;
      let pending;
      await control.beginTransaction();
      try {
        const [[order]]=await control.query('SELECT * FROM orders WHERE id=? FOR UPDATE',[id]);
        pending=api('/orders/'+id+'/notify',{});
        let waiting=false;
        for(let n=0;n<100;n++) {
          const [processes]=await control.query('SHOW FULL PROCESSLIST');
          waiting=processes.some(p=>p.Info?.includes('SELECT status,type,shipping_address FROM orders'));
          if(waiting)break;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        assert.ok(waiting,'notification waits for the order row lock');
        const address=typeof order.shipping_address==='string'?JSON.parse(order.shipping_address):order.shipping_address;
        Object.assign(address,{refund_from_status:'processing',refund_reason:'Concurrent refund',refund_applied_at:new Date().toISOString()});
        await control.query("UPDATE orders SET status='refund_pending',shipping_address=? WHERE id=?",[JSON.stringify(address),id]);
        await control.commit();
        assert.equal((await pending).status,409);
        const saved=await db.get('SELECT shipping_address FROM orders WHERE id=?',[id]);
        assert.equal((typeof saved.shipping_address==='string'?JSON.parse(saved.shipping_address):saved.shipping_address).refund_reason,'Concurrent refund');
        await refunds.reviewRefund(id,false,1000);
        assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'processing');
        assert.equal((await api('/orders/'+id+'/notify',{})).status,200);
      } finally { await control.rollback(); if(pending)await pending; }
    });
    await t.test('protected memberships survive sync while earned levels still follow net spending',async()=>{
      const m=await import('../membership.js');
      assert.equal((await m.syncUserMembership(999)).member_level,'gold');
      await m.setUserMembership(999,'silver');
      await db.initDB();
      assert.equal((await m.syncUserMembership(999)).member_level,'silver');
      await m.setUserMembership(999,'normal');
      assert.equal((await m.syncUserMembership(999)).member_level,'normal');
      await db.run("INSERT INTO users(id,openid,nickname) VALUES(998,'MEMBER-EARNED','Earned')");
      const paid=await db.run("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,status,pay_at) VALUES('EARNED-GOLD',998,'offline',300000,300000,'paid',NOW())");
      assert.equal((await m.syncUserMembership(998)).member_level,'gold');
      await db.run("UPDATE orders SET status='refunded' WHERE id=?",[paid.id]);
      assert.equal((await m.syncUserMembership(998)).member_level,'normal');
      await m.setUserMembership(998,'gold');
      assert.equal((await m.syncUserMembership(998)).member_level,'gold');
      const synced=await Promise.all([m.syncUserMembership(998),m.syncUserMembership(998)]);
      assert.ok(synced.every(x=>x.member_level==='gold'));
    });
    await t.test('existing membership migration preserves legacy floors and newer admin overrides',async()=>{
      const m=await import('../membership.js');
      await db.run("INSERT INTO users(id,openid,nickname,member_level) VALUES(997,'LEGACY-EXISTING','Existing','gold'),(996,'LEGACY-OVERRIDE','Override','gold')");
      const normal=await db.get("SELECT id FROM member_levels WHERE code='normal'");
      await db.run('INSERT INTO user_memberships(user_id,level_id) VALUES(997,?),(996,?)',[normal.id,normal.id]);
      await m.setUserMembership(996,'silver');
      await db.run('ALTER TABLE user_memberships DROP COLUMN protected_level_id');
      await db.initDB();
      assert.equal((await m.syncUserMembership(997)).member_level,'gold');
      assert.equal((await m.syncUserMembership(996)).member_level,'silver');
      await m.setUserMembership(997,'normal');
      await db.initDB();
      assert.equal((await m.syncUserMembership(997)).member_level,'normal');
    });
    await t.test('cross-store and legacy clinical links never expose another clinic record',async()=>{
      await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1003,'review-two','unused','Two',1001,'online')");
      await db.run('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(1003,2)');
      const token=jwt.sign({id:1003,role:'launch_staff'},helpers.JWT_SECRET);
      const result=await api('/orders',{...bill,appointment_id:undefined,store_id:2,technician_id:1003},token);
      assert.equal(result.status,200,JSON.stringify(result.body));
      const id=result.body.data.fulfillment_case_id;
      assert.equal((await db.get('SELECT medical_record_id FROM fulfillment_cases WHERE id=?',[id])).medical_record_id,null);
      for(const linkedId of [null,1]) {
        await db.run('UPDATE fulfillment_cases SET medical_record_id=? WHERE id=?',[linkedId,id]);
        const detail=await api('/fulfillment/cases/'+id+'/detail',undefined,token);
        assert.equal(detail.status,200);
        assert.equal(detail.body.data.medical_record,null);
        assert.equal(detail.body.data.appointment,null);
        assert.deepEqual(detail.body.data.treatments,[]);
        const list=await api('/fulfillment/cases',undefined,token);
        assert.equal(list.body.data.find(c=>Number(c.id)===Number(id)).prescription,null);
      }
      const clinical=await import('../fulfillment-clinical.js');
      assert.equal(await clinical.resolveFulfillmentMedicalRecord({patient_id:1,order_id:result.body.data.order_id,medical_record_id:1}),null);
      assert.equal(await clinical.resolveFulfillmentMedicalRecord({patient_id:1,order_id:nativeId,store_id:2,medical_record_id:null}),null);
      await db.run("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,visit_date,diagnosis) VALUES(2,1,1,2,CURDATE(),'Store two')");
      const valid=await api('/orders',{...bill,appointment_id:undefined,store_id:2,technician_id:1003},token);
      assert.equal(valid.status,200);
      const detail=await api('/fulfillment/cases/'+valid.body.data.fulfillment_case_id+'/detail',undefined,token);
      assert.equal(Number(detail.body.data.medical_record.store_id),2);
      assert.equal(detail.body.data.medical_record.diagnosis,'Store two');
    });
    await t.test('delivered refunds do not restock even when a legacy case status is stale',async()=>{
      for(const staleStatus of [false,true]) {
        const created=await api('/orders',{...bill,pay_method:'wechat_native',technician_id:1002});
        assert.equal(created.status,200);
        const id=created.body.data.order_id;
        await admin.finalizeAdminPaidOrder({id},{trade_state:'SUCCESS',out_trade_no:created.body.data.order_no,transaction_id:'FIT-'+id,amount:{total:10000,currency:'CNY'}});
        const c=await db.get('SELECT * FROM fulfillment_cases WHERE order_id=?',[id]);
        await db.run("UPDATE fulfillment_cases SET status='ready_for_fitting' WHERE id=?",[c.id]);
        assert.equal((await api('/fulfillment/cases/'+c.id+'/fitting',{})).status,200);
        if(staleStatus)await db.run("UPDATE fulfillment_cases SET status='ready_for_fitting' WHERE id=?",[c.id]);
        const before=await db.get('SELECT stock,sales_count FROM products WHERE id=1');
        await refunds.applyRefund(id,1,'Test refund');
        await refunds.reviewRefund(id,true,1000,{missing:async()=>[],create:async()=>({status:'PROCESSING'})});
        const payload={status:'SUCCESS',out_refund_no:'HJR'+id,out_trade_no:created.body.data.order_no,refund_id:'FIT-R'+id,success_time:new Date().toISOString(),amount:{total:10000,refund:10000,currency:'CNY'}};
        assert.equal(await refunds.completeRefund(payload),true);
        assert.equal(await refunds.completeRefund(payload),false);
        const after=await db.get('SELECT stock,sales_count FROM products WHERE id=1');
        assert.equal(after.stock,before.stock);
        assert.equal(after.sales_count,before.sales_count-1);
        assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'refunded');
      }
    });
    await t.test('product edits preserve concurrent sales and reject stale manual stock changes',async()=>{
      let pending;
      const before=Number((await db.get('SELECT stock FROM products WHERE id=3')).stock);
      await control.beginTransaction();
      try {
        await control.query('SELECT id FROM products WHERE id=3 FOR UPDATE');
        pending=api('/products/3',{name:'Edited name only'},root,'PUT');
        let waiting=false;
        for(let n=0;n<100;n++) {
          const [ps]=await control.query('SHOW FULL PROCESSLIST');
          waiting=ps.some(p=>p.Info?.includes('SELECT * FROM products WHERE id=')&&p.Info?.includes('FOR UPDATE'));
          if(waiting)break;
          await new Promise(r=>setTimeout(r,50));
        }
        assert.ok(waiting,'product edit waits for current inventory');
        await control.query('UPDATE products SET stock=stock-1 WHERE id=3');
        await control.commit();
        assert.equal((await pending).status,200);
        assert.equal(Number((await db.get('SELECT stock FROM products WHERE id=3')).stock),before-1);
      } finally {await control.rollback();if(pending)await pending;}
      assert.equal((await api('/products/3',{stock:50},root,'PUT')).status,400);
      assert.equal((await api('/products/3',{name:'Must roll back',stock:50,expected_stock:before},root,'PUT')).status,409);
      assert.equal((await db.get('SELECT name FROM products WHERE id=3')).name,'Edited name only');
      const updates=await Promise.all([
        api('/products/3',{stock:50,expected_stock:before-1},root,'PUT'),
        api('/products/3',{stock:51,expected_stock:before-1},root,'PUT')
      ]);
      assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);
      const stock=Number((await db.get('SELECT stock FROM products WHERE id=3')).stock);
      assert.ok([50,51].includes(stock));
      assert.equal((await api('/products/3',{status:'on'},root,'PUT')).status,200);
      assert.equal(Number((await db.get('SELECT stock FROM products WHERE id=3')).stock),stock);
    });
    await t.test('concurrent verified payments use fresh membership totals after earlier reads',async()=>{
      const client=await import('../routes/client.js');
      await db.run("INSERT INTO users(id,openid,nickname) VALUES(887,'CONCURRENT-MEMBER','Concurrent')");
      await db.run('UPDATE products SET is_distribution=0 WHERE id=3');
      const ids=[];
      for(const suffix of ['A','B']) {
        const result=await db.run("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,status,pay_method) VALUES(?,887,'offline',80000,80000,'pending','wechat')",['MEM-'+suffix]);
        ids.push(result.id);
        await db.run("INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,3,'Fixture',80000,1)",[result.id]);
      }
      let release,ready;
      const gate=new Promise(r=>{release=r});
      const reached=new Promise(r=>{ready=r});
      const payment=suffix=>({trade_state:'SUCCESS',out_trade_no:'MEM-'+suffix,transaction_id:'MEM-TX-'+suffix,amount:{total:80000,currency:'CNY'}});
      const work=db.transaction(async conn=>{
        const wrapped={execute:async(sql,params)=>{
          const result=await conn.execute(sql,params);
          if(sql.includes('SELECT oi.quantity, oi.product_id')){ready();await gate;}
          return result;
        }};
        await client.finalizePaidProductOrder(wrapped,{id:ids[0]},payment('A'));
      });
      try {
        await Promise.race([reached,work.then(()=>{throw new Error('payment never reached read barrier');})]);
        await db.transaction(conn=>client.finalizePaidProductOrder(conn,{id:ids[1]},payment('B')));
      } finally {release();await work;}
      const actual=await db.get('SELECT l.code FROM user_memberships m JOIN member_levels l ON l.id=m.level_id WHERE m.user_id=887');
      assert.equal(Number((await db.get('SELECT SUM(pay_amount) total FROM orders WHERE user_id=887 AND pay_at IS NOT NULL')).total),160000);
      assert.equal(actual.code,'silver');
    });
    await t.test('appointment creation checks patient scope and validates before changing slots', async () => {
      await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(1001,'appointment:add')");
      await db.run('INSERT INTO doctor_store_mapping(doctor_id,store_id) VALUES(1,1)');
      await db.run("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time,people_per_slot,booked_slots) VALUES(887,1,1,'2099-10-16','am','09:00','12:00',1,0),(888,1,1,'2099-10-17','am','09:00','12:00',1,0),(889,1,1,'2099-10-18','am','09:00','12:00',1,0)");
      const body = { patient_id: 1, store_id: 1, doctor_id: 1, date: '2099-10-16', period: 'am', time: '09:00-09:30', type: 'first' };
      assert.equal((await api('/patients/2/crm-records')).status, 403);
      assert.equal((await api('/appointments', { ...body, patient_id: 2 })).status, 403);
      assert.equal((await api('/patients/2/crm-records')).status, 403);
      assert.equal((await api('/appointments', { ...body, patient_id: 999999 }, root)).status, 404);
      for (const patch of [{ consult_fee: -1 }, { deposit_amount: 'invalid' }, { consult_fee: 0.5 }]) {
        assert.equal((await api('/appointments', { ...body, ...patch })).status, 400);
      }
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, 0);
      const results = await Promise.all([api('/appointments', body), api('/appointments', body)]);
      assert.ok(results.every(r => r.status === 200), JSON.stringify(results));
      assert.notEqual(results[0].body.data.appointment_no, results[1].body.data.appointment_no);
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, 2);
      assert.equal((await db.get('SELECT COUNT(*) n FROM appointments WHERE schedule_id=887')).n, 2);
    });
    await t.test('a failed schedule write rolls back the appointment insert', async () => {
      await control.query(`CREATE TRIGGER test_schedule_failure BEFORE UPDATE ON doctor_schedules FOR EACH ROW
        BEGIN IF OLD.id = 889 AND NEW.booked_slots > OLD.booked_slots THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected schedule failure'; END IF; END`);
      try {
        const response = await api('/appointments', { patient_id: 1, store_id: 1, doctor_id: 1, date: '2099-10-18', period: 'am', time: '09:00-09:30', type: 'first' });
        assert.equal(response.status, 500);
        assert.equal((await db.get('SELECT COUNT(*) n FROM appointments WHERE schedule_id=889')).n, 0);
        assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=889')).booked_slots, 0);
      } finally { await control.query('DROP TRIGGER test_schedule_failure'); }
    });
    await t.test('new bookings and reschedules share the locked slot capacity', async () => {
      await db.run("INSERT IGNORE INTO user_patient_links(user_id,patient_id,relation) VALUES(1,1,'self'),(2,2,'self')");
      await db.run("UPDATE stores SET status='open' WHERE id=1");
      await db.run('UPDATE doctors SET status=1 WHERE id=1');
      const wxToken = jwt.sign({ id: 1, openid: 'LAUNCH-1' }, helpers.JWT_SECRET);
      const clientApi = async (path, body) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
          method: 'POST', headers: { authorization: 'Bearer ' + wxToken, 'content-type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
        });
        return { status: response.status, body: await response.json() };
      };
      const body = { patientId: 1, storeId: 1, doctorId: 1, scheduleId: 888, appointmentDate: '2099-10-17', appointmentTime: '09:00-09:30', type: 'first' };
      const results = await Promise.all(Array.from({ length: 8 }, () => clientApi('/appointments', body)));
      assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results));
      assert.ok(results.every(r => [200, 400].includes(r.status)), JSON.stringify(results));
      assert.equal((await db.get("SELECT COUNT(*) n FROM appointments WHERE schedule_id=888 AND appointment_time='09:00-09:30'")).n, 1);
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=888')).booked_slots, 1);
      const existing = results.find(r => r.status === 200).body.data.id;
      const mixed = await Promise.all([
        clientApi(`/appointments/${existing}/reschedule`, { scheduleId: 888, appointmentDate: '2099-10-17', appointmentTime: '10:00-10:30' }),
        clientApi('/appointments', { ...body, appointmentTime: '10:00-10:30' })
      ]);
      assert.deepEqual(mixed.map(r => r.status).sort(), [200, 400], JSON.stringify(mixed));
      assert.equal((await db.get("SELECT COUNT(*) n FROM appointments WHERE schedule_id=888 AND appointment_time='10:00-10:30'")).n, 1);
      const counts = await db.get('SELECT (SELECT booked_slots FROM doctor_schedules WHERE id=888) booked, COUNT(*) actual FROM appointments WHERE schedule_id=888');
      assert.equal(counts.booked, counts.actual);
    });
    await t.test('registration grants first-visit access only in the selected authorized store', async () => {
      await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(1001,'patient:add'),(1001,'appointment:edit')");
      const list = await api('/patients/registration-stores');
      assert.deepEqual(list.body.data.map(s => Number(s.id)), [1]);
      const form = { name: 'First visit', phone: '13800000987', store_id: 1, source: '门店' };
      assert.equal((await api('/patients', { ...form, store_id: 2 })).status, 403);
      const created = await api('/patients', form);
      assert.equal(created.status, 200, JSON.stringify(created));
      const patientId = created.body.data.id;
      assert.equal((await api(`/patients/${patientId}/crm-records`)).status, 200);
      const outside = jwt.sign({ id: 1003, role: 'launch_staff' }, helpers.JWT_SECRET);
      assert.equal((await api(`/patients/${patientId}/crm-records`, undefined, outside)).status, 403);
      assert.equal((await api('/appointments', { patient_id: patientId, store_id: 1, doctor_id: 1, date: '2099-10-18', period: 'am', time: '09:00-09:30' })).status, 200);
      const reg = await db.get('SELECT store_id,created_by FROM patient_store_registrations WHERE patient_id=?', [patientId]);
      assert.deepEqual(reg, { store_id: 1, created_by: 1001 });
      const multi = await api('/patients', { name: 'Multiple stores', phone: '13800000988' }, root);
      assert.equal(multi.status, 400);
      assert.equal((await db.get("SELECT COUNT(*) n FROM users WHERE phone='13800000988'")).n, 0);
    });
    await t.test('registration failure rolls back both the user and patient', async () => {
      const before = await db.get('SELECT COUNT(*) n FROM patients');
      await control.query("CREATE TRIGGER test_registration_failure BEFORE INSERT ON patient_store_registrations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected registration failure'");
      try {
        assert.equal((await api('/patients', { name: 'Rollback', phone: '13800000989', store_id: 1 })).status, 500);
        assert.equal((await db.get('SELECT COUNT(*) n FROM patients')).n, before.n);
        assert.equal((await db.get("SELECT COUNT(*) n FROM users WHERE phone='13800000989'")).n, 0);
      } finally { await control.query('DROP TRIGGER test_registration_failure'); }
    });
    const createReviewAppointment = async (fee = 0) => {
      const r = await api('/appointments', { patient_id: 1, store_id: 1, doctor_id: 1, date: '2099-10-16', period: 'am', time: '11:00-11:30', consult_fee: fee });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r.body.data.id;
    };
    const change = (id, body) => api('/appointments/' + id, body, staff, 'PUT');
    await t.test('rescheduling preserves saved fees and cannot skip payment or revive terminal appointments', async () => {
      const id = await createReviewAppointment(5000);
      await db.run('UPDATE doctors SET consult_fee=9000 WHERE id=1');
      const moved = await change(id, { date: '2099-10-17', period: 'am', time: '11:00-11:30', status: 'pending' });
      assert.equal(moved.status, 200, JSON.stringify(moved));
      assert.deepEqual(await db.get('SELECT status,consult_fee FROM appointments WHERE id=?', [id]), { status: 'pending_payment', consult_fee: 5000 });
      assert.equal((await change(id, { status: 'confirmed' })).status, 409);
      assert.equal((await change(id, { status: 'pending' })).status, 409);
      await db.run("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,pay_at,status,appointment_id) VALUES('REVIEW-RECEIPT',1,'appointment_deposit',5000,5000,NOW(),'paid',?)", [id]);
      assert.equal((await change(id, { status: 'pending' })).status, 200);
      assert.equal((await change(id, { status: 'cancelled' })).status, 409);
      await db.run("UPDATE orders SET status='refunded' WHERE order_no='REVIEW-RECEIPT'");
      assert.equal((await change(id, { status: 'cancelled' })).status, 200);
      assert.equal((await change(id, { date: '2099-10-18', period: 'am', time: '11:00-11:30' })).status, 409);
      assert.equal((await change(id, { status: 'pending' })).status, 409);
      assert.equal((await change(id, { status: 'invented' })).status, 400);
      await db.run('UPDATE doctors SET consult_fee=0 WHERE id=1');
    });
    await t.test('cancel and no-show release a slot once, including repeated requests', async () => {
      for (const status of ['cancelled', 'no_show']) {
        const id = await createReviewAppointment();
        const before = (await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots;
        const results = await Promise.all([change(id, { status }), change(id, { status })]);
        assert.ok(results.every(r => [200, 409].includes(r.status)), JSON.stringify(results));
        assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, before - 1);
        assert.equal((await change(id, { status })).status, 200);
        assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, before - 1);
      }
    });
    await t.test('simultaneous admin moves cannot reserve two destination schedules', async () => {
      const id = await createReviewAppointment();
      const before = await db.query('SELECT id,booked_slots FROM doctor_schedules WHERE id IN (887,888,889) ORDER BY id');
      await control.beginTransaction();
      await control.query('SELECT id FROM doctor_schedules WHERE id=887 FOR UPDATE');
      const jobs = [17,18].map(day => change(id, { date: '2099-10-' + day, period: 'am', time: '11:00-11:30' }));
      let waiting = 0;
      try {
        for (let n = 0; n < 200; n++) {
          const processes = await db.query('SHOW FULL PROCESSLIST');
          waiting = processes.filter(p => p.db === schema && String(p.Info).includes('SELECT * FROM doctor_schedules WHERE id = 887 FOR UPDATE')).length;
          if (waiting === 2) break;
          await new Promise(r => setTimeout(r, 10));
        }
      } finally { await control.commit(); }
      const results = await Promise.all(jobs);
      assert.equal(waiting, 2, 'Both requests must read the old appointment before release');
      assert.deepEqual(results.map(r => r.status).sort(), [200,409], JSON.stringify(results));
      const current = await db.get('SELECT schedule_id FROM appointments WHERE id=?', [id]);
      const after = await db.query('SELECT id,booked_slots FROM doctor_schedules WHERE id IN (887,888,889) ORDER BY id');
      after.forEach((row, i) => assert.equal(row.booked_slots, before[i].booked_slots + (row.id === 887 ? -1 : Number(row.id === current.schedule_id))));
    });
    await t.test('a paid no-show keeps the receipt and releases capacity without forcing a refund', async () => {
      const id = await createReviewAppointment(5000);
      await db.run("INSERT INTO orders(order_no,user_id,type,total_amount,pay_amount,pay_at,status,appointment_id) VALUES('REVIEW-NOSHOW-PAID',1,'appointment_deposit',5000,5000,NOW(),'paid',?)", [id]);
      assert.equal((await change(id, { status: 'pending' })).status, 200);
      const before = (await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots;
      assert.equal((await change(id, { status: 'no_show' })).status, 200);
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, before - 1);
      assert.equal((await db.get("SELECT status FROM orders WHERE order_no='REVIEW-NOSHOW-PAID'")).status, 'paid');
    });
    await t.test('notification failure rolls back cancellation and slot release', async () => {
      const id = await createReviewAppointment();
      const before = (await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots;
      await control.query(`CREATE TRIGGER test_status_notification_failure BEFORE INSERT ON user_notifications FOR EACH ROW
        BEGIN IF NEW.title = '预约状态更新' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected notification failure'; END IF; END`);
      try {
        assert.equal((await change(id, { status: 'cancelled' })).status, 500);
        assert.equal((await db.get('SELECT status FROM appointments WHERE id=?', [id])).status, 'pending');
        assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots, before);
      } finally { await control.query('DROP TRIGGER test_status_notification_failure'); }
    });
    await t.test('mini-program cancellation and admin reschedule cannot overwrite each other', async () => {
      const id = await createReviewAppointment();
      const before = await db.query('SELECT id,booked_slots FROM doctor_schedules WHERE id IN (887,889) ORDER BY id');
      const token = jwt.sign({ id: 1, openid: 'LAUNCH-1' }, helpers.JWT_SECRET);
      const clientCancel = async () => {
        const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/appointments/${id}/cancel`, {
          method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Review race' }), signal: AbortSignal.timeout(15000)
        });
        return { status: r.status, body: await r.json() };
      };
      await control.beginTransaction();
      await control.query('SELECT id FROM doctor_schedules WHERE id=887 FOR UPDATE');
      const jobs = [clientCancel(), change(id, { date: '2099-10-18', period: 'am', time: '11:00-11:30' })];
      let waiting = 0;
      try {
        for (let i = 0; i < 200; i++) {
          const processes = await db.query('SHOW FULL PROCESSLIST');
          waiting = processes.filter(p => p.db === schema && String(p.Info).includes('SELECT * FROM doctor_schedules WHERE id = 887 FOR UPDATE')).length;
          if (waiting === 2) break;
          await new Promise(r => setTimeout(r, 10));
        }
      } finally { await control.commit(); }
      const results = await Promise.all(jobs);
      assert.equal(waiting, 2);
      assert.deepEqual(results.map(r => r.status).sort(), [200,409], JSON.stringify(results));
      const current = await db.get('SELECT status,schedule_id FROM appointments WHERE id=?', [id]);
      const after = await db.query('SELECT id,booked_slots FROM doctor_schedules WHERE id IN (887,889) ORDER BY id');
      assert.equal(after[0].booked_slots, before[0].booked_slots - 1);
      assert.equal(after[1].booked_slots, before[1].booked_slots + Number(current.status !== 'cancelled'));
    });
    await db.run("INSERT INTO products(id,name,category,image_url,price,stock,status) VALUES(901,'挂号门诊费','service','',5000,0,'on'),(902,'预约定金','service','',2000,0,'on')");
    const feeBill = (id, method='cash') => ({ ...bill, appointment_id:id, pay_method:method, items:[
      {product_id:901,quantity:1,price:5000,appointment_fee_kind:'consult_fee'},
      {product_id:902,quantity:1,price:2000,appointment_fee_kind:'deposit_amount'}
    ], pay_amount:7000 });
    const createFeeAppointment = async () => {
      const id = await createReviewAppointment(5000);
      await db.run('UPDATE appointments SET deposit_amount=2000 WHERE id=?',[id]);
      return id;
    };
    await t.test('cashier retries reuse one order and reject reuse with changed contents', async () => {
      const id=await createReviewAppointment();
      const payload={...bill,appointment_id:id,request_id:'retry-20261016-cashier-000001',items:[{product_id:3,quantity:1,price:1000}],pay_amount:1000};
      const before=(await db.get('SELECT stock FROM products WHERE id=3')).stock;
      const responses=await Promise.all([api('/orders',payload),api('/orders',payload)]);
      assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
      assert.equal(responses[0].body.data.order_id,responses[1].body.data.order_id);
      assert.equal((await db.get('SELECT stock FROM products WHERE id=3')).stock,before-1);
      assert.equal((await api('/orders',{...payload,discount_amount:100,pay_amount:900})).status,409);
      assert.equal((await api('/orders',payload)).body.data.order_id,responses[0].body.data.order_id);
    });
    await t.test('retail receipts, partial fees and forged fee items cannot unlock an appointment', async () => {
      const id = await createFeeAppointment();
      const retail = await api('/orders',{...bill,appointment_id:id,items:[{product_id:3,price:1000,quantity:1}],pay_amount:1000});
      assert.equal(retail.status,200,JSON.stringify(retail));
      assert.equal((await change(id,{status:'pending'})).status,409);
      for (const patch of [
        {items:[feeBill(id).items[0]],pay_amount:5000},
        {items:[{...feeBill(id).items[0],product_id:3},feeBill(id).items[1]]},
        {items:[{...feeBill(id).items[0],price:1000},feeBill(id).items[1]],pay_amount:3000}
      ]) assert.equal((await api('/orders',{...feeBill(id),...patch})).status,400);
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'pending_payment');
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[id])).n,1);
    });
    await t.test('explicit fee discounts remain auditable and settle exactly once', async () => {
      const id = await createFeeAppointment();
      const results=await Promise.all([api('/orders',{...feeBill(id),discount_amount:1000,pay_amount:6000}),api('/orders',{...feeBill(id),discount_amount:1000,pay_amount:6000})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409],JSON.stringify(results));
      const paid=results.find(r=>r.status===200).body.data;
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'pending');
      const order=await db.get('SELECT * FROM orders WHERE id=?',[paid.order_id]);
      const context=typeof order.cashier_context==='string'?JSON.parse(order.cashier_context):order.cashier_context;
      assert.deepEqual(context.appointment_fees,{version:1,consult_fee:5000,deposit_amount:2000});
      assert.equal(order.discount_amount,1000);
      assert.equal((await change(id,{status:'confirmed'})).status,200);
      await refunds.applyRefund(order.id,1,'Test refund');
      assert.equal((await change(id,{status:'checked_in'})).status,409);
      await refunds.reviewRefund(order.id,false,1000);
      assert.equal((await change(id,{status:'checked_in'})).status,200);
      const freeId=await createFeeAppointment();
      assert.equal((await api('/orders',{...feeBill(freeId),discount_amount:7000,pay_amount:0})).status,200);
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[freeId])).status,'pending');
    });
    await t.test('wechat fees wait for verified payment and callback retries do not duplicate receipts', async () => {
      const id=await createFeeAppointment();
      const created=await api('/orders',feeBill(id,'wechat_native'));
      assert.equal(created.status,200,JSON.stringify(created));
      assert.equal((await change(id,{status:'confirmed'})).status,409);
      assert.equal((await api('/orders',feeBill(id))).status,409);
      const payment={trade_state:'SUCCESS',out_trade_no:created.body.data.order_no,transaction_id:'FEE-'+id,amount:{currency:'CNY',total:7000}};
      await assert.rejects(admin.finalizeAdminPaidOrder({id:created.body.data.order_id},{...payment,amount:{currency:'CNY',total:1000}}));
      await Promise.all([admin.finalizeAdminPaidOrder({id:created.body.data.order_id},payment),admin.finalizeAdminPaidOrder({id:created.body.data.order_id},payment)]);
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'pending');
      assert.equal((await db.get('SELECT COUNT(*) n FROM orders WHERE appointment_id=?',[id])).n,1);
      assert.equal((await change(id,{status:'cancelled'})).status,409);
    });
    await t.test('cancel cannot race a cashier transaction past its appointment lock', async () => {
      const id=await createReviewAppointment();
      const before=(await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots;
      await control.beginTransaction();
      await control.query('SELECT id FROM products WHERE id=3 FOR UPDATE');
      const checkout=api('/orders',{...bill,appointment_id:id,items:[{product_id:3,price:1000,quantity:1}],pay_amount:1000});
      let waiting=false, cancel;
      try {
        for(let i=0;i<200;i++) {
          waiting=(await db.query('SHOW FULL PROCESSLIST')).some(p=>p.db===schema && String(p.Info).includes('SELECT * FROM products WHERE id IN'));
          if(waiting)break;
          await new Promise(r=>setTimeout(r,10));
        }
        cancel=change(id,{status:'cancelled'});
      } finally { await control.commit(); }
      const results=await Promise.all([checkout,cancel]);
      assert.ok(waiting);
      assert.deepEqual(results.map(r=>r.status),[200,409],JSON.stringify(results));
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'pending');
      assert.equal((await db.get('SELECT booked_slots FROM doctor_schedules WHERE id=887')).booked_slots,before);
      const cancelled=await createReviewAppointment();
      assert.equal((await change(cancelled,{status:'cancelled'})).status,200);
      assert.equal((await api('/orders',{...bill,appointment_id:cancelled})).status,409);
      const token=jwt.sign({id:1,openid:'LAUNCH-1'},helpers.JWT_SECRET);
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/appointments/${id}/cancel`,{
        method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'
      });
      assert.equal(response.status,409);
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'pending');
    });
    await t.test('clinical entrypoints cannot bypass fees or mutate a different patient appointment', async () => {
      const id=await createFeeAppointment();
      const record={doctor_id:1,store_id:1,visit_date:'2099-10-16',diagnosis:'Fixture'};
      for(const endpoint of ['save-consultation','complete-consultation']) {
        assert.equal((await api(`/appointments/${id}/${endpoint}`,{medical_record:record},root)).status,409);
      }
      assert.equal((await api('/patients/1/medical-records',{...record,appointment_id:id},root)).status,409);
      assert.equal((await api('/patients/2/medical-records',{...record,appointment_id:id},root)).status,400);
      assert.equal((await db.get('SELECT COUNT(*) n FROM medical_records WHERE appointment_id=?',[id])).n,0);
      assert.equal((await api('/orders',feeBill(id))).status,200);
      assert.equal((await api(`/appointments/${id}/complete-consultation`,{medical_record:{...record,store_id:2}},root)).status,400);
      assert.equal((await api(`/appointments/${id}/complete-consultation`,{medical_record:record},root)).status,200);
      assert.equal((await api(`/appointments/${id}/complete-consultation`,{medical_record:record},root)).status,409);
      const appointmentNo = (await db.get('SELECT appointment_no FROM appointments WHERE id=?',[id])).appointment_no;
      const notificationCount = async () => (await db.get('SELECT COUNT(*) n FROM user_notifications WHERE content LIKE ?',['%'+appointmentNo+'%'])).n;
      const notificationsBefore = await notificationCount();
      const settlements = await Promise.all([change(id,{status:'arrived'}),change(id,{status:'arrived'})]);
      // A stale concurrent writer may be rejected by the existing optimistic lock.
      assert.ok(settlements.some(result=>result.status===200),JSON.stringify(settlements));
      assert.ok(settlements.every(result=>[200,409].includes(result.status)),JSON.stringify(settlements));
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'arrived');
      assert.equal((await change(id,{status:'arrived'})).status,200);
      assert.equal(await notificationCount(),notificationsBefore+1);
      assert.equal((await api(`/appointments/${id}/save-consultation`,{medical_record:{...record,note:'Amendment'}},root)).status,200);
      assert.equal((await change(id,{status:'pending'})).status,409);
      assert.equal((await db.get('SELECT COUNT(*) n FROM medical_records WHERE appointment_id=?',[id])).n,1);
    });
    await t.test('late appointment payments are recorded for refund using the original provider trade number', async () => {
      const id=await createReviewAppointment(5000);
      assert.equal((await change(id,{status:'cancelled'})).status,200);
      const appt=await db.get('SELECT * FROM appointments WHERE id=?',[id]);
      const payment={trade_state:'SUCCESS',out_trade_no:appt.appointment_no,transaction_id:'LATE-'+id,amount:{currency:'CNY',total:5000}};
      await db.transaction(conn=>clientRoutes.finalizePaidAppointment(conn,appt,1,payment));
      await db.transaction(conn=>clientRoutes.finalizePaidAppointment(conn,appt,1,payment));
      const orders=await db.query('SELECT * FROM orders WHERE appointment_id=?',[id]);
      assert.equal(orders.length,1);assert.equal(orders[0].status,'refund_pending');
      assert.equal((await db.get('SELECT status FROM appointments WHERE id=?',[id])).status,'cancelled');
      let submitted;
      await refunds.reviewRefund(orders[0].id,true,1000,{missing:async()=>[],create:async request=>{submitted=request;return {status:'PROCESSING'};}});
      assert.equal(submitted.outTradeNo,appt.appointment_no);
      await refunds.completeRefund({status:'SUCCESS',out_refund_no:'HJR'+orders[0].id,out_trade_no:appt.appointment_no,refund_id:'LATE-REFUND',success_time:new Date().toISOString(),amount:{currency:'CNY',total:5000,refund:5000}});
      assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[orders[0].id])).status,'refunded');
    });
    await runClinicalIntegrityTests({ t, db, control, api, root, staff, helpers });
    const wxToken = jwt.sign({id:1,openid:'LAUNCH-1'}, helpers.JWT_SECRET);
    const wxApi = async path => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
        method:'POST', headers:{authorization:'Bearer '+wxToken,'content-type':'application/json'}, body:'{}', signal:AbortSignal.timeout(15000)
      });
      return {status:response.status,body:await response.json()};
    };
    await runPaymentIntegrityTests({ t, db, control, api, wxApi, root, staff, admin, clientRoutes, refunds, createFeeAppointment, feeBill, bill });
    await runAccountDisplayTests({ t, db, api, root, staff, helpers });
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(db)await db.closePool();
    assert.match(schema,/^hanjing_test_ops_launch_[0-9]+$/);
    await control.query('DROP DATABASE '+schema);await control.end();
  }
});
