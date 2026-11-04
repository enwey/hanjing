import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';

test('fitting synchronizes treatment, patient device and follow-up atomically',{timeout:120000},async t=>{
 const schema='hanjing_test_fitting_'+Date.now();
 const admin=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD||'root'});
 let db;
 try {
  await admin.query(`CREATE DATABASE ${schema}`);await admin.query(`USE ${schema}`);
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_NAME:schema,DB_USER:'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root'});
  db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
  const {completeFittingTreatment}=await import('../../hanjing-clinic-backend/fulfillment-treatment.js');
  const {readFulfillmentClinical}=await import('../../hanjing-clinic-backend/fulfillment-clinical.js');
  await admin.query("INSERT INTO users(id,openid,nickname) VALUES(1,'FIT-TEST','Fixture')");
  await admin.query("INSERT INTO patients(id,user_id,name,relation) VALUES(1,1,'Fixture','self')");
  await admin.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'Doctor','Title','Sleep')");
  await admin.query("INSERT INTO stores(id,name,code,address) VALUES(1,'Clinic','FIT','Address')");
  await admin.query("INSERT INTO roles(id,name,code) VALUES(999,'Fixture','fixture_fitting')");
  await admin.query("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(999,'fixture-fitting','unused','Tech',999)");
  await admin.query("INSERT INTO products(id,name,category,image_url,price,status) VALUES(1,'Device','device','/fixture',100,'off'),(2,'Other','device','/fixture',200,'on')");
  let sequence=0;
  const payload={device_product_id:1,initial_advancement:0,start_date:'2026-11-05',next_adjust_date:'2026-11-19'};
  async function fixture(){const id=++sequence;
   await admin.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,visit_date,diagnosis) VALUES(?,1,1,1,'2026-11-01','Fixture')",[id]);
   await admin.query("INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,status) VALUES(?,?,1,100,100,'paid')",[id,'FIT-'+id]);
   await admin.query("INSERT INTO order_items(order_id,product_id,product_name,price) VALUES(?,1,'Purchased device',100)",[id]);
   await admin.query("INSERT INTO fulfillment_cases(id,order_id,patient_id,store_id,technician_id,created_by,medical_record_id,status) VALUES(?,?,1,1,999,999,?,'ready_for_fitting')",[id,id,id]);return id;
  }
  const fit=(id,body=payload)=>db.transaction(conn=>completeFittingTreatment(conn,id,body,999));
  await t.test('first fitting binds purchased device and synchronizes zero advancement/dates/history',async()=>{
   const id=await fixture(), result=await fit(id);
   const [[tr]]=await admin.query('SELECT * FROM treatment_records WHERE id=?',[result.treatment_id]);
   const [[pd]]=await admin.query('SELECT * FROM patient_devices WHERE id=?',[result.patient_device_id]);
   assert.equal(Number(tr.initial_advancement),0);assert.equal(Number(pd.current_advancement),0);
   assert.equal(tr.patient_device_id,pd.id);assert.equal(pd.bind_treatment_record_id,tr.id);assert.equal(pd.device_name_snapshot,'Purchased device');
   assert.equal(String(tr.next_adjust_date).slice(0,10),String(pd.next_adjust_date).slice(0,10));
   assert.equal((await admin.query('SELECT * FROM follow_up_tasks'))[0].length,1);
   assert.equal((await admin.query('SELECT * FROM treatment_timelines'))[0].length,1);
   const [[c]]=await admin.query('SELECT * FROM fulfillment_cases WHERE id=?',[id]);assert.equal(c.status,'fitted');
   const clinical=await readFulfillmentClinical(c);assert.equal(clinical.treatments[0].patient_device.id,pd.id);
   await assert.rejects(()=>fit(id),e=>e.statusCode===409);
   assert.equal((await admin.query('SELECT * FROM fulfillment_fittings WHERE fulfillment_case_id=?',[id]))[0].length,1);
  });
  await t.test('legacy unadjusted treatment is reused without duplicate patient device',async()=>{
   const id=await fixture();
   const [tr]=await admin.query("INSERT INTO treatment_records(patient_id,doctor_id,medical_record_id,device_product_id,device_model,initial_advancement,start_date) VALUES(1,1,?,1,'Legacy',4,'2026-11-01')",[id]);
   const [pd]=await admin.query("INSERT INTO patient_devices(patient_id,bind_treatment_record_id,bind_medical_record_id,device_product_id,device_model,bound_at) VALUES(1,?,?,1,'Legacy','2026-11-01')",[tr.insertId,id]);
   await admin.query('UPDATE treatment_records SET patient_device_id=? WHERE id=?',[pd.insertId,tr.insertId]);
   const result=await fit(id,{...payload,initial_advancement:5,next_adjust_date:''});
   assert.equal(result.treatment_id,tr.insertId);assert.equal(result.patient_device_id,pd.insertId);
   const [[device]]=await admin.query('SELECT * FROM patient_devices WHERE id=?',[pd.insertId]);assert.equal(Number(device.initial_advancement),5);assert.equal(device.next_adjust_date,null);
   assert.equal((await admin.query('SELECT * FROM treatment_records WHERE medical_record_id=?',[id]))[0].length,1);
  });
  await t.test('invalid dates/amounts and another order product cannot create a device',async()=>{
   const id=await fixture();
   for(const patch of [{device_product_id:2},{initial_advancement:''},{initial_advancement:-1},{initial_advancement:16},{start_date:'2026-02-30'},{next_adjust_date:'2026-01-01'}])await assert.rejects(()=>fit(id,{...payload,...patch}),e=>e.statusCode===400);
   assert.equal((await admin.query('SELECT * FROM treatment_records WHERE medical_record_id=?',[id]))[0].length,0);
  });
  await t.test('unpaid/refunded orders and missing medical record are rejected',async()=>{
   const id=await fixture();await admin.query("UPDATE orders SET status='refunded' WHERE id=?",[id]);await assert.rejects(()=>fit(id),e=>e.statusCode===409);
   await admin.query("UPDATE orders SET status='paid' WHERE id=?",[id]);await admin.query('UPDATE fulfillment_cases SET medical_record_id=NULL,store_id=NULL WHERE id=?',[id]);await assert.rejects(()=>fit(id),e=>e.statusCode===400);
  });
  await t.test('failure late in the transaction rolls back all linked changes',async()=>{
   const id=await fixture();const [[before]]=await admin.query("SELECT COUNT(*) AS n FROM patient_devices WHERE status='active'");
   await admin.query(`CREATE TRIGGER fitting_failure BEFORE INSERT ON fulfillment_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'`);
   await assert.rejects(()=>fit(id),/fixture failure/);await admin.query('DROP TRIGGER fitting_failure');
   assert.equal((await admin.query('SELECT * FROM treatment_records WHERE medical_record_id=?',[id]))[0].length,0);
   assert.equal((await admin.query('SELECT status FROM fulfillment_cases WHERE id=?',[id]))[0][0].status,'ready_for_fitting');
   assert.equal((await admin.query("SELECT COUNT(*) AS n FROM patient_devices WHERE status='active'"))[0][0].n,before.n);
  });
  await t.test('concurrent completion only creates one fitting',async()=>{
   const id=await fixture();const results=await Promise.allSettled([fit(id),fit(id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await admin.query('SELECT * FROM treatment_records WHERE medical_record_id=?',[id]))[0].length,1);
   assert.equal((await admin.query('SELECT * FROM fulfillment_fittings WHERE fulfillment_case_id=?',[id]))[0].length,1);
  });
 }finally{await db?.closePool();await admin.query(`DROP DATABASE ${schema}`);await admin.end()}
});

test('consultation endpoint rejects legacy initial creation before writing records',async()=>{
 const source=readFileSync(new URL('../../hanjing-clinic-backend/routes/admin.js',import.meta.url),'utf8');
 const start=source.indexOf("app.post('/api/admin/appointments/:id/complete-consultation'");
 const end=source.indexOf("\n});",start)+5;
 let handler,status,body;
 vm.runInNewContext(source.slice(start,end),{app:{post:(path,auth,fn)=>handler=fn},authenticateToken(){}});
 const res={status:code=>{status=code;return res},json:value=>body=value};
 await handler({params:{id:'1'},body:{medical_record:{diagnosis:'Fixture'},treatment:{create:true}}},res);
 assert.equal(status,400);assert.match(body.message,/交付管理/);
});
