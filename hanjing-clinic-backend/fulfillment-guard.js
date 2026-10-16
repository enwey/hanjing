export const FULFILLMENT_PAID_STATUSES = ['paid', 'processing', 'shipping', 'shipped', 'completed'];

export async function lockFulfillmentCase(conn, id, { allowInactiveOrder = false } = {}) {
  const [[reference]] = await conn.execute('SELECT order_id FROM fulfillment_cases WHERE id=?', [id]);
  if (!reference) throw Object.assign(new Error('交付单不存在'), { statusCode: 404 });
  // Match payment/refund lock order so either the workflow or the refund wins atomically.
  const [[order]] = await conn.execute('SELECT status FROM orders WHERE id=? FOR UPDATE', [reference.order_id]);
  if (!order || (!allowInactiveOrder && !FULFILLMENT_PAID_STATUSES.includes(order.status))) {
    throw Object.assign(new Error('订单未支付、退款中或已退款，不能继续交付'), { statusCode: 409 });
  }
  const [[row]] = await conn.execute('SELECT * FROM fulfillment_cases WHERE id=? FOR UPDATE', [id]);
  if (!row || Number(row.order_id) !== Number(reference.order_id)) {
    throw Object.assign(new Error('交付单已变化，请刷新'), { statusCode: 409 });
  }
  return row;
}
