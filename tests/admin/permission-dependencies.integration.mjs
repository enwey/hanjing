import assert from 'node:assert/strict';
export async function verifyPermissionDependencies({conn,api,self,system}) {
 const [saved]=await conn.query('SELECT permission_resource FROM permissions WHERE role_id=2');
 const [users]=await conn.query('SELECT data_scope FROM role_member_data_scopes WHERE role_id=2 AND admin_user_id=2');
 try {
  await conn.query('DELETE FROM permissions WHERE role_id=2');
  for(const p of ['appointment:view','appointment:edit','patient:view','medical_record:view','schedule:view']) await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[p]);
  await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?) ON DUPLICATE KEY UPDATE data_scope=VALUES(data_scope)',[JSON.stringify(self)]);
  for(const path of ['appointments','appointments/options/stores','appointments/options/doctors','appointments/options/booking-settings','appointments/options/schedules','schedules/options/stores','schedules/options/doctors','patients/options/followers','appointments/options/products']) {
   const r=await api(path); assert.equal(r.status,200,path+': '+JSON.stringify(r.body));
  }
  for(const path of ['stores','doctors','products','fulfillment/technicians','settings','orders/options/products','orders/options/patients']) assert.equal((await api(path)).status,403,path);
  const settings=(await api('appointments/options/booking-settings')).body.data;
  assert.ok(Object.keys(settings).every(k=>['require_deposit','deposit_amount','booking_interval'].includes(k)));
  const doctors=(await api('appointments/options/doctors')).body.data;
  for(const doctor of doctors) assert.ok(!('admin_username' in doctor)&&!('phone' in doctor));
  const followers=(await api('patients/options/followers')).body.data;
  assert.deepEqual(followers.map(x=>Number(x.id)),[2]);assert.ok(!('phone' in followers[0]));
  await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?) ON DUPLICATE KEY UPDATE data_scope=VALUES(data_scope)',[JSON.stringify({type:'store',all_stores:false,store_ids:[2]})]);
  assert.deepEqual((await api('appointments/options/stores')).body.data.map(x=>Number(x.id)),[2]);
  await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?) ON DUPLICATE KEY UPDATE data_scope=VALUES(data_scope)',[JSON.stringify(system)]);
  assert.ok((await api('appointments/options/stores')).body.data.length>=2);
  await conn.query('DELETE FROM permissions WHERE role_id=2');
  for(const path of ['appointments/options/stores','appointments/options/doctors','appointments/options/booking-settings','appointments/options/schedules','schedules/options/doctors','patients/options/followers','appointments/options/products']) assert.equal((await api(path)).status,403,path);
  await conn.query("INSERT INTO permissions(role_id,permission_resource) VALUES(2,'order:edit')");
  assert.equal((await api('orders/options/products')).status,200);
  assert.equal((await api('orders/options/patients?search=P')).status,200);
  assert.equal((await api('products')).status,403);
  console.log('PASS restricted workflow dependencies, denied management APIs, no-permission denial, scoped and minimal options');
 } finally {
  await conn.query('DELETE FROM permissions WHERE role_id=2');
  for(const row of saved) await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[row.permission_resource]);
  await conn.query('DELETE FROM role_member_data_scopes WHERE role_id=2 AND admin_user_id=2');
  if(users.length) await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?)',[typeof users[0].data_scope==='string'?users[0].data_scope:JSON.stringify(users[0].data_scope)]);

 }
}
