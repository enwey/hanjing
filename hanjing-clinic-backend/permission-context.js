import { get, query } from './db.js';
import { permissionCodes } from './permission-migration.js';
import { effectiveDataScope, parseDataScope } from './data-scope.js';
const fail = message => { throw Object.assign(new Error(message), { statusCode: 403 }); };
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b) || (a != null && b != null && String(a) === String(b));
// Compare the special fields against stored values: an unchanged field in a full editor payload
// does not require an unrelated operation permission. The original request is never rewritten.
export async function adminPermissionContext(req) {
  const body = { ...(req.body || {}) };
  const path = req.route?.path || '';
  if (req.method !== 'PUT') return { body, query: req.query };
  const tables = { '/api/admin/users/:id':'admin_users', '/api/admin/roles/:id':'roles', '/api/admin/products/:id':'products', '/api/admin/content/articles/:id':'community_posts' };
  const table = tables[path];
  if (!table) return { body, query:req.query };
  const row = await get(`SELECT * FROM ${table} WHERE id=?`,[req.params.id]);
  if (!row) return { body, query:req.query };
  for (const key of Object.keys(body)) {
    if (Object.hasOwn(row,key) && equal(body[key],row[key])) delete body[key];
  }
  if (table === 'roles') {
    if (Array.isArray(body.permissions)) {
      const old = (await query('SELECT permission_resource FROM permissions WHERE role_id=?',[row.id])).map(r=>r.permission_resource).sort();
      if (equal([...body.permissions].sort(), old)) delete body.permissions;
    }
    if (Array.isArray(body.memberIds)) {
      const old = (await query('SELECT id FROM admin_users WHERE role_id=?',[row.id])).map(r=>String(r.id)).sort();
      if (equal(body.memberIds.map(String).sort(), old)) delete body.memberIds;
    }
    if (body.data_scope && equal(body.data_scope,parseDataScope(row.data_scope))) delete body.data_scope;
    if (Array.isArray(body.member_data_scopes)) {
      const old = await query('SELECT admin_user_id,data_scope FROM role_member_data_scopes WHERE role_id=?',[row.id]);
      if(body.member_data_scopes.every(m => equal(m.data_scope,parseDataScope(old.find(o=>String(o.admin_user_id)===String(m.admin_user_id))?.data_scope)))) delete body.member_data_scopes;
    }
  }
  if (table === 'admin_users') {
    if (Array.isArray(body.store_ids)) {
      const old = (await query('SELECT store_id FROM admin_user_stores WHERE admin_user_id=?',[row.id])).map(r=>String(r.store_id)).sort();
      if(equal(body.store_ids.map(String).sort(),old)) delete body.store_ids;
    }
    if (body.all_stores !== undefined && Number(body.all_stores)===Number(row.all_stores)) delete body.all_stores;
    if (!body.password) delete body.password;
  }
  return { body, query:req.query };
}
export async function assertPermissionDelegation(req, user) {
  const path=req.route?.path || '', body=req.body||{};
  if (!['POST','PUT'].includes(req.method) || !/^\/api\/admin\/(users|roles)(\/|$)/.test(path)) return;
  if (Array.isArray(body.permissions) && body.permissions.some(p=>!permissionCodes.has(p))) fail('包含无效的权限项，请刷新角色页面');
  if (user.role === 'super_admin') return;
  if(body.code === 'super_admin') fail('不能创建超级管理员角色');
  const isRole=path.includes('/roles');
  const roleIds=[];
  if (isRole && req.params.id) roleIds.push(req.params.id);
  if (!isRole && body.role_id) roleIds.push(body.role_id);
  const memberIds=isRole ? body.memberIds || [] : req.params.id ? [req.params.id] : [];
  if (memberIds.length) {
    const rows=await query(`SELECT role_id FROM admin_users WHERE id IN (${memberIds.map(()=>'?').join(',')})`,memberIds);
    roleIds.push(...rows.map(r=>r.role_id).filter(Boolean));
  }
  const assignedScopes=[];
  const proposed=Array.isArray(body.permissions)?[...body.permissions]:[];
  for(const id of new Set(roleIds)) {
    const role=await get('SELECT code,data_scope FROM roles WHERE id=?',[id]);
    if(role?.data_scope) assignedScopes.push(parseDataScope(role.data_scope));
    if(role?.code==='super_admin') fail('不能修改超级管理员及其成员');
    const rows=await query('SELECT permission_resource FROM permissions WHERE role_id=?',[id]);
    proposed.push(...rows.map(r=>r.permission_resource));
  }
  if(proposed.some(p=>!user.permissions.includes(p))) fail('不能分配或修改超出自身权限的角色');
  const own=effectiveDataScope(user);
  if (!isRole && body.doctor_id && own.type === 'self' && Number(body.doctor_id) !== Number(user.doctor_id)) fail('不能绑定超出自身数据范围的医生');
  const scopes=[...assignedScopes,body.data_scope,...(body.member_data_scopes||[]).map(m=>m.data_scope)].filter(Boolean);
  if (body.all_stores && !user.all_stores) fail('不能分配超出自身的操作门店');
  if (Array.isArray(body.store_ids) && !user.all_stores && body.store_ids.some(id=>!user.store_ids.includes(Number(id)))) fail('不能分配超出自身的操作门店');
  for(const scope of scopes) {
    if(own.type==='system') continue;
    if(scope.type==='system' || (scope.type==='store' && (own.type!=='store' || (!own.all_stores && (scope.all_stores || (scope.store_ids||[]).some(id=>!own.store_ids.map(Number).includes(Number(id)))))))) fail('不能分配超出自身的数据范围');
  }
}
