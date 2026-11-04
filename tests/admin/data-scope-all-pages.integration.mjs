import assert from 'node:assert/strict';

// Called inside the isolated schema / HTTP server owned by the scope integration
// runner. No rows are written to the developer's business database.
export async function verifyAllPages({conn,api,adminBody,self,system}) {
  await conn.query("DELETE FROM audit_logs WHERE action IN ('create_appointment','create_cashier_order')");
  for(const permission of ['doctor:view','distribution:view','audit_log:view','system:view','content:view'])await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[permission]);
  await conn.query('INSERT INTO doctor_store_mapping(doctor_id,store_id) VALUES(1,1),(1,2),(2,2)');
  await conn.query("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(1,1,1,CURDATE(),'morning','09:00','12:00'),(2,1,2,CURDATE(),'morning','09:00','12:00'),(3,2,2,CURDATE(),'morning','09:00','12:00')");
  await conn.query("INSERT INTO medical_records(id,patient_id,doctor_id,store_id,appointment_id,visit_date,diagnosis,attachments) VALUES(1,1,1,1,1,CURDATE(),'A',JSON_ARRAY('/uploads/medical-attachments/a.pdf')),(2,1,1,2,2,CURDATE(),'B',JSON_ARRAY('/uploads/medical-attachments/b.pdf')),(3,1,2,2,NULL,CURDATE(),'C',JSON_ARRAY('/uploads/medical-attachments/c.pdf'))");
  await conn.query("INSERT INTO treatment_records(id,patient_id,doctor_id,medical_record_id,device_model,start_date) VALUES(1,1,1,1,'A',CURDATE()),(2,1,1,2,'B',CURDATE()),(3,1,2,3,'C',CURDATE())");
  await conn.query("INSERT INTO patient_devices(id,patient_id,bind_doctor_id,bind_medical_record_id,device_model,bound_at) VALUES(1,1,1,1,'A',CURDATE()),(2,1,1,2,'B',CURDATE()),(3,1,2,3,'C',CURDATE())");
  await conn.query("INSERT INTO follow_up_tasks(id,patient_id,follower_id,title,due_date) VALUES(1,1,2,'Mine',CURDATE()),(2,1,1,'Other',CURDATE())");
  await conn.query("INSERT INTO patient_crm_records(id,patient_id,follower_id,content,stage) VALUES(1,1,2,'Mine','new'),(2,1,1,'Other','new')");
  await conn.query("INSERT INTO fulfillment_cases(id,order_id,patient_id,store_id,created_by,medical_record_id) VALUES(1,1,1,1,1,1),(2,2,1,2,1,2),(3,3,2,2,1,NULL)");
  await conn.query("INSERT INTO after_sales_tickets(id,fulfillment_case_id,patient_id,created_by,issue_type,description) VALUES(1,1,1,1,'test','A'),(2,2,1,1,'test','B'),(3,3,2,1,'test','C')");
  await conn.query("INSERT INTO distributors(id,user_id,nickname,invite_code,total_commission,available_commission,created_by) VALUES(1,NULL,'Mixed','MIX',30,30,1),(2,NULL,'Outside','OUT',40,40,1)");
  await conn.query("INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,status) VALUES(1,1,'P1',100,10,'settled'),(2,1,'P1',200,20,'settled'),(3,2,'P2',400,40,'settled')");
  await conn.query("INSERT INTO withdraw_records(id,user_id,distributor_id,amount,actual_amount,account_info,status) VALUES(1,NULL,1,10,10,'{}','approved'),(2,NULL,2,10,10,'{}','pending')");
  await conn.query("INSERT INTO mini_program_logs(id,user_id,event) VALUES(1,1,'test'),(2,NULL,'anonymous')");
  await conn.query("INSERT INTO audit_logs(id,admin_id,action,target_type,target_id,status) VALUES(100,2,'test','appointment','1','success'),(101,1,'test','appointment','2','success')");
  await conn.query("UPDATE appointments SET status='completed',consult_fee=id*100");
  await conn.query("INSERT INTO products(name,category,image_url,price) VALUES('Public','public','',100)");
  await conn.query("INSERT INTO article_categories(name) VALUES('Public')");
  await conn.query("INSERT INTO content_banners(title,preview_text) VALUES('Public','Public')");
  await conn.query("INSERT INTO community_posts(user_id,title,content) VALUES(1,'Public','Public')");
  await conn.query("INSERT INTO fulfillment_factory_batches(id,batch_no,factory_name,status,created_by) VALUES(1,'ScopeMixed','Test','sent',1),(2,'ScopeA','Test','sent',1)");
  await conn.query("INSERT INTO fulfillment_factory_items(batch_id,fulfillment_case_id,mold_id) VALUES(1,1,1),(1,2,2),(2,1,1)");
  const ids=rows=>rows.map(row=>Number(row.id)).sort((a,b)=>a-b);
  async function get(path,id=2){const r=await api(path,id);assert.equal(r.status,200,path+': '+JSON.stringify(r.body));return r.body.data;}
  async function set(scope,id=2){assert.equal((await api('roles/'+(id===1?1:2),1,{member_data_scopes:[{admin_user_id:id,data_scope:scope}]})).status,200);}
  const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  await set(self);
  assert.deepEqual(ids(await get('doctors')),[1]);
  assert.equal((await get('doctors'))[0].consult_count,2);
  assert.deepEqual(ids(await get('doctors?store_id=2')),[1]);
  assert.deepEqual(ids(await get('stores')),[1,2]);
  assert.equal((await get('stores')).find(s=>s.id===2).monthBookings,1);
  assert.equal((await get('stores')).find(s=>s.id===2).monthRevenueAmount,200);
  assert.equal((await api('stores/2')).status,200);
  assert.equal((await api(`day-slots?doctor_id=1&store_id=2&date=${date}`)).status,200);
  assert.equal((await api(`day-slots?doctor_id=2&store_id=2&date=${date}`)).status,403);
  assert.deepEqual(ids(await get('patients/1/medical-records')),[1,2]);
  assert.equal((await get('patients/1')).active_treatment?.id ?? (await get('patients/1')).activeTreatment?.id,2);
  assert.equal(Number((await get('patients/1/treatment')).id),2);
  assert.deepEqual(ids((await get('patients/1/follow-ups')).tasks),[1]);
  assert.deepEqual(ids(await get('patients/1/crm-records')),[1]);
  assert.deepEqual(ids(await get('fulfillment/cases')),[1,2]);
  assert.deepEqual(ids((await get('fulfillment/cases/1/detail')).history_records),[1,2]);
  assert.equal((await api('fulfillment/cases/3/detail')).status,404);
  assert.deepEqual(ids(await get('after-sales-tickets')),[1,2]);
  let promoters=await get('distribution/promoters');assert.deepEqual(ids(promoters),[1]);assert.equal(promoters[0].total_commission,30);
  assert.equal((await get('distribution/promoters/1')).totalCommission,30);
  assert.equal((await get('distribution/overview')).generatedCommission,30);
  assert.equal((await api('distribution/promoters/2')).status,404);
  assert.equal((await api('distribution/promoters/2/qr')).status,404);
  assert.equal((await get('distribution/commissions')).reduce((sum,r)=>sum+r.commission_amount,0),30);
  assert.deepEqual(ids(await get('distribution/withdraws')),[1]);
  assert.deepEqual(ids(await get('fulfillment/batches')),[1,2]);
  assert.equal((await api('fulfillment/batches/1')).status,200);
  console.log('PASS personal doctors/clinical/fulfillment/distribution lists, details and summaries');

  await set({type:'store',all_stores:false,store_ids:[1]});
  assert.deepEqual(ids(await get('stores')),[1]);assert.equal((await api('stores/2')).status,404);
  assert.deepEqual(ids(await get('doctors?store_id=2')),[1]); // mapped in both stores; stats/mapping scoped
  const doctors=await get('doctors');assert.equal(doctors.length,1);
  assert.equal(doctors[0].consult_count,1);
  assert.deepEqual(doctors[0].store_ids,[1]);
  assert.deepEqual(ids(await get('patients/1/medical-records')),[1]);
  assert.equal(Number((await get('patients/1/treatment')).id),1);
  assert.deepEqual(ids((await get('fulfillment/cases/1/detail')).history_records),[1]);
  assert.equal((await api('fulfillment/cases/2/detail')).status,404);
  promoters=await get('distribution/promoters');assert.equal(promoters[0].total_commission,10);assert.equal(promoters[0].available_commission,null);
  assert.equal((await get('distribution/promoters/1')).totalCommission,10);
  assert.equal((await get('distribution/overview')).generatedCommission,10);
  assert.equal((await get('distribution/leaderboard'))[0].total_commission,10);
  assert.deepEqual(await get('distribution/withdraws'),[]);
  assert.equal((await get('distribution/promoters/1/commissions')).length,1);
  assert.deepEqual(ids(await get('fulfillment/batches')),[2]);
  assert.equal((await api('fulfillment/batches/1')).status,404);
  assert.equal((await api('fulfillment/batches/2')).status,200);
  await conn.query("UPDATE orders SET status='refund_pending' WHERE id IN (1,2)");
  assert.deepEqual(ids(await get('orders/refunds')),[1]);
  assert.equal((await api('orders/2')).status,404);
  await conn.query("UPDATE orders SET status='paid' WHERE id IN (1,2)");
  for(const path of ['products','content/categories','content/articles','content/banners'])assert.equal((await get(path)).length,1,path);
  const logs=await get('logs');assert.ok(JSON.stringify(logs).includes('100'));assert.ok(!JSON.stringify(logs).includes('101'));
  const mini=await get('mini-program-logs');assert.equal(mini.total,1);
  for(const path of ['patients/1/sleep-diagnostics','patients/1/orders','orders/refunds','global-search?keyword=P1','fulfillment/ready-molds','fulfillment/batches'])await get(path);
  assert.equal((await api('settings')).status,403); // Existing configuration privilege, not business data.
  console.log('PASS selected-store child records, partial promoter aggregates and indivisible withdrawals');

  await set({type:'store',all_stores:true,store_ids:[]});
  assert.equal((await get('distribution/overview')).generatedCommission,70);
  assert.deepEqual(ids(await get('distribution/withdraws')),[1,2]);
  await set(system);assert.equal((await get('mini-program-logs')).total,2);
  assert.deepEqual(ids(await get('patients/1/medical-records')),[1,2,3]);
  assert.equal((await get('distribution/promoters')).length,2);
  console.log('PASS all-store and system scopes across new modules');

  // Super administrator is not an implicit data-scope bypass.
  await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(1,1,?) ON DUPLICATE KEY UPDATE data_scope=VALUES(data_scope)',[JSON.stringify({type:'store',all_stores:false,store_ids:[1]})]);
  assert.equal((await api('stores/2',1)).status,404);
  assert.equal((await get('data-scope-stores',1)).length,3);
  assert.equal((await api('data-scope-stores')).status,403);
  assert.equal((await api('distribution/withdraws/1/account',1)).status,404);
  const {canReadPrivateUpload}=await import('../../hanjing-clinic-backend/private-uploads.js');
  assert.equal(await canReadPrivateUpload('/uploads/medical-attachments/a.pdf',{id:1,role:'super_admin'}),true);
  assert.equal(await canReadPrivateUpload('/uploads/medical-attachments/b.pdf',{id:1,role:'super_admin'}),false);
  console.log('PASS restricted administrator and private medical download scope');
  await conn.query("INSERT INTO treatment_records(id,patient_id,doctor_id,medical_record_id,device_model,start_date) VALUES(4,1,1,NULL,'Manual',CURDATE())");
  await conn.query("INSERT INTO patient_devices(id,patient_id,bind_doctor_id,bind_treatment_record_id,device_model,bound_at) VALUES(4,1,1,4,'Manual',CURDATE())");
  assert.equal(Number((await get('patients/1/treatment',1)).id),4);
  await conn.query('UPDATE treatment_records SET medical_record_id=2 WHERE id=4');
  assert.equal(Number((await get('patients/1/treatment',1)).id),1);
  console.log('PASS manual treatment follows patient; linked treatment follows original visit store');
}
