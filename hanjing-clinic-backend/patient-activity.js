import { transaction } from './db.js';
import { orderAccessScope } from './admin-scope.js';

// Totals are patient-attributed receipts, not the whole WeChat account's purchases.
export async function readPatientActivity(user, patientId) {
  const orderScope = orderAccessScope(user, 'o');
  const stores = [...new Set((user.store_ids || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  const visitScope = user.role === 'super_admin' ? {sql:'1=1',params:[]} : {
    sql: stores.length && (user.role !== 'doctor' || user.doctor_id)
      ? `a.store_id IN (${stores.map(()=>'?').join(',')})${user.role === 'doctor'?' AND a.doctor_id=?':''}` : '1=0',
    params: stores.length && (user.role !== 'doctor' || user.doctor_id) ? [...stores,...(user.role === 'doctor'?[user.doctor_id]:[])] : []
  };
  return transaction(async conn => {
    const [[visits]] = await conn.execute(`SELECT COUNT(*) AS count FROM appointments a
      WHERE a.patient_id=? AND a.status IN ('checked_in','completed','arrived','settled') AND ${visitScope.sql}`,
      [patientId,...visitScope.params]);
    const [[money]] = await conn.execute(`SELECT
      COALESCE(SUM(o.pay_amount),0) AS receipts,
      COALESCE(SUM(CASE WHEN o.status='refunded' AND o.refund_at IS NOT NULL THEN o.pay_amount ELSE 0 END),0) AS refunds
      FROM orders o LEFT JOIN appointments a ON a.id=o.appointment_id
      JOIN patients p ON p.id=? AND p.user_id=o.user_id
      WHERE o.pay_at IS NOT NULL AND o.pay_amount >= 0 AND ${orderScope.sql}
        AND (a.patient_id=p.id OR (o.appointment_id IS NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(o.cashier_context,'$.patient_id'))=CAST(p.id AS CHAR)))`,
      [patientId,...orderScope.params]);
    const receipts=Number(money.receipts), refunds=Number(money.refunds);
    return {visit_count:Number(visits.count),receipts,refunds,net_receipts:receipts-refunds};
  });
}
