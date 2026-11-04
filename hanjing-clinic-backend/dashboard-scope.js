import { effectiveDataScope } from './data-scope.js';
// Dashboard visibility is separate from permissions to edit business records.
export function dashboardScope(user) {
  const scope = effectiveDataScope(user);
  if (scope.type === 'system') return { kind: 'all', stores: [] };
  if (scope.type === 'store') return { kind: 'stores', stores: scope.all_stores ? (user.data_store_ids || []) : scope.store_ids };
  return { kind: 'self', stores: [], doctorId: Number(user.doctor_id) || 0 };
}
export function dashboardAppointmentScope(user, storeColumn = 'store_id') {
  if (!/^(?:[a-z_]+\.)?store_id$/i.test(storeColumn)) throw new Error('Invalid scope column');
  const scope = dashboardScope(user);
  if (scope.kind === 'all') return { sql: '1=1', params: [] };
  if (scope.kind === 'stores' && !scope.stores.length) return { sql: '1=0', params: [] };
  if (scope.kind === 'stores') return { sql: `${storeColumn} IN (${scope.stores.map(() => '?').join(',')})`, params: scope.stores };
  return scope.doctorId ? { sql: `${storeColumn.replace('store_id', 'doctor_id')}=?`, params: [scope.doctorId] } : { sql: '1=0', params: [] };
}
export function dashboardOrderScope(user, alias = 'o') {
  if (!/^[a-z_]+$/i.test(alias)) throw new Error('Invalid scope alias');
  const scope = dashboardScope(user);
  if (scope.kind === 'all') return { sql: '1=1', params: [] };
  const appointment = dashboardAppointmentScope(user);
  let sql = `${alias}.appointment_id IN (SELECT id FROM appointments WHERE ${appointment.sql})`;
  const params = [...appointment.params];
  if (scope.kind === 'stores' && scope.stores.length) {
    sql = `(${sql} OR (${alias}.appointment_id IS NULL AND JSON_VALID(${alias}.shipping_address) AND CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.shipping_address, '$.storeId')) AS UNSIGNED) IN (${scope.stores.map(() => '?').join(',')})))`;
    params.push(...scope.stores);
  }
  return { sql, params };
}
