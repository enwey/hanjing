import { query } from './db.js';

export const personalScope = () => ({ type: 'self', all_stores: false, store_ids: [] });
export function parseDataScope(value) {
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}
export function effectiveDataScope(user) {
  return parseDataScope(user.effective_data_scope) || parseDataScope(user.role_member_data_scope) || parseDataScope(user.role_data_scope) || personalScope();
}
export async function validateDataScope(value, allowInherit = false) {
  if (value === null && allowInherit) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['self', 'store', 'system'].includes(value.type)) {
    throw Object.assign(new Error('请选择有效的数据范围'), { statusCode: 400 });
  }
  if (value.type !== 'store') return { type: value.type, all_stores: false, store_ids: [] };
  if (typeof value.all_stores !== 'boolean') throw Object.assign(new Error('请选择全部门店或指定门店'), { statusCode: 400 });
  if (value.all_stores) return { type: 'store', all_stores: true, store_ids: [] };
  if (!Array.isArray(value.store_ids) || !value.store_ids.length || value.store_ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw Object.assign(new Error('请至少选择一家门店'), { statusCode: 400 });
  }
  const ids = [...new Set(value.store_ids.map(Number))];
  const rows = await query(`SELECT id FROM stores WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (rows.length !== ids.length) throw Object.assign(new Error('所选门店不存在，请重新选择'), { statusCode: 400 });
  return { type: 'store', all_stores: false, store_ids: ids };
}
export async function attachDataScope(user) {
  const rows = user.id && user.role_id ? await query(
    'SELECT data_scope FROM role_member_data_scopes WHERE role_id=? AND admin_user_id=?', [user.role_id, user.id]
  ) : [];
  user.role_member_data_scope = parseDataScope(rows[0]?.data_scope);
  delete user.data_scope;
  user.role_data_scope = parseDataScope(user.role_data_scope) || personalScope();
  // Recompute on every authentication; no stale account-level override is trusted.
  user.effective_data_scope = user.role_member_data_scope || user.role_data_scope;
  user.data_scope_source = user.role_member_data_scope === null ? 'role' : 'role_member';
  user.data_store_ids = user.effective_data_scope.type === 'store'
    ? (user.effective_data_scope.all_stores ? (await query('SELECT id FROM stores')).map(row => Number(row.id)) : user.effective_data_scope.store_ids)
    : [];
  return user;
}
