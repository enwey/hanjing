import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../hanjing-clinic-backend/package.json',import.meta.url));
const mysql=require('mysql2/promise'),express=require('express'),jwt=require('jsonwebtoken');
const source=process.env.DB_NAME||'hanjing_clinic';
const schema='hanjing_scope_test_'+Date.now();
assert.match(source,/^[a-zA-Z0-9_]+$/);
const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD});
let server,db;
try {
 await conn.query('CREATE DATABASE '+schema);
 const [tables]=await conn.query('SHOW TABLES FROM '+source);
 for(const row of tables){const name=Object.values(row)[0];assert.match(name,/^[a-zA-Z0-9_]+$/);await conn.query(`CREATE TABLE ${schema}.${name} LIKE ${source}.${name}`);}
 process.env.DB_NAME=schema;
 await conn.query('USE '+schema);await conn.query("SET time_zone='+08:00'");
 db=await import('../../hanjing-clinic-backend/db.js');
 await db.migrateRoleMemberDataScopes();
 const {hashPassword,JWT_SECRET}=await import('../../hanjing-clinic-backend/helpers.js');
 const {default:router}=await import('../../hanjing-clinic-backend/routes/admin.js');
 const self={type:'self',all_stores:false,store_ids:[]},system={...self,type:'system'};
 await conn.query("INSERT INTO roles(id,name,code,status,data_scope) VALUES(1,'Scope Admin','super_admin','active',?),(2,'Scope Doctor','doctor','active',?)",[JSON.stringify(system),JSON.stringify(self)]);
 await conn.query("INSERT INTO stores(id,name,code,address) VALUES(1,'A','A','A'),(2,'B','B','B')");
 await conn.query("INSERT INTO doctors(id,name,title,specialty,rating,consult_fee) VALUES(1,'One','Doctor','Sleep',5,0),(2,'Two','Doctor','Sleep',5,0)");
 await conn.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,doctor_id,status) VALUES(1,'scope-admin',?,'Admin',1,NULL,'online'),(2,'scope-doctor',?,'Doctor',2,1,'online')",[hashPassword('test-password'),hashPassword('test-password')]);
 await conn.query("INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(2,1)");
 for(const permission of ['appointment:view','patient:view','medical_record:view','order:view','schedule:view','store:view'])await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[permission]);
 await conn.query("INSERT INTO users(id,openid,nickname) VALUES(1,'scope-user','Fixture')");
 await conn.query("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(1,1,'P1','self','S1'),(2,1,'P2','father','S2')");
 await conn.query("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(1,'SA1',1,1,1,1,1,CURDATE(),'09:00-09:30','pending'),(2,'SA2',1,1,2,1,2,CURDATE(),'10:00-10:30','pending'),(3,'SA3',1,2,2,2,2,CURDATE(),'11:00-11:30','pending')");
 await conn.query("INSERT INTO orders(id,order_no,user_id,total_amount,pay_amount,pay_at,status,appointment_id,shipping_address) VALUES(1,'SO1',1,100,100,NOW(),'paid',1,NULL),(2,'SO2',1,200,200,NOW(),'paid',2,NULL),(3,'SO3',1,400,400,NOW(),'paid',3,NULL),(4,'SO4',1,800,800,NOW(),'paid',NULL,NULL)");
 const app=express();app.use(express.json());app.use(router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const token=id=>jwt.sign({id,role:id===1?'super_admin':'doctor',token_version:0},JWT_SECRET);
 async function api(path,id=2,body,method=body?'PUT':'GET') {const response=await fetch(base+'/api/admin/'+path,{method,headers:{Authorization:'Bearer '+token(id),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};}
 const adminBody={name:'Doctor',phone:'',role_id:2,store_ids:[1],all_stores:false,doctor_id:1,status:'online'};
 async function verify(expectedIds,revenue){
  const result=await api('appointments');assert.equal(result.status,200);assert.deepEqual(result.body.data.map(x=>Number(x.id)).sort(),expectedIds);
  const stats=await api('dashboard/stats?range=today');assert.equal(stats.status,200,JSON.stringify(stats.body));assert.equal(stats.body.data.totalAppointments,expectedIds.length);assert.equal(stats.body.data.totalRevenue,revenue);
  const report=await api('reports/store?year='+new Date().getFullYear());assert.equal(report.status,200,JSON.stringify(report.body));assert.equal(report.body.data.months.reduce((sum,m)=>sum+m.net,0),revenue);
  const orders=await api('orders');assert.equal(orders.status,200);assert.equal(orders.body.data.reduce((sum,o)=>sum+Number(o.pay_amount),0),revenue);
  const patients=await api('patients');assert.equal(patients.status,200,JSON.stringify(patients.body));
  const details=await api('patients/1');assert.equal(details.status,200,JSON.stringify(details.body));assert.equal(details.body.data.total_spent,revenue);
  const patientOrders=await api('patients/1/orders');assert.equal(patientOrders.status,200);assert.equal(patientOrders.body.data.reduce((sum,o)=>sum+Number(o.pay_amount),0),revenue);
  const notifications=await api('notifications/stats');assert.equal(notifications.status,200);assert.equal(notifications.body.data.appointmentCount,expectedIds.length);
  const lists=await api('dashboard/lists');assert.equal(lists.status,200);assert.deepEqual(lists.body.data.appointments.map(x=>Number(x.id)).sort(),expectedIds);
 }
 await verify([1,2],300);console.log('PASS inherited personal scope crosses operational stores');
 assert.equal((await api('appointments/3')).status,404);
 assert.equal((await api('patients/2')).status,403);
 assert.equal((await api('appointments/2')).status,200);
 const roleStore={type:'store',all_stores:false,store_ids:[2]};
 assert.equal((await api('roles/2',1,{data_scope:roleStore})).status,200);
 await verify([2,3],600);console.log('PASS role store change immediately applies to inheriting account');
 assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:self}]})).status,200);
 await verify([1,2],300);
 assert.equal((await api('roles/2',1,{data_scope:system})).status,200);
 await verify([1,2],300);console.log('PASS current-role member override wins over system role');
 assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:null}]})).status,200);
 await verify([1,2,3],1500);console.log('PASS restore inheritance to system includes unassigned-store orders');
 const allStores={type:'store',all_stores:true,store_ids:[]};
 assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:allStores}]})).status,200);
 await verify([1,2,3],700);console.log('PASS all stores differs from system: no storeless order');
 await conn.query("INSERT INTO stores(id,name,code,address) VALUES(3,'C','C','C')");
 const me=await api('me');assert.equal(me.body.data.effective_data_scope.all_stores,true);
 const {attachDataScope}=await import('../../hanjing-clinic-backend/data-scope.js');assert.deepEqual((await attachDataScope({id:2,role_id:2,role_data_scope:system})).data_store_ids.sort(),[1,2,3]);
 for(const bad of [{type:'bad'},{type:'store',all_stores:false,store_ids:[]},{type:'store',all_stores:false,store_ids:[999]}])assert.equal((await api('roles/2',1,{data_scope:bad})).status,400);
 assert.equal((await api('roles/2',2,{data_scope:system})).status,403);console.log('PASS validation, new stores, unauthorized configuration');
 assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:self}]})).status,200);
 await conn.query("INSERT INTO audit_logs(admin_id,action,target_type,target_id,status) VALUES(2,'create_appointment','appointment',3,'success'),(2,'create_cashier_order','order',4,'success')");
 await verify([1,2,3],1500);console.log('PASS personally created appointments and orders included');
 const newRole=await api('roles',1,{name:'Default Personal',code:'scope_default',permissions:[]},'POST');assert.equal(newRole.status,200);
 const roles=await api('roles',1);assert.equal(roles.body.data.find(r=>r.id===newRole.body.data.id).data_scope.type,'self');
 const newUser=await api('users',1,{username:'scope-new',name:'New',role_id:newRole.body.data.id,password:'test-password',store_ids:[]},'POST');assert.equal(newUser.status,200,JSON.stringify(newUser.body));
 const [newRows]=await conn.query('SELECT data_scope FROM admin_users WHERE id=?',[newUser.body.data.id]);assert.equal(newRows[0].data_scope,null);
 console.log('PASS new role defaults personal; new user inherits without store assignment');
 const {verifyRoleMemberScopes}=await import('./role-member-scope.integration.mjs');
 await verifyRoleMemberScopes({conn,api,db,self,system,adminBody});
 const {verifyPermissionDependencies}=await import('./permission-dependencies.integration.mjs');
 await verifyPermissionDependencies({conn,api,self,system});
 const {verifyAllPages}=await import('./data-scope-all-pages.integration.mjs');
 await verifyAllPages({conn,api,adminBody,self,system});
 if(process.env.TEST_ROLE_MEMBER_LAYOUT==='1'){const {verifyRoleMemberLayout}=await import('./role-member-layout.browser.mjs');await verifyRoleMemberLayout({conn,api});}
 if(process.env.TEST_PERMISSION_PAGES==='1'){const {verifyPermissionPages}=await import('./permission-page-fixtures.mjs');await verifyPermissionPages({conn,api});}
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 if(db)await db.closePool();
 await conn.query('DROP DATABASE IF EXISTS '+schema);await conn.end();
}
