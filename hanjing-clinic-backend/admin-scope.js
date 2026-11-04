import { patientReadScope, orderReadScope, dataStoreScope } from './data-read-scope.js';
export function patientAccessScope(user, alias = 'p') {
  if (user.read_data_scope) return patientReadScope(user, alias);
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  if (user.role === 'super_admin') return { sql: '1=1', params: [] };
  const stores = [...new Set((user.store_ids || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!stores.length || (user.role === 'doctor' && !user.doctor_id)) return { sql: '1=0', params: [] };
  const placeholders = stores.map(() => '?').join(',');
  const doctor = user.role === 'doctor' ? ' AND doctor_id=?' : '';
  const params = [...stores, ...(doctor ? [user.doctor_id] : [])];
  return { sql: `(EXISTS (SELECT 1 FROM appointments WHERE patient_id=${alias}.id AND store_id IN (${placeholders})${doctor})
    OR EXISTS (SELECT 1 FROM medical_records WHERE patient_id=${alias}.id AND store_id IN (${placeholders})${doctor})
    OR EXISTS (SELECT 1 FROM patient_store_registrations WHERE patient_id=${alias}.id AND store_id IN (${placeholders})${doctor}))`, params: [...params, ...params, ...params] };
}

export function orderAccessScope(user, alias = 'o') {
  if (user.read_data_scope) return orderReadScope(user, alias);
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  if (user.role === 'super_admin') return { sql: '1=1', params: [] };
  const stores = [...new Set((user.store_ids || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!stores.length || (user.role === 'doctor' && !user.doctor_id)) return { sql: '1=0', params: [] };
  const marks = stores.map(() => '?').join(',');
  if (user.role === 'doctor') return {
    sql: `${alias}.appointment_id IN (SELECT id FROM appointments WHERE doctor_id=? AND store_id IN (${marks}))`,
    params: [user.doctor_id, ...stores]
  };
  return { sql: `(${alias}.appointment_id IN (SELECT id FROM appointments WHERE store_id IN (${marks}))
    OR (${alias}.appointment_id IS NULL AND JSON_VALID(${alias}.shipping_address)
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.shipping_address,'$.storeId')) AS UNSIGNED) IN (${marks})))`, params: [...stores, ...stores] };
}

export function fulfillmentAccessScope(user, alias = 'c') {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  if (user.read_data_scope) {
    const scope = dataStoreScope(user, `${alias}.store_id`);
    if (scope) return scope;
    return { sql: `(${alias}.created_by=? OR ${alias}.technician_id=? OR EXISTS(SELECT 1 FROM orders own_order WHERE own_order.id=${alias}.order_id AND ${orderReadScope(user, 'own_order').sql}))`, params: [Number(user.id)||0, Number(user.id)||0, ...orderReadScope(user, 'own_order').params] };
  }
  if (user.role === 'super_admin') return { sql: '1=1', params: [] };
  const stores = [...new Set((user.store_ids || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!stores.length) return { sql: '1=0', params: [] };
  const order = orderAccessScope(user, 'scope_order');
  return { sql: `(${alias}.store_id IN (${stores.map(() => '?').join(',')}) AND EXISTS
    (SELECT 1 FROM orders scope_order WHERE scope_order.id=${alias}.order_id AND ${order.sql}))`, params: [...stores, ...order.params] };
}

export function readPagination(input) {
  const page = Number(input.page ?? 1), pageSize = Number(input.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw Object.assign(new Error('Invalid pagination'), { statusCode: 400 });
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}
