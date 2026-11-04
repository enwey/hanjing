import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../hanjing-clinic-backend/package.json',import.meta.url));
const mysql=require('mysql2/promise'),express=require('express'),jwt=require('jsonwebtoken');
const source=process.env.DB_NAME||'hanjing_clinic',schema='hanjing_promoter_scope_'+Date.now();
assert.match(source,/^[a-zA-Z0-9_]+$/);
const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD});
let db,server;
try {
 await conn.query('CREATE DATABASE '+schema);
 const [tables]=await conn.query('SHOW TABLES FROM '+source);
 for(const row of tables){const name=Object.values(row)[0];assert.match(name,/^[a-zA-Z0-9_]+$/);await conn.query(`CREATE TABLE ${schema}.${name} LIKE ${source}.${name}`);}
 process.env.DB_NAME=schema;await conn.query('USE '+schema);
 db=await import('../../hanjing-clinic-backend/db.js');
 const {hashPassword,JWT_SECRET}=await import('../../hanjing-clinic-backend/helpers.js');
 const {default:router}=await import('../../hanjing-clinic-backend/routes/backend-promoter.js');
 await conn.query("INSERT INTO distributors(id,nickname,invite_code,source_type) VALUES(1,'A','A','backend'),(2,'B','B','backend')");
 await conn.query("INSERT INTO promoter_accounts(distributor_id,login_name,password_hash) VALUES(1,'scope-a',?),(2,'scope-b',?)",[hashPassword('test-pass'),hashPassword('test-pass')]);
 await conn.query("INSERT INTO users(id,openid,nickname) VALUES(1,'scope-family','Family')");
 await conn.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'Shared','self','P1'),(2,1,'Other family','father','P2'),(3,1,'No visit','mother','P3')");
 await conn.query("INSERT INTO distribution_relationships(parent_distributor_id,child_user_id,level) VALUES(1,1,1)");
 await conn.query("INSERT INTO stores(id,name,code,address) VALUES(1,'A','A','A')");
 await conn.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'D','D','D')");
 await conn.query("INSERT INTO appointments(id,appointment_no,user_id,patient_id,doctor_id,store_id,schedule_id,appointment_date,appointment_time,status,referral_promoter_id,ess_assessment_id,snore_assessment_id) VALUES(1,'A1',1,1,1,1,1,CURDATE(),'09:00','completed',1,1,1),(2,'B1',1,1,1,1,1,CURDATE(),'10:00','completed',2,2,2),(3,'B2',1,2,1,1,1,CURDATE(),'11:00','completed',2,3,3)");
 await conn.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,appointment_id,visit_date,diagnosis) VALUES(1,1,1,1,1,CURDATE(),'Visible A'),(2,1,1,1,2,CURDATE(),'Visible B'),(3,2,1,1,3,CURDATE(),'Other family'),(4,1,1,1,NULL,CURDATE(),'Unlinked')");
 await conn.query("INSERT INTO patient_devices(id,patient_id,bind_medical_record_id,bind_doctor_id,device_model,bound_at) VALUES(1,1,1,1,'A',CURDATE()),(2,1,2,1,'B',CURDATE()),(3,1,NULL,1,'Unlinked',CURDATE())");
 await conn.query("INSERT INTO wearing_logs(patient_id,patient_device_id,date,wear_duration,source) VALUES(1,1,CURDATE(),4,'mini_program_checkin'),(1,2,CURDATE(),8,'mini_program_checkin')");
 for(let i=1;i<=4;i++){
  await conn.query("INSERT INTO ess_assessments(id,user_id,patient_id,total_score,risk_level,answers) VALUES(?,1,?,?,'low','[]')",[i,i===3?2:1,i]);
  await conn.query("INSERT INTO snore_assessments(id,user_id,patient_id,file_url,duration,avg_decibel,peak_decibel,snore_rate,apnea_events) VALUES(?,1,?,'',10,40,60,10,0)",[i,i===3?2:1]);
 }
 for(const [id,appt,patient] of [[1,1,null],[2,2,null],[3,3,null],[4,null,1],[5,null,2],[6,null,null]]) {
  await conn.query("INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,pay_at,status,appointment_id,cashier_context) VALUES(?,?,1,?,?,NOW(),'paid',?,?)",[id,'O'+id,id*100,id*100,appt,patient?JSON.stringify({patient_id:patient}):null]);
 }
 await conn.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount) VALUES(4,1,'Shared',400,40),(5,1,'Other family',500,50),(6,1,'Account only',600,60)");
 const app=express();app.use(express.json());app.use(router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/promoter';
 async function api(path,promoter=1){const response=await fetch(base+path,{headers:{Authorization:'Bearer '+jwt.sign({scope:'promoter',promoter_id:promoter,token_version:0},JWT_SECRET)}});return {status:response.status,body:await response.json()};}
 const ids=rows=>rows.map(r=>Number(r.id)).sort((a,b)=>a-b);
 let r=await api('/patients/1');assert.equal(r.status,200,JSON.stringify(r.body));let d=r.body.data;
 assert.deepEqual(ids(d.appointments),[1]);assert.deepEqual(ids(d.medical_records),[1]);assert.equal(d.latest_medical_record.id,1);
 assert.equal(d.active_treatment.id,1);assert.equal(d.active_treatment.logs.length,1);assert.equal(Number(d.sleep_diagnostics.wearing.avg_duration),4);
 assert.equal(d.sleep_diagnostics.ess.id,1);assert.equal(d.sleep_diagnostics.snore.id,1);
 assert.deepEqual(ids(d.orders),[1,4]);assert.equal(d.total_spent,500);assert.deepEqual(ids(d.family_members),[1]);
 assert.equal(d.family_members[0].ess,undefined);
 console.log('PASS A sees only its visits, clinical records, assessments, device logs and attributable orders');
 r=await api('/patients/1',2);assert.equal(r.status,200);d=r.body.data;
 assert.deepEqual(ids(d.appointments),[2]);assert.deepEqual(ids(d.medical_records),[2]);assert.deepEqual(ids(d.orders),[2]);assert.equal(d.total_spent,200);
 assert.equal(d.active_treatment.id,2);assert.equal(d.sleep_diagnostics.ess.id,2);assert.deepEqual(ids(d.family_members),[1,2]);
 console.log('PASS B shares same patient without accessing A records');
 for(const id of [2,3,999])assert.equal((await api('/patients/'+id)).status,404);
 assert.equal((await api('/patients/0')).status,400);
 assert.deepEqual((await api('/patients')).body.data.list.map(r=>Number(r.patient_id)),[1]);
 assert.deepEqual(ids((await api('/patients/1?promoter_id=2')).body.data.appointments),[1]);
 console.log('PASS list/detail access agrees; account referral, family IDs and supplied promoter ID cannot bypass');
 await conn.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount) VALUES(2,1,'Shared',200,20)");
 d=(await api('/patients/1')).body.data;
 assert.deepEqual(ids(d.orders),[1,2,4]);assert.equal(d.total_spent,700);
 assert.deepEqual(ids(d.medical_records),[1]);assert.deepEqual(ids(d.appointments),[1]);
 console.log('PASS own commission grants only attributable order, not another promoter clinical history');
 await conn.query('UPDATE appointments SET ess_assessment_id=NULL,snore_assessment_id=NULL WHERE id=1');
 d=(await api('/patients/1')).body.data;assert.equal(d.sleep_diagnostics.ess,null);assert.equal(d.sleep_diagnostics.snore,null);
 await conn.query('UPDATE appointments SET referral_promoter_id=2 WHERE id=1');
 assert.equal((await api('/patients/1')).status,404);
 console.log('PASS no fallback to account/latest assessment; revoked referral immediately denies detail');
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 if(db)await db.closePool();
 await conn.query('DROP DATABASE IF EXISTS '+schema);await conn.end();
}
