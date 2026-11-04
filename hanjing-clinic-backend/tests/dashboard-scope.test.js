import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardScope, dashboardAppointmentScope, dashboardOrderScope } from '../dashboard-scope.js';
import { requiredAdminPermissions, hasAdminPermission } from '../admin-permissions.js';
test('dashboard defaults to own doctor, without a store requirement', () => {
 const user={role:'doctor',doctor_id:7,store_ids:[]};
 assert.equal(dashboardScope(user).kind,'self');
 assert.deepEqual(dashboardAppointmentScope(user,'a.store_id'),{sql:'a.doctor_id=?',params:[7]});
 assert.deepEqual(dashboardOrderScope(user).params,[7]);
 assert.match(dashboardOrderScope(user).sql,/doctor_id=\?/);
});
test('unlinked account sees empty own scope, never everyone',()=>{
 assert.deepEqual(dashboardAppointmentScope({role:'staff'}),{sql:'1=0',params:[]});
});
test('explicit stores override own scope and deduplicate',()=>{
 const user={role:'doctor',doctor_id:7,store_ids:[],effective_data_scope:{type:'store',all_stores:false,store_ids:[2,3]}};
 assert.deepEqual(dashboardAppointmentScope(user),{sql:'store_id IN (?,?)',params:[2,3]});
 assert.deepEqual(dashboardOrderScope(user).params,[2,3,2,3]);
 assert.doesNotMatch(dashboardOrderScope(user).sql,/doctor_id/);
});
test('explicit all stores and super administrator cover system scope',()=>{
 for(const user of [{role:'staff',effective_data_scope:{type:'system'}},{role:'super_admin',effective_data_scope:{type:'system'}}]){
 assert.deepEqual(dashboardAppointmentScope(user),{sql:'1=1',params:[]});
 assert.deepEqual(dashboardOrderScope(user),{sql:'1=1',params:[]});
 }
});
test('dashboard read does not grant order or system management',()=>{
 const user={role:'doctor',permissions:[]};
 for(const path of ['stats','lists']) assert(hasAdminPermission(user,requiredAdminPermissions('GET','/api/admin/dashboard/'+path)));
 assert(!hasAdminPermission(user,requiredAdminPermissions('GET','/api/admin/orders')));
 assert(!hasAdminPermission(user,requiredAdminPermissions('POST','/api/admin/dashboard/lists')));
});
