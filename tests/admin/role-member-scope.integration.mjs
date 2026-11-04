import assert from 'node:assert/strict';
export async function verifyRoleMemberScopes({conn,api,db,self,system,adminBody}) {
 const [[role]]=await conn.query('SELECT name,data_scope FROM roles WHERE id=2');
 const [saved]=await conn.query('SELECT data_scope FROM role_member_data_scopes WHERE role_id=2 AND admin_user_id=2');
 const json=value=>typeof value==='string'?value:JSON.stringify(value);
 let newRole;
 try {
  const store={type:'store',all_stores:false,store_ids:[2]};
  await conn.query('DELETE FROM role_member_data_scopes WHERE admin_user_id=2');
  await conn.query('UPDATE admin_users SET data_scope=? WHERE id=2',[JSON.stringify(store)]);
  await db.migrateRoleMemberDataScopes();
  assert.deepEqual((await api('me')).body.data.effective_data_scope,store);
  const [[legacy]]=await conn.query('SELECT data_scope FROM admin_users WHERE id=2');assert.equal(legacy.data_scope,null);
  await db.migrateRoleMemberDataScopes();
  assert.deepEqual((await api('me')).body.data.role_member_data_scope,store);
  console.log('PASS legacy account scope migration preserves current-role scope and is idempotent');
  for(const data of [{data_scope:system},{data_scope:null},{role_member_data_scope:system}])assert.equal((await api('users/2',1,{...adminBody,...data})).status,400);
  assert.equal((await api('users',1,{username:'scope-rejected',name:'Rejected',role_id:2,password:'test-password',data_scope:system},'POST')).status,400);
  assert.equal((await api('roles/2',1,{data_scope:self,member_data_scopes:[{admin_user_id:2,data_scope:system}]})).status,200);
  assert.equal((await api('me')).body.data.data_scope_source,'role_member');assert.equal((await api('me')).body.data.effective_data_scope.type,'system');
  assert.equal((await api('users/2',1,adminBody)).status,200);
  assert.equal((await api('me')).body.data.effective_data_scope.type,'system');
  assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:null}]})).status,200);
  assert.equal((await api('me')).body.data.data_scope_source,'role');assert.equal((await api('me')).body.data.effective_data_scope.type,'self');
  console.log('PASS account scope edits rejected; current-role adjustment and restore inheritance');
  const previousName=(await api('roles',1)).body.data.find(r=>r.id===2).name;
  assert.equal((await api('roles/2',1,{name:'must-roll-back',member_data_scopes:[{admin_user_id:1,data_scope:system}]})).status,400);
  assert.equal((await api('roles',1)).body.data.find(r=>r.id===2).name,previousName);
  assert.equal((await api('roles/2',1,{memberIds:[2,999999]})).status,400);
  assert.equal((await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:{type:'store',all_stores:false,store_ids:[999999]}}]})).status,400);
  assert.equal((await api('roles/2',2,{member_data_scopes:[{admin_user_id:2,data_scope:system}]})).status,403);
  assert.equal((await api('roles/1',1,{memberIds:[]})).status,400);
  assert.equal((await api('me',1)).status,200);
  console.log('PASS invalid, cross-role and unauthorized changes rejected atomically; last admin preserved');
  const made=await api('roles',1,{name:'Other scope role',code:'scope_members_other',data_scope:store,permissions:['appointment:view']},'POST');assert.equal(made.status,200);newRole=made.body.data.id;
  await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:system}]});
  assert.equal((await api('users/2',1,{...adminBody,role_id:newRole})).status,200);
  assert.deepEqual((await api('me')).body.data.effective_data_scope,store);
  assert.equal((await conn.query('SELECT * FROM role_member_data_scopes WHERE admin_user_id=2'))[0].length,0);
  assert.equal((await api('roles/'+newRole,1,{member_data_scopes:[{admin_user_id:2,data_scope:self}]})).status,200);
  assert.equal((await api('roles/2',1,{memberIds:[2]})).status,200);
  assert.equal((await api('me')).body.data.effective_data_scope.type,'self');
  assert.equal((await conn.query('SELECT * FROM role_member_data_scopes WHERE admin_user_id=2'))[0].length,0);
  await api('roles/2',1,{member_data_scopes:[{admin_user_id:2,data_scope:system}]});
  assert.equal((await api('roles/2',1,{memberIds:[]})).status,200);
  const removed=(await api('users',1)).body.data.find(u=>u.id===2);assert.ok(removed);assert.equal(removed.role_id,null);
  assert.notEqual((await api('me')).status,200);
  assert.equal((await conn.query('SELECT * FROM role_member_data_scopes WHERE admin_user_id=2'))[0].length,0);
  assert.equal((await api('roles/2',1,{memberIds:[2]})).status,200);assert.equal((await api('me')).body.data.effective_data_scope.type,'self');
  console.log('PASS switching, removing and rejoining roles never carries previous adjustments; account preserved');
 } finally {
  await conn.query('UPDATE admin_users SET role_id=2,data_scope=NULL WHERE id=2');
  await conn.query('UPDATE roles SET name=?,data_scope=? WHERE id=2',[role.name,json(role.data_scope)]);
  await conn.query('DELETE FROM role_member_data_scopes WHERE admin_user_id=2');
  if(saved.length)await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?)',[json(saved[0].data_scope)]);
  if(newRole){await conn.query('DELETE FROM permissions WHERE role_id=?',[newRole]);await conn.query('DELETE FROM roles WHERE id=?',[newRole]);}
 }
}
