import { businessError } from './distribution-ledger.js';

export const RESCHEDULABLE_STATUSES = new Set(['pending_payment', 'pending', 'confirmed']);
export const TERMINAL_STATUSES = new Set(['completed', 'arrived', 'settled', 'cancelled', 'no_show', 'refunding', 'refunded']);

const PAID_STATUSES = new Set(['paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed']);

export function appointmentFeeSnapshot(appointment) {
  return { consult_fee: Number(appointment.consult_fee || 0), deposit_amount: Number(appointment.deposit_amount || 0) };
}

export function orderCoversAppointmentFees(order, appointment) {
  const fees = appointmentFeeSnapshot(appointment);
  const total = fees.consult_fee + fees.deposit_amount;
  if (total <= 0) return false;
  if (order.type === 'appointment_deposit') return Number(order.pay_amount) === total && Number(order.discount_amount || 0) === 0;
  let context;
  try { context = typeof order.cashier_context === 'string' ? JSON.parse(order.cashier_context) : order.cashier_context; }
  catch { return false; }
  const saved = context?.appointment_fees;
  return saved?.version === 1 && saved.consult_fee === fees.consult_fee && saved.deposit_amount === fees.deposit_amount
    && Number(order.total_amount) >= total && Number(order.pay_amount) >= 0
    && Number(order.total_amount) - Number(order.discount_amount) === Number(order.pay_amount);
}

export async function assertAppointmentFeesPaid(conn, appointment) {
  const fees = appointmentFeeSnapshot(appointment);
  if (fees.consult_fee + fees.deposit_amount <= 0) return;
  const [orders] = await conn.execute('SELECT * FROM orders WHERE appointment_id = ? ORDER BY id FOR UPDATE', [appointment.id]);
  if (!orders.some(order => order.pay_at && PAID_STATUSES.has(order.status) && orderCoversAppointmentFees(order, appointment))) {
    throw businessError('预约费用尚未结清或已申请退款，请核实挂号费及定金收款', 409);
  }
}

export async function settlePaidAppointmentOrder(conn, order, appointment) {
  if (!appointment || appointment.status !== 'pending_payment' || !order.pay_at || !PAID_STATUSES.has(order.status)
    || !orderCoversAppointmentFees(order, appointment)) return;
  await conn.execute("UPDATE appointments SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending_payment'", [appointment.id]);
}

export async function validateAppointmentFeeItems(conn, appointment, items) {
  const tagged = items.filter(item => item.feeKind);
  if (!tagged.length) return null;
  if (!appointment || appointment.status !== 'pending_payment') throw businessError('当前预约不支持重复收取预约费用', 409);
  const fees = appointmentFeeSnapshot(appointment);
  const kinds = new Set();
  for (const item of tagged) {
    if (!Object.hasOwn(fees, item.feeKind) || kinds.has(item.feeKind) || item.product.category !== 'service'
      || item.quantity !== 1 || item.price !== fees[item.feeKind] || item.price <= 0) {
      throw businessError('预约收费项目必须与保存的挂号费及定金一致', 400);
    }
    kinds.add(item.feeKind);
  }
  if (Object.entries(fees).some(([kind, amount]) => amount > 0 && !kinds.has(kind))) {
    throw businessError('请在同一账单中收齐挂号费及定金', 400);
  }
  const [orders] = await conn.execute('SELECT * FROM orders WHERE appointment_id = ? ORDER BY id', [appointment.id]);
  if (orders.some(order => !['cancelled', 'refunded'].includes(order.status) && orderCoversAppointmentFees(order, appointment))) {
    throw businessError('该预约已有费用订单，请处理原订单，勿重复收款', 409);
  }
  return { version: 1, ...fees };
}

export async function assertConsultationAllowed(conn, appointment, medicalRecord = {}, allowAmendment = false) {
  const amendment = allowAmendment && ['completed', 'arrived', 'settled'].includes(appointment.status);
  if (TERMINAL_STATUSES.has(appointment.status) && !amendment) throw businessError('预约已结束，不能重复接诊', 409);
  if ((medicalRecord.store_id && Number(medicalRecord.store_id) !== Number(appointment.store_id))
    || (medicalRecord.doctor_id && Number(medicalRecord.doctor_id) !== Number(appointment.doctor_id))) {
    throw businessError('病历门店及医生必须与预约一致', 400);
  }
  if (!amendment) await assertAppointmentFeesPaid(conn, appointment);
}

export async function lockAppointmentChange(conn, expected, targetScheduleId = expected.schedule_id) {
  const schedules = new Map();
  // Booking, rescheduling and cancellation acquire schedule locks before the appointment.
  const ids = [...new Set([Number(expected.schedule_id), Number(targetScheduleId)])].sort((a, b) => a - b);
  for (const id of ids) {
    const [[row]] = await conn.execute('SELECT * FROM doctor_schedules WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw businessError('排班不存在，请刷新后重试', 409);
    schedules.set(id, row);
  }
  const [[current]] = await conn.execute('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [expected.id]);
  const fields = ['status', 'schedule_id', 'appointment_date', 'appointment_time', 'store_id', 'doctor_id', 'patient_id', 'user_id'];
  if (!current || fields.some(key => String(current[key]) !== String(expected[key]))) {
    throw businessError('预约已变更，请刷新后重试', 409);
  }
  return { current, schedules };
}
