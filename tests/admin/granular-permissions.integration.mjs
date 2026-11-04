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

 const {permissionCatalog, migratePermissionCodes, migrateAdminPermissions}=await import('../../hanjing-clinic-backend/permission-migration.js');
 const {requiredAdminPermissions:required,hasAdminPermission:allowed}=await import('../../hanjing-clinic-backend/admin-permissions.js');
 const known=new Set(permissionCatalog.flatMap(g=>g.actions.map(a=>a.code)));
 assert.equal(permissionCatalog.filter(g=>g.path).length,26);
 assert.equal(known.size,permissionCatalog.flatMap(g=>g.actions).length);
 let routeCount=0;
 for(const layer of (router._router?.stack || router.stack || [])) {
   const route=layer.route;
   if(!route)continue;
   for(const path of Array.isArray(route.path)?route.path:[route.path]) {
     if(!String(path).startsWith('/api/admin/') || ['/api/admin/login','/api/admin/send-code','/api/admin/sms-login'].includes(path))continue;
     if(/settings\/(reset-test-data|initialize-demo-data)$/.test(path) || /orders\/[^/]+\/invoice$/.test(path)) { assert.equal(required('POST',path),null); continue; }
     for(const method of Object.keys(route.methods)) {
       const rule=required(method.toUpperCase(),path,{body:{}});
       assert.notEqual(rule,null,method+' '+path+' missing policy');
       for(const code of Array.isArray(rule)?rule:[...(rule.all||[]),...(rule.any||[])])assert(known.has(code),'unknown catalog code '+code+' '+path);
       routeCount++;
     }
   }
 }
 assert(routeCount>100);console.log('PASS '+routeCount+' authenticated routes mapped to catalog');

 async function grants(...codes){await conn.query('DELETE FROM permissions WHERE role_id=2');for(const code of codes)await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[code]);}
 let checks=0;
 const cases=[
 ['GET','dashboard/stats',{},'dashboard:view'],['GET','patients/1/phone',{},'patient:phone:view'],
 ['POST','schedules/batch',{},'schedule:edit'],['POST','schedules/copy-last-month',{},'schedule:copy'],
 ['POST','orders',{},'order:add'],['POST','orders/1/ship',{},'order:ship'],['POST','orders/1/offline-refund',{},'order:refund'],
 ['POST','appointments/1/charges',{},'appointment:charge'],['POST','appointments/1/charges/1/refund',{},'appointment:refund'],
 ['PUT','appointments/1',{status:'cancelled'},'appointment:cancel'],['PUT','appointments/1',{time:'10:00-10:30'},'appointment:reschedule'],
 ['PUT','appointments/1',{status:'called'},'queue:call'],['PUT','appointments/1',{status:'confirmed'},'appointment:checkin'],
 ['PUT','appointments/1',{status:'checked_in'},'workbench:receive'],
 ['PUT','content/articles/1',{status:'approved'},'content:audit'],['POST','products',{},'product:add'],['DELETE','products/1',{},'product:delete'],
 ['PUT','products/1',{status:'on'},'product:status'],['PUT','products/1',{is_distribution:1},'product:promotion'],
 ['PUT','distribution/promoters/1/password',{},'promoter:password'],['GET','distribution/promoters/1/qr',{},'promoter:qr'],
 ['POST','fulfillment/cases/1/mold',{},'fulfillment:mold'],['POST','fulfillment/batches/1/ship',{},'fulfillment:ship'],
 ['PUT','after-sales-tickets/1',{},'after_sales:edit'],['POST','content/banners',{},'banner:add'],['POST','content/live-rooms/1/sync-wechat',{},'live:sync'],
 ['GET','settings',{},'settings:view'],['GET','database/schema',{},'database:view'],['GET','mini-program-logs',{},'mini_log:view'],
 ];
 for(const [method,path,body,code] of cases){const policy=required(method,'/api/admin/'+path,{body});assert(known.has(code),code);assert(allowed({permissions:[code]},policy),path);assert(!allowed({permissions:[]},policy),path);checks++;}
 assert(!allowed({permissions:['content:edit']},required('PUT','/api/admin/content/articles/1',{body:{status:'approved'}})));
 assert(!allowed({permissions:['content:add']},required('POST','/api/admin/content/articles',{body:{status:'approved'}})));
 assert(!allowed({permissions:['product:status']},required('PUT','/api/admin/products/1',{body:{status:'on',price:100}})));
 assert(!allowed({permissions:['appointment:view']},required('GET','/api/admin/appointments',{query:{is_export:1}})));
 console.log('PASS '+checks+' operation policy mappings and combined action denial');
 const reads=[['appointment:view','appointments'],['queue:view','appointments'],['workbench:view','appointments'],['patient:view','patients'],['doctor:view','doctors'],['store:view','stores'],['order:view','orders'],['fulfillment:view','fulfillment/cases'],['after_sales:view','after-sales-tickets'],['distribution:view','distribution/overview'],['promoter:view','distribution/promoters'],['withdraw:view','distribution/withdraws'],['product:view','products'],['product_category:view','product-categories'],['content:view','content/articles'],['content_category:view','content/categories'],['live:view','content/live-rooms'],['banner:view','content/banners'],['settings:view','settings'],['wechat_notification:view','settings/wechat-notifications'],['member:view','users'],['role:view','roles'],['audit_log:view','logs'],['mini_log:view','mini-program-logs'],['database:view','database/schema'],['dashboard:view','dashboard/stats']];
 for(const [code,path] of reads){await grants(code);const result=await api(path);assert.equal(result.status,200,code+' '+JSON.stringify(result.body));await grants();assert.equal((await api(path)).status,403,path);}
 console.log('PASS 26 menu HTTP grants and revocations');
 await grants('patient:view');assert.equal((await api('patients/1/phone')).status,403);
 await grants('patient:phone:view');assert.equal((await api('patients/1/phone')).status,200);
 await grants('content:add');const draft=await api('content/articles',2,{title:'权限隔离草稿',content:'正文',status:'draft'},'POST');assert.equal(draft.status,200,JSON.stringify(draft.body));
 const id=draft.body.data.id;
 await grants('content:edit');assert.equal((await api('content/articles/'+id,2,{status:'approved'})).status,403);
 await grants('content:audit');assert.equal((await api('content/articles/'+id,2,{status:'approved'})).status,200);
 assert.equal((await api('content/articles/'+id,2,{title:'非法修改',status:'rejected'})).status,403);
 await grants('content:delete');assert.equal((await api('content/articles/'+id,2,undefined,'DELETE')).status,200);

 await conn.query("INSERT INTO product_categories(id,code,name) VALUES(1,'accessory','配件')");
 await conn.query("INSERT INTO products(id,name,category,image_url,price,status,is_distribution) VALUES(1,'权限测试商品','accessory','',100,'off',0)");
 await grants('product:edit');assert.equal((await api('products/1',2,{status:'on'})).status,403);
 await grants('product:status');assert.equal((await api('products/1',2,{status:'on'})).status,200);
 assert.equal((await api('products/1',2,{price:200})).status,403);
 await grants('product:promotion');assert.equal((await api('products/1',2,{is_distribution:1})).status,200);
 await grants('product:edit');assert.equal((await api('products/1',2,{price:200,status:'on',is_distribution:1})).status,200);
 await grants('order:add');assert.equal((await api('orders',2,{pay_method:'cash',payment_confirmed:true},'POST')).status,403);
 console.log('PASS article draft/approval/delete, phone, product status/promotion/edit and cash collection isolation');

 await grants('role:edit','role:assign','role:scope','role:members','member:edit','member:assign');
 assert.equal((await api('roles/1',2,{name:'forbidden'})).status,403);
 assert.equal((await api('roles/2',2,{permissions:['database:query']})).status,403);
 assert.equal((await api('roles/2',2,{data_scope:system})).status,403);
 assert.equal((await api('users/1',2,{name:'forbidden'})).status,403);
 console.log('PASS delegated administration cannot elevate permissions or scope or edit super-admin');
 const migrated=migratePermissionCodes(['appointment:view','appointment:edit','distribution:edit','distribution:view','content:edit','content:view'],'custom');
 assert(migrated.includes('queue:view'));assert(migrated.includes('product:status'));assert(!migrated.includes('appointment:refund'));assert(!migrated.includes('settings:edit'));
 await migrateAdminPermissions(db.query,db.transaction);await grants('patient:view');await migrateAdminPermissions(db.query,db.transaction);
 const [preserved]=await conn.query('SELECT permission_resource FROM permissions WHERE role_id=2');assert.deepEqual(preserved.map(x=>x.permission_resource),['patient:view']);
 console.log('PASS one-time permission migration does not restore revoked permissions');
 if(process.env.TEST_GRANULAR_UI==='1') { const {verifyRoleMemberLayout}=await import('./role-member-layout.browser.mjs'); await verifyRoleMemberLayout({conn,api}); }
 if(process.env.TEST_GRANULAR_UI==='1'){const {verifyGranularPages}=await import('./granular-permission-pages.browser.mjs');await verifyGranularPages({conn,api});}
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 if(db)await db.closePool();
 await conn.query('DROP DATABASE IF EXISTS '+schema);await conn.end();
}
