import crypto from 'node:crypto';
import { businessError } from './distribution-ledger.js';
import { appointmentFeeSnapshot, orderCoversAppointmentFees } from './appointment-workflow.js';
import { transaction, get } from './db.js';
import { syncUserMembership } from './membership.js';
import { createWechatRefund, queryWechatRefund } from './wechatPay.js';

const reference = prefix => prefix + crypto.randomBytes(14).toString('hex');
export const chargeAmount = row => Number(row.consult_fee) + Number(row.deposit_amount);
const online = row => ['wechat', 'wechat_native'].includes(row.payment_method);

async function recordChargeAudit(conn, audit, action, appointmentId, details) {
  if (!audit) return;
  await conn.execute(
    "INSERT INTO audit_logs(admin_id,action,target_type,target_id,details,ip_address,status) VALUES(?,?,'appointment',?,?,?,'success')",
    [audit.actorId, action, String(appointmentId), JSON.stringify(details), audit.ip || null]
  );
}

export async function lockChargeAppointment(conn, id) {
  const [[row]] = await conn.execute('SELECT * FROM appointments WHERE id=? FOR UPDATE', [id]);
  if (!row) throw businessError('预约不存在', 404);
  return row;
}

export async function prepareCharge(conn, appointment, method, verifyReady = null) {
  if (appointment.status !== 'pending_payment') throw businessError('预约不处于待支付状态', 409);
  const fees = appointmentFeeSnapshot(appointment);
  if (chargeAmount(fees) <= 0) throw businessError('该预约无需收费', 400);
  const [orders] = await conn.execute('SELECT * FROM orders WHERE appointment_id=? ORDER BY id', [appointment.id]);
  if (orders.some(order => !['cancelled', 'refunded'].includes(order.status) && orderCoversAppointmentFees(order, appointment))) {
    throw businessError('该预约已有历史收费订单，请处理原订单', 409);
  }
  const [[existing]] = await conn.execute(
    "SELECT * FROM appointment_charges WHERE appointment_id=? AND status NOT IN ('cancelled','refunded') ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [appointment.id]
  );
  if (existing) {
    if (existing.status === 'pending' && existing.payment_method === method &&
        Number(existing.consult_fee) === fees.consult_fee && Number(existing.deposit_amount) === fees.deposit_amount) return existing;
    throw businessError('该预约已有收费单，请先处理原收费单', 409);
  }
  if (verifyReady) await verifyReady();
  const chargeNo = reference('AC');
  const [result] = await conn.execute(
    'INSERT INTO appointment_charges (appointment_id,charge_no,consult_fee,deposit_amount,payment_method) VALUES (?,?,?,?,?)',
    [appointment.id, chargeNo, fees.consult_fee, fees.deposit_amount, method]
  );
  return { id: result.insertId, appointment_id: appointment.id, charge_no: chargeNo, ...fees, status: 'pending', payment_method: method };
}

async function insertRefund(conn, charge, reason) {
  const [[previous]] = await conn.execute('SELECT * FROM appointment_charge_refunds WHERE charge_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE', [charge.id]);
  if (previous) return previous;
  const refundNo = reference('AR');
  const [result] = await conn.execute(
    'INSERT INTO appointment_charge_refunds (charge_id,refund_no,amount,reason) VALUES (?,?,?,?)',
    [charge.id, refundNo, chargeAmount(charge), reason]
  );
  return { id: result.insertId, charge_id: charge.id, refund_no: refundNo, amount: chargeAmount(charge), status: 'pending' };
}

export async function settleCharge(conn, appointment, charge, payment = null, paymentReference = null, audit = null) {
  if (online(charge) && (!payment || payment.trade_state !== 'SUCCESS' || payment.out_trade_no !== charge.charge_no ||
      payment.amount?.currency !== 'CNY' || Number(payment.amount?.total) !== chargeAmount(charge) || !payment.transaction_id)) {
    throw businessError('支付流水与预约收费单不一致', 409);
  }
  if (charge.paid_at) {
    if (!online(charge) || charge.provider_transaction_id === payment.transaction_id) return charge;
    throw businessError('收费单已有其他支付流水', 409);
  }
  if (!['pending', 'cancelled'].includes(charge.status)) throw businessError('收费单状态已变更', 409);
  const [legacyOrders] = await conn.execute('SELECT * FROM orders WHERE appointment_id=? AND pay_at IS NOT NULL', [appointment.id]);
  const fees = appointmentFeeSnapshot(appointment);
  const feesChanged = Number(charge.consult_fee) !== fees.consult_fee || Number(charge.deposit_amount) !== fees.deposit_amount;
  const conflict = feesChanged || charge.status === 'cancelled' || appointment.status !== 'pending_payment' ||
    legacyOrders.some(order => !['cancelled', 'refunded'].includes(order.status) && orderCoversAppointmentFees(order, appointment));
  if (conflict && !online(charge)) throw businessError('预约状态已变更', 409);
  const status = conflict ? 'refund_pending' : 'paid';
  await conn.execute('UPDATE appointment_charges SET status=?,provider_transaction_id=?,payment_reference=?,credited=?,paid_at=CURRENT_TIMESTAMP WHERE id=?',
    [status, payment?.transaction_id || null, paymentReference, conflict ? 0 : 1, charge.id]);
  if (conflict) {
    await insertRefund(conn, charge, '预约已取消或费用已结清，需退还重复付款');
  } else {
    await conn.execute("UPDATE appointments SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending_payment'", [appointment.id]);
    if (appointment.user_id) await syncUserMembership(appointment.user_id, conn, 'appointment_charge');
  }
  await recordChargeAudit(conn, audit, 'collect_appointment_charge', appointment.id,
    { chargeId: charge.id, method: charge.payment_method, amount: chargeAmount(charge), paymentReference });
  return { ...charge, status, paid_at: new Date(), provider_transaction_id: payment?.transaction_id || null };
}

export async function settleOnlineCharge(payment) {
  const ref = await get('SELECT appointment_id FROM appointment_charges WHERE charge_no=?', [payment.out_trade_no]);
  if (!ref) throw businessError('预约收费单不存在', 404);
  return transaction(async conn => {
    const appointment = await lockChargeAppointment(conn, ref.appointment_id);
    const [[charge]] = await conn.execute('SELECT * FROM appointment_charges WHERE charge_no=? FOR UPDATE', [payment.out_trade_no]);
    return settleCharge(conn, appointment, charge, payment);
  });
}

export async function queueCancelledChargeRefunds(conn, appointmentId, reason) {
  const [charges] = await conn.execute('SELECT * FROM appointment_charges WHERE appointment_id=? ORDER BY id FOR UPDATE', [appointmentId]);
  for (const charge of charges) {
    if (charge.status === 'paid') {
      await insertRefund(conn, charge, reason);
      await conn.execute("UPDATE appointment_charges SET status='refund_pending' WHERE id=?", [charge.id]);
    } else if (charge.status === 'pending') {
      await conn.execute("UPDATE appointment_charges SET status='cancelled' WHERE id=?", [charge.id]);
    }
  }
}

export async function completeChargeRefund(payload) {
  const ref = await get('SELECT c.appointment_id FROM appointment_charge_refunds r JOIN appointment_charges c ON c.id=r.charge_id WHERE r.refund_no=?', [payload.out_refund_no]);
  if (!ref) throw businessError('预约退款单不存在', 404);
  return transaction(async conn => {
    const appointment = await lockChargeAppointment(conn, ref.appointment_id);
    const [[row]] = await conn.execute('SELECT r.*,c.charge_no,c.consult_fee,c.deposit_amount,c.provider_transaction_id FROM appointment_charge_refunds r JOIN appointment_charges c ON c.id=r.charge_id WHERE r.refund_no=? FOR UPDATE', [payload.out_refund_no]);
    if (!row || payload.out_trade_no !== row.charge_no ||
        (payload.transaction_id && payload.transaction_id !== row.provider_transaction_id) ||
        Number(payload.amount?.total) !== chargeAmount(row) || Number(payload.amount?.refund) !== Number(row.amount) ||
        (payload.amount?.currency && payload.amount.currency !== 'CNY') || !payload.refund_id) {
      throw businessError('支付渠道退款流水与预约退款单不一致', 409);
    }
    if (row.status === 'refunded') {
      if (row.provider_refund_id !== payload.refund_id) throw businessError('退款流水冲突', 409);
      return 'refunded';
    }
    if (!['refunding','abnormal','closed'].includes(row.status)) throw businessError('退款尚未提交支付渠道', 409);
    const providerStatus = payload.refund_status || payload.status;
    if (providerStatus !== 'SUCCESS') {
      if (providerStatus === 'ABNORMAL' || providerStatus === 'CLOSED') {
        const status = providerStatus === 'ABNORMAL' ? 'abnormal' : 'closed';
        await conn.execute('UPDATE appointment_charge_refunds SET status=?,provider_refund_id=? WHERE id=?',
          [status, payload.refund_id, row.id]);
        return status;
      }
      return row.status;
    }
    await conn.execute("UPDATE appointment_charge_refunds SET status='refunded',provider_refund_id=?,refunded_at=CURRENT_TIMESTAMP WHERE id=?", [payload.refund_id, row.id]);
    await conn.execute("UPDATE appointment_charges SET status='refunded' WHERE id=?", [row.charge_id]);
    if (appointment.user_id) await syncUserMembership(appointment.user_id, conn, 'appointment_refund');
    return 'refunded';
  });
}

export async function submitChargeRefund(appointmentId, chargeId, reason, authorize, provider = createWechatRefund, audit = null) {
  const prepared = await transaction(async conn => {
    const appointment = await lockChargeAppointment(conn, appointmentId);
    authorize(appointment);
    const [[charge]] = await conn.execute('SELECT * FROM appointment_charges WHERE id=? AND appointment_id=? FOR UPDATE', [chargeId, appointmentId]);
    if (!charge || !['paid', 'refund_pending'].includes(charge.status)) throw businessError('收费单不可退款或已提交退款', 409);
    if (!['cancelled', 'no_show'].includes(appointment.status) && charge.status !== 'refund_pending') {
      throw businessError('请先取消预约，再处理退款', 409);
    }
    const refund = await insertRefund(conn, charge, reason);
    if (refund.status !== 'pending') throw businessError('退款已提交，请同步状态', 409);
    const isOnline = online(charge);
    if (isOnline && !charge.provider_transaction_id) throw businessError('缺少微信支付流水', 409);
    const status = isOnline ? 'refunding' : 'refunded';
    await conn.execute('UPDATE appointment_charge_refunds SET status=?,refunded_at=IF(?,CURRENT_TIMESTAMP,NULL) WHERE id=?', [status, !isOnline, refund.id]);
    await conn.execute('UPDATE appointment_charges SET status=? WHERE id=?', [status, charge.id]);
    if (!isOnline && appointment.user_id) await syncUserMembership(appointment.user_id, conn, 'appointment_refund');
    await recordChargeAudit(conn, audit, 'refund_appointment_charge', appointment.id,
      { chargeId: charge.id, refundNo: refund.refund_no, amount: refund.amount, reason, status });
    return { charge, refund, isOnline, status };
  });
  if (!prepared.isOnline) return { status: prepared.status };
  const { charge, refund } = prepared;
  try {
    const result = await provider({ transactionId: charge.provider_transaction_id, outTradeNo: charge.charge_no,
      outRefundNo: refund.refund_no, reason, refundAmount: refund.amount, totalAmount: chargeAmount(charge) });
    return { status: await completeChargeRefund(result), refundNo: refund.refund_no };
  } catch {
    throw businessError('退款提交结果未确认，请同步退款状态，勿重复退款', 502);
  }
}

export async function syncChargeRefund(appointmentId, chargeId, lookup = queryWechatRefund) {
  const row = await get("SELECT r.refund_no FROM appointment_charge_refunds r JOIN appointment_charges c ON c.id=r.charge_id WHERE c.id=? AND c.appointment_id=? AND r.status IN ('refunding','abnormal','closed')", [chargeId, appointmentId]);
  if (!row) throw businessError('没有待同步的预约退款', 404);
  return { status: await completeChargeRefund(await lookup(row.refund_no)), refundNo: row.refund_no };
}

export async function readAppointmentCharge(appointment) {
  const row = await get('SELECT c.*, r.status AS refund_status, r.amount AS refund_amount FROM appointment_charges c LEFT JOIN appointment_charge_refunds r ON r.charge_id=c.id WHERE c.appointment_id=? ORDER BY c.id DESC LIMIT 1', [appointment.id]);
  if (!row) return null;
  return { chargeNo: row.charge_no, status: row.status, refundStatus: row.refund_status,
    amount: chargeAmount(row), refundedAmount: row.refund_status === 'refunded' ? Number(row.refund_amount) : 0,
    canPay: appointment.status === 'pending_payment' && row.status === 'pending' && row.payment_method === 'wechat' };
}
