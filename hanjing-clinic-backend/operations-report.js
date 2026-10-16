import { transaction } from './db.js';
import { businessError } from './distribution-ledger.js';

export async function readStoreReport(user, filters) {
  const year = Number(filters.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw businessError('年份不正确');
  let storeId = filters.store_id ? Number(filters.store_id) : null;
  let doctorId = filters.doctor_id ? Number(filters.doctor_id) : null;
  let allowedStoreIds = storeId ? [storeId] : null;
  if ((storeId !== null && (!Number.isSafeInteger(storeId) || storeId <= 0)) ||
      (doctorId !== null && (!Number.isSafeInteger(doctorId) || doctorId <= 0))) throw businessError('门店或医生编号不正确');
  if (user.role !== 'super_admin') {
    if (user.role === 'doctor') {
      if (!user.doctor_id || (doctorId && doctorId !== Number(user.doctor_id))) throw businessError('无权查看该医生报表', 403);
      doctorId = Number(user.doctor_id);
    }
    const storeIds = [...new Set((user.store_ids || []).map(Number).filter(Number.isInteger))];
    if (storeIds.length) {
      if (storeId && !storeIds.includes(storeId)) throw businessError('无权查看该门店报表', 403);
      allowedStoreIds = storeId ? [storeId] : storeIds;
    } else if (!doctorId) throw businessError('账号未配置数据范围', 403);
  }
  const start = `${year}-01-01`, end = `${year + 1}-01-01`;
  const storePlaceholders = allowedStoreIds?.map(() => '?').join(',') || '';
  const appointmentStoreScope = allowedStoreIds ? ` AND a.store_id IN (${storePlaceholders})` : '';
  const orderStoreScope = allowedStoreIds
    ? ` AND COALESCE(a.store_id, CAST(JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address, '$.storeId')) AS UNSIGNED)) IN (${storePlaceholders})`
    : '';
  const storeParams = allowedStoreIds || [];
  return transaction(async conn => {
    const [appointments] = await conn.execute(`SELECT a.id, a.doctor_id, d.name AS doctor_name,
      MONTH(a.appointment_date) AS month, a.status FROM appointments a LEFT JOIN doctors d ON d.id = a.doctor_id
      WHERE a.appointment_date >= ? AND a.appointment_date < ?${appointmentStoreScope}
      AND (? IS NULL OR a.doctor_id = ?)`, [start, end, ...storeParams, doctorId, doctorId]);
    // A patient's previous visits do not establish ownership of an unrelated order.
    const orderScope = `1=1${orderStoreScope} AND (? IS NULL OR a.doctor_id = ?)`;
    const params = [start, end, ...storeParams, doctorId, doctorId];
    const [receipts] = await conn.execute(`SELECT MONTH(o.pay_at) AS month, a.doctor_id, d.name AS doctor_name,
      SUM(o.pay_amount) AS amount FROM orders o LEFT JOIN appointments a ON a.id = o.appointment_id
      LEFT JOIN doctors d ON d.id = a.doctor_id WHERE o.pay_at >= ? AND o.pay_at < ? AND o.pay_amount > 0
      AND ${orderScope} GROUP BY MONTH(o.pay_at), a.doctor_id, d.name`, params);
    const [refunds] = await conn.execute(`SELECT MONTH(o.refund_at) AS month, a.doctor_id, d.name AS doctor_name,
      SUM(o.pay_amount) AS amount FROM orders o LEFT JOIN appointments a ON a.id = o.appointment_id
      LEFT JOIN doctors d ON d.id = a.doctor_id WHERE o.refund_at >= ? AND o.refund_at < ? AND o.status = 'refunded'
      AND ${orderScope} GROUP BY MONTH(o.refund_at), a.doctor_id, d.name`, params);
    const [ratings] = await conn.execute(`SELECT MONTH(e.created_at) AS month, e.doctor_id, COUNT(*) AS count,
      SUM(e.rating) AS total, SUM(e.rating >= 4) AS positive FROM appointment_evaluations e
      JOIN appointments a ON a.id = e.appointment_id WHERE e.created_at >= ? AND e.created_at < ?
      ${appointmentStoreScope} AND (? IS NULL OR a.doctor_id = ?)
      GROUP BY MONTH(e.created_at), e.doctor_id`, [start, end, ...storeParams, doctorId, doctorId]);
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, appointments: 0, visits: 0,
      receipts: 0, refunds: 0, net: 0, rating: null, doctors: [] }));
    const doctors = new Map();
    const doctor = (month, id, name) => {
      const key = `${month}:${id}`;
      if (!doctors.has(key)) doctors.set(key, { doctorId: id, month, name: name || '未归属医生', visits: 0, net: 0, rate: null });
      return doctors.get(key);
    };
    for (const row of appointments) {
      months[row.month - 1].appointments++;
      if (['completed', 'arrived', 'settled', 'checked_in'].includes(row.status)) {
        months[row.month - 1].visits++;
        doctor(row.month, row.doctor_id, row.doctor_name).visits++;
      }
    }
    for (const [rows, sign, field] of [[receipts, 1, 'receipts'], [refunds, -1, 'refunds']]) {
      for (const row of rows) {
        months[row.month - 1][field] += Number(row.amount);
        months[row.month - 1].net += sign * Number(row.amount);
        doctor(row.month, row.doctor_id, row.doctor_name).net += sign * Number(row.amount);
      }
    }
    for (const month of months) {
      const matching = ratings.filter(row => Number(row.month) === month.month);
      const count = matching.reduce((sum, row) => sum + Number(row.count), 0);
      month.rating = count ? matching.reduce((sum, row) => sum + Number(row.total), 0) / count : null;
      month.doctors = [...doctors.values()].filter(row => row.month === month.month).map(row => {
        const rating = matching.find(item => Number(item.doctor_id) === Number(row.doctorId));
        return { ...row, rate: rating ? Number(rating.positive) / Number(rating.count) * 100 : null };
      }).sort((a, b) => b.visits - a.visits);
    }
    return { year, storeId, doctorId, months };
  });
}
