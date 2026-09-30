import { get, transaction } from './db.js';
import { businessError } from './distribution-ledger.js';
import { syncUserMembership } from './membership.js';
import { createWechatRefund, getMissingWechatPayConfig, queryWechatRefund } from './wechatPay.js';

function addressOf(order) {
  try { return typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {}); }
  catch { throw businessError('订单退款原始状态无法读取，请人工核对', 409); }
}

export async function applyRefund(orderId, userId, reason, description = '') {
  return transaction(async conn => {
    const [[order]] = await conn.execute('SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE', [orderId, userId]);
    if (!order) throw businessError('订单不存在', 404);
    if (!['paid', 'shipping', 'shipped'].includes(order.status) || order.wechat_refund_no) {
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
    if (payload.out_trade_no !== order.order_no || payload.amount?.currency !== 'CNY' ||
        Number(payload.amount?.refund) !== Number(order.pay_amount) ||
        Number(payload.amount?.total) !== Number(order.pay_amount) || !payload.refund_id) {
      throw businessError('退款结果与订单金额或单号不一致', 409);
    }
    if (order.status === 'refunded') return false;
    if (order.status !== 'refunding') throw businessError('退款状态不一致，请人工核对', 409);
    const [items] = await conn.execute(`SELECT oi.product_id, oi.quantity, p.category FROM order_items oi
      JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`, [order.id]);
    for (const item of items) {
      if (item.category !== 'service' && ['paid', 'shipping'].includes(addressOf(order).refund_from_status)) {
        await conn.execute('UPDATE products SET stock = stock + ?, sales_count = GREATEST(0, sales_count - ?) WHERE id = ?',
          [item.quantity, item.quantity, item.product_id]);
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
      refund_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [payload.refund_id, succeededAt, order.id]);
    await syncUserMembership(order.user_id, conn);
    for (const distributorId of new Set(commissions.map(row => row.distributor_id))) {
      const [[row]] = await conn.execute("SELECT COUNT(DISTINCT order_id) AS count FROM distribution_orders WHERE distributor_id = ? AND commission_level = 1 AND status != 'refunded'", [distributorId]);
      await conn.execute('UPDATE distributors SET level = ? WHERE id = ?', [row.count >= 50 ? 'diamond' : row.count >= 10 ? 'gold' : 'silver', distributorId]);
    }
    await conn.execute("INSERT INTO user_notifications (user_id, title, content, type) VALUES (?, '退款成功', ?, 'order')",
      [order.user_id, `订单 ${order.order_no} 已确认退款 ¥${(Number(order.pay_amount) / 100).toFixed(2)}。`]);
    return true;
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
      if (!['paid', 'shipping', 'shipped'].includes(address.refund_from_status)) throw businessError('缺少退款前状态，请人工核对', 409);
      const restored = address.refund_from_status;
      delete address.refund_from_status;
      address.refund_rejected_at = new Date().toISOString();
      await conn.execute('UPDATE orders SET status = ?, shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [restored, JSON.stringify(address), orderId]);
      await conn.execute("INSERT INTO user_notifications (user_id, title, content, type) VALUES (?, '退款申请未通过', ?, 'order')",
        [row.user_id, `订单 ${row.order_no} 的退款申请未通过。`]);
      return row;
    }
    if (row.pay_method !== 'wechat' || !row.pay_at || !row.wechat_transaction_id || !Number.isSafeInteger(Number(row.pay_amount)) || Number(row.pay_amount) <= 0) {
      throw businessError('缺少真实微信支付流水或付款金额，请人工核对，不能自动退款', 409);
    }
    row.wechat_refund_no = `HJR${row.id}`;
    // Commit the reference BEFORE requesting the provider. A timeout must not create a second refund.
    await conn.execute("UPDATE orders SET status = 'refunding', wechat_refund_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [row.wechat_refund_no, orderId]);
    return row;
  });
  if (!approve) return { status: 'rejected', message: '已拒绝退款申请' };
  let result;
  try {
    result = await provider.create({ transactionId: order.wechat_transaction_id, outTradeNo: order.order_no,
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
