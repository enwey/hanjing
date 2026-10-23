import { get, transaction } from './db.js';
import { businessError } from './distribution-ledger.js';
import { syncUserMembership } from './membership.js';
import { createWechatRefund, getMissingWechatPayConfig, queryWechatRefund } from './wechatPay.js';

function addressOf(order) {
  try {
    const address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
    if (!address || typeof address !== 'object' || Array.isArray(address)) throw new Error('Invalid refund metadata');
    return address;
  }
  catch { throw businessError('订单退款原始状态无法读取，请人工核对', 409); }
}

async function paymentTradeNo(order, conn) {
  if (order.type !== 'appointment_deposit') return order.order_no;
  const [[appointment]] = await conn.execute('SELECT appointment_no FROM appointments WHERE id=?', [order.appointment_id]);
  if (!appointment) throw businessError('找不到预约原支付单号，请人工核对', 409);
  return appointment.appointment_no;
}

export async function applyRefund(orderId, userId, reason, description = '') {
  return transaction(async conn => {
    const [[order]] = await conn.execute('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, userId]);
    if (!order) throw businessError('订单不存在', 404);
    if (!['paid', 'processing', 'shipping', 'shipped'].includes(order.status) || order.wechat_refund_no) {
      throw businessError('当前状态不支持申请退款', 409);
    }
    const address = addressOf(order);
    Object.assign(address, { refund_from_status: order.status, refund_reason: reason,
      refund_description: description, refund_applied_at: new Date().toISOString() });
    delete address.refund_rejected_at;
    await conn.execute("UPDATE orders SET status = 'refund_pending', shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(address), orderId]);
    await conn.execute("INSERT INTO user_notifications (user_id, title, content, type) VALUES (?, '退款申请已提交', ?, 'order')",
      [userId, `订单 ${order.order_no} 的退款申请已提交，等待审核。`]);
    return order;
  });
}

// Called only with a verified callback or the authenticated payment provider's response.
export async function completeRefund(payload) {
  if ((payload.refund_status || payload.status) !== 'SUCCESS') return false;
  const succeededAt = new Date(payload.success_time || '');
  if (!Number.isFinite(succeededAt.getTime())) throw businessError('退款成功时间缺失，请核对支付渠道', 409);
  return transaction(async conn => {
    const [[order]] = await conn.execute('SELECT * FROM orders WHERE wechat_refund_no = ? FOR UPDATE', [payload.out_refund_no || '']);
    if (!order) throw businessError('未找到对应退款申请', 404);
    if (payload.out_trade_no !== await paymentTradeNo(order, conn) || payload.amount?.currency !== 'CNY' ||
        Number(payload.amount?.refund) !== Number(order.pay_amount) ||
        Number(payload.amount?.total) !== Number(order.pay_amount) || !payload.refund_id) {
      throw businessError('退款结果与订单金额或单号不一致', 409);
    }
    if (order.status === 'refunded') return false;
    if (order.status !== 'refunding') throw businessError('退款状态不一致，请人工核对', 409);
    return settleRefund(conn, order, succeededAt, payload.refund_id);
  });
}

async function settleRefund(conn, order, succeededAt, providerRefundId = null) {
    // Money returned is not proof that a delivered device was returned.
    const [cases] = await conn.execute('SELECT id,status FROM fulfillment_cases WHERE order_id=? FOR UPDATE', [order.id]);
    const [fittings] = await conn.execute(`SELECT f.id FROM fulfillment_fittings f
      JOIN fulfillment_cases c ON c.id=f.fulfillment_case_id WHERE c.order_id=?`, [order.id]);
    const canRestock = ['paid', 'processing', 'shipping'].includes(addressOf(order).refund_from_status)
      && !fittings.length && !cases.some(c => c.status === 'fitted');
    const [items] = await conn.execute(`SELECT oi.product_id, oi.quantity, p.category FROM order_items oi
      JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`, [order.id]);
    for (const item of items) {
      if (item.category !== 'service') {
        await conn.execute('UPDATE products SET stock = stock + ?, sales_count = GREATEST(0, sales_count - ?) WHERE id = ?',
          [canRestock ? item.quantity : 0, addressOf(order).refund_from_status === 'cancelled' ? 0 : item.quantity, item.product_id]);
      }
    }
    const [commissions] = await conn.execute("SELECT * FROM distribution_orders WHERE order_id = ? AND status != 'refunded' ORDER BY distributor_id, id FOR UPDATE", [order.id]);
    for (const commission of commissions) {
      // A paid-out commission creates a real debt; do not hide it by clamping to zero.
      await conn.execute(`UPDATE distributors SET total_commission = total_commission - ?,
        available_commission = available_commission - ? WHERE id = ?`,
      [commission.commission_amount, commission.status === 'settled' ? commission.commission_amount : 0, commission.distributor_id]);
      await conn.execute("UPDATE distribution_orders SET status = 'refunded' WHERE id = ?", [commission.id]);
    }
    await conn.execute(`UPDATE orders SET status = 'refunded', wechat_refund_id = ?,
      refund_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [providerRefundId, succeededAt, order.id]);
    await syncUserMembership(order.user_id, conn);
    for (const distributorId of new Set(commissions.map(row => row.distributor_id))) {
      const [[row]] = await conn.execute("SELECT COUNT(DISTINCT order_id) AS count FROM distribution_orders WHERE distributor_id = ? AND commission_level IN (1,3) AND status != 'refunded'", [distributorId]);
      await conn.execute('UPDATE distributors SET level = ? WHERE id = ?', [row.count >= 50 ? 'diamond' : row.count >= 10 ? 'gold' : 'silver', distributorId]);
    }
    await conn.execute("INSERT INTO user_notifications (user_id, title, content, type) VALUES (?, '退款成功', ?, 'order')",
      [order.user_id, `订单 ${order.order_no} 已确认退款 ¥${(Number(order.pay_amount) / 100).toFixed(2)}。`]);
    return true;
}

export async function registerOfflineRefund(orderId, actorId, input) {
  input ||= {};
  const amount = input.amount;
  const method = input.method;
  const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
  const evidence = typeof input.evidence === 'string' ? input.evidence.trim() : '';
  const refundedAt = new Date(input.refunded_at || '');
  if (input.confirmed !== true || !Number.isSafeInteger(amount) || amount <= 0 || !['cash', 'bank'].includes(method) ||
      (!reference && !evidence) || reference.length > 150 || evidence.length > 1000 ||
      typeof input.refunded_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.refunded_at) ||
      !Number.isFinite(refundedAt.getTime()) || refundedAt.getTime() > Date.now()) {
    throw businessError('请确认已实际退款，并填写正确金额、方式、实际退款时间及流水或凭证', 400);
  }
  const receipt = { amount, method, refunded_at: refundedAt.toISOString(), reference, evidence };
  return transaction(async conn => {
    const [[actor]] = await conn.execute(`SELECT u.id FROM admin_users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=? AND u.status='online' AND r.status='active' AND r.code='super_admin' FOR UPDATE`, [actorId]);
    if (!actor) throw businessError('只有有效的超级管理员可以登记线下退款', 403);
    const [[order]] = await conn.execute('SELECT * FROM orders WHERE id=? FOR UPDATE', [orderId]);
    if (!order) throw businessError('订单不存在', 404);
    if (!['cash', 'bank'].includes(order.pay_method) || !order.pay_at || order.wechat_refund_no || order.wechat_transaction_id) {
      throw businessError('仅支持已有实际现金或银行转账收款的订单；微信付款请走原路退款', 409);
    }
    if (amount !== Number(order.pay_amount) || refundedAt.getTime() < new Date(order.pay_at).getTime()) {
      throw businessError('仅支持全额退款，金额必须等于实收且退款时间不能早于收款时间', 400);
    }
    const address = addressOf(order);
    if (order.status === 'refunded') {
      if (!address.offline_refund || Object.entries(receipt).some(([key, value]) => address.offline_refund[key] !== value)) {
        throw businessError('该订单已有不同的退款登记，请核对原记录', 409);
      }
      return { status: 'refunded', repeated: true, message: '该笔线下退款已登记，无需重复操作' };
    }
    if (!['paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed', 'refund_pending'].includes(order.status)) {
      throw businessError('当前订单状态不支持线下退款登记', 409);
    }
    if (order.status !== 'refund_pending') address.refund_from_status = order.status;
    if (!['paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed'].includes(address.refund_from_status)) {
      throw businessError('缺少有效退款前状态，请核对原记录', 409);
    }
    address.offline_refund = { ...receipt, actor_id: Number(actorId), registered_at: new Date().toISOString() };
    order.shipping_address = address;
    await conn.execute('UPDATE orders SET shipping_address=? WHERE id=?', [JSON.stringify(address), orderId]);
    await settleRefund(conn, order, refundedAt);
    // The audit record is part of the refund transaction, not a best-effort log.
    await conn.execute(`INSERT INTO audit_logs(admin_id,action,target_type,target_id,details,status)
      VALUES(?,'register_offline_refund','order',?,?,'success')`, [actorId, String(orderId), JSON.stringify(address.offline_refund)]);
    return { status: 'refunded', repeated: false, message: '线下实际退款已登记' };
  });
}

export async function reviewRefund(orderId, approve, actorId, provider = { create: createWechatRefund, missing: getMissingWechatPayConfig }) {
  if (typeof approve !== 'boolean') throw businessError('请明确选择通过或拒绝');
  if (approve && (await provider.missing()).length) throw businessError('微信支付配置未完成，无法发起真实退款', 503);
  const order = await transaction(async conn => {
    const [[actor]] = await conn.execute(`SELECT u.id FROM admin_users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.status = 'online' AND r.status = 'active' AND r.code = 'super_admin' FOR UPDATE`, [actorId]);
    if (!actor) throw businessError('只有有效的超级管理员可以审核退款', 403);
    const [[row]] = await conn.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!row) throw businessError('订单不存在', 404);
    if (!['refund_pending', 'refunding'].includes(row.status) || row.wechat_refund_no) {
      throw businessError('退款已处理或已提交支付渠道，请勿重复审核；处理中订单需核对支付渠道结果', 409);
    }
    const address = addressOf(row);
    if (!approve) {
      if (address.refund_payment_conflict) throw businessError('重复或异常到款不能恢复为正常订单，请核对并退款', 409);
      if (!['paid', 'processing', 'shipping', 'shipped'].includes(address.refund_from_status)) throw businessError('缺少退款前状态，请人工核对', 409);
      const restored = address.refund_from_status;
      delete address.refund_from_status;
      address.refund_rejected_at = new Date().toISOString();
      await conn.execute('UPDATE orders SET status = ?, shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [restored, JSON.stringify(address), orderId]);
      await conn.execute("INSERT INTO user_notifications (user_id, title, content, type) VALUES (?, '退款申请未通过', ?, 'order')",
        [row.user_id, `订单 ${row.order_no} 的退款申请未通过。`]);
      return row;
    }
    if (!['wechat', 'wechat_native', 'wechat_micropay'].includes(row.pay_method) || !row.pay_at || !row.wechat_transaction_id || !Number.isSafeInteger(Number(row.pay_amount)) || Number(row.pay_amount) <= 0) {
      throw businessError('缺少真实微信支付流水或付款金额，请人工核对，不能自动退款', 409);
    }
    row.wechat_refund_no = `HJR${row.id}`;
    row.payment_trade_no = await paymentTradeNo(row, conn);
    // Commit the reference BEFORE requesting the provider. A timeout must not create a second refund.
    await conn.execute("UPDATE orders SET status = 'refunding', wechat_refund_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [row.wechat_refund_no, orderId]);
    return row;
  });
  if (!approve) return { status: 'rejected', message: '已拒绝退款申请' };
  let result;
  try {
    result = await provider.create({ transactionId: order.wechat_transaction_id, outTradeNo: order.payment_trade_no,
      outRefundNo: order.wechat_refund_no, reason: '退款审核通过', refundAmount: order.pay_amount, totalAmount: order.pay_amount });
    if (result.status === 'SUCCESS') await completeRefund(result);
  } catch (error) {
    throw businessError(`退款请求结果尚未确认，请凭退款单号 ${order.wechat_refund_no} 核对微信商户平台，勿重复退款`, 502);
  }
  return { status: result.status === 'SUCCESS' ? 'refunded' : 'refunding', refundNo: order.wechat_refund_no,
    message: result.status === 'SUCCESS' ? '支付渠道已确认退款成功' : '退款已提交支付渠道，尚未确认退款成功' };
}

export async function syncRefund(orderId, actorId, lookup = queryWechatRefund) {
  const actor = await get(`SELECT u.id FROM admin_users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ? AND u.status = 'online' AND r.status = 'active' AND r.code = 'super_admin'`, [actorId]);
  if (!actor) throw businessError('只有有效的超级管理员可以核对退款', 403);
  const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order?.wechat_refund_no) throw businessError('该订单尚未提交支付渠道', 409);
  const result = await lookup(order.wechat_refund_no);
  if (result.out_refund_no !== order.wechat_refund_no) throw businessError('退款查询单号不匹配', 409);
  if (result.status === 'SUCCESS') await completeRefund(result);
  return { status: result.status, message: result.status === 'SUCCESS' ? '支付渠道已确认退款成功' : `支付渠道退款状态：${result.status || '未知'}，尚未确认退款成功` };
}
