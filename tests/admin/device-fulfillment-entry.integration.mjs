import {test} from 'node:test';
import assert from 'node:assert/strict';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

test('paid device orders enter fulfillment using frozen product categories',{timeout:180000},async t=>{
 const schema='hanjing_test_device_entry_'+Date.now();
 const control=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD||'root'});
 let db,server;
 try {
  await control.query(`CREATE DATABASE ${schema}`);await control.query(`USE ${schema}`);
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_NAME:schema,DB_USER:'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root'});
  db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
  const {createPaidFulfillment}=await import('../../hanjing-clinic-backend/paid-fulfillment.js');
  const {completeFittingTreatment}=await import('../../hanjing-clinic-backend/fulfillment-treatment.js');
  await control.query("INSERT INTO users(id,openid,nickname) VALUES(1,'DEVICE-ENTRY','Fixture')");
  await control.query("INSERT INTO patients(id,user_id,name,relation) VALUES(1,1,'Fixture','self')");
  await control.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'Doctor','Title','Sleep')");
  await control.query("INSERT INTO stores(id,name,code,address) VALUES(1,'Clinic','ENTRY','Address')");
  await control.query("INSERT INTO roles(id,name,code,data_scope) VALUES(999,'Fixture','super_admin',JSON_OBJECT('type','system'))");
  await control.query("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(999,'fixture-entry','unused','Tech',999)");
  await control.query("INSERT INTO products(id,name,category,image_url,price,status,stock) VALUES(1,'Device','device','/fixture',100,'on',100),(2,'Consultation','service','/fixture',100,'on',100)");
  await control.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,visit_date,diagnosis) VALUES(1,1,1,1,'2026-11-05','Fixture')");
  const admin=(await import('../../hanjing-clinic-backend/routes/admin.js')).default;
  const client=await import('../../hanjing-clinic-backend/routes/client.js');
  const {JWT_SECRET}=await import('../../hanjing-clinic-backend/helpers.js');
  const app=express();app.use(express.json(),admin,client.default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const base=`http://127.0.0.1:${server.address().port}`,token=jwt.sign({id:999,role:'super_admin',token_version:0},JWT_SECRET,{expiresIn:'10m'});
  async function api(path,body){const r=await fetch(base+'/api/admin'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}}
  async function bill(product=1,extra={}){const r=await api('/orders',{patient_id:1,store_id:1,items:[{product_id:product,price:100,quantity:1}],pay_amount:100,discount_amount:0,pay_method:'cash',payment_confirmed:true,type:'offline',...extra});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data.order_id}
  const cases=id=>db.query('SELECT * FROM fulfillment_cases WHERE order_id=?',[id]);
  let unassigned;
  await t.test('cash device without technician enters pending assignment with a category snapshot',async()=>{
   unassigned=await bill();const [c]=await cases(unassigned);assert.equal(c.status,'pending_assignment');assert.equal(c.technician_id,null);assert.equal(c.medical_record_id,1);
   assert.equal((await db.get('SELECT * FROM order_items WHERE order_id=?',[unassigned])).product_category_snapshot,'device');
  });
  await t.test('device with technician enters assigned; non-device does not enter even with technician',async()=>{
   const id=await bill(1,{technician_id:999});assert.equal((await cases(id))[0].status,'assigned');
   const service=await bill(2,{technician_id:999});assert.equal((await cases(service)).length,0);
   const manual=await api('/fulfillment/cases',{order_id:service,patient_id:1,store_id:1,technician_id:999});assert.equal(manual.status,400);
  });
  await t.test('pending WeChat waits for payment; persisted paid state and duplicate notifications produce one case',async()=>{
   const id=await bill(1,{pay_method:'wechat',payment_confirmed:false});assert.equal((await cases(id)).length,0);
   const order=await db.get('SELECT * FROM orders WHERE id=?',[id]);assert.equal(await db.transaction(c=>createPaidFulfillment(c,order)),null);
   const payment={trade_state:'SUCCESS',out_trade_no:order.order_no,transaction_id:'ENTRY-TX-'+id,amount:{currency:'CNY',total:100}};
   await db.transaction(c=>client.finalizePaidProductOrder(c,order,payment));
   await db.transaction(c=>client.finalizePaidProductOrder(c,order,payment));
   assert.equal((await cases(id)).length,1);assert.equal((await cases(id))[0].status,'pending_assignment');
  });
  await t.test('concurrent retries return the existing case without duplicate events',async()=>{
   const order=await db.get('SELECT * FROM orders WHERE id=?',[unassigned]);const ids=await Promise.all([db.transaction(c=>createPaidFulfillment(c,order)),db.transaction(c=>createPaidFulfillment(c,order))]);assert.equal(ids[0],ids[1]);
   assert.equal((await db.get("SELECT COUNT(*) n FROM fulfillment_events WHERE fulfillment_case_id=? AND event_type='case_created'",[ids[0]])).n,1);
  });
  await t.test('category changes cannot prevent device display/fitting or promote an old service order',async()=>{
   const id=await bill(1,{technician_id:999});const service=await bill(2);
   await db.run("UPDATE products SET category='service' WHERE id=1");await db.run("UPDATE products SET category='device' WHERE id=2");
   const [c]=await cases(id);const detail=await api(`/fulfillment/cases/${c.id}/detail`);assert.equal(detail.status,200);assert.equal(detail.body.data.items[0].category,'device');
   assert.equal(await db.transaction(conn=>createPaidFulfillment(conn,{id:service})),null);
   await db.run("UPDATE fulfillment_cases SET status='ready_for_fitting' WHERE id=?",[c.id]);
   const r=await api(`/fulfillment/cases/${c.id}/fitting`,{device_product_id:1,initial_advancement:4,start_date:'2026-11-05',next_adjust_date:'2026-11-19'});assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal((await db.get('SELECT device_product_id FROM patient_devices WHERE id=?',[r.body.data.patient_device_id])).device_product_id,1);
   await db.run("UPDATE products SET category='device' WHERE id=1");await db.run("UPDATE products SET category='service' WHERE id=2");
  });
  await t.test('manual device case accepts missing technician; refunded order is rejected',async()=>{
   const id=await bill(1,{pay_method:'wechat',payment_confirmed:false});await db.run("UPDATE orders SET status='paid',pay_at=NOW() WHERE id=?",[id]);
   const manual=await api('/fulfillment/cases',{order_id:id,patient_id:1,store_id:1});assert.equal(manual.status,200);assert.equal((await cases(id))[0].status,'pending_assignment');
   const refunded=await bill(1,{pay_method:'wechat',payment_confirmed:false});await db.run("UPDATE orders SET status='refunded' WHERE id=?",[refunded]);assert.equal(await db.transaction(conn=>createPaidFulfillment(conn,{id:refunded})),null);assert.equal((await api('/fulfillment/cases',{order_id:refunded,patient_id:1,store_id:1})).status,409);
  });
  await t.test('mall order also snapshots category but does not guess a patient/actor for fulfillment',async()=>{
   const r=await fetch(base+'/api/v1/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:1,openid:'DEVICE-ENTRY'},JWT_SECRET,{expiresIn:'5m'})},body:JSON.stringify({items:[{productId:1,quantity:1}],shippingAddress:{deliveryMethod:'pickup',storeId:1,contactName:'Fixture',phone:'13800000000'}})});
   const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));
   const id=Number(result.data.id);assert.equal((await db.get('SELECT product_category_snapshot FROM order_items WHERE order_id=?',[id])).product_category_snapshot,'device');
   await db.run("UPDATE orders SET status='paid',pay_at=NOW() WHERE id=?",[id]);assert.equal(await db.transaction(conn=>createPaidFulfillment(conn,{id})),null);
  });
  await t.test('schema rerun fills missing legacy snapshots and preserves existing ones',async()=>{
   await db.run("UPDATE products SET category='accessory' WHERE id=1");
   await db.run("UPDATE order_items SET product_category_snapshot=NULL WHERE order_id<>? AND product_id=1 LIMIT 1",[unassigned]);
   await db.closePool();await db.initDB();
   assert.equal((await db.get("SELECT COUNT(*) n FROM order_items WHERE product_category_snapshot='accessory'")).n,1);
   assert.equal((await db.get('SELECT product_category_snapshot FROM order_items WHERE order_id=?',[unassigned])).product_category_snapshot,'device');
   await db.run("UPDATE products SET category='device' WHERE id=1");
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db?.closePool();await control.query(`DROP DATABASE ${schema}`);await control.end()}
});
