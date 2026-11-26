function isPaymentTimeout(error) {
  return [408, 504].includes(Number(error?.statusCode)) ||
    /timeout|超时/i.test(String(error?.errMsg || error?.message || ''));
}

function needsOrderStateRefresh(error) {
  const reason = error?.data?.reason;
  return reason === 'ORDER_STATE_CHANGED' || reason === 'ORDER_PAYMENT_CLOSED' ||
    ['订单状态已变更', '订单非待支付状态'].includes(error?.message);
}

async function reconcileOrderPayment(api, orderId, isCurrent) {
  async function readOrder() {
    try {
      const response = await api.getOrderDetail(orderId);
      return response?.data || response;
    } catch (error) {
      if ([401, 403, 404].includes(Number(error?.statusCode))) throw error;
      return null;
    }
  }

  if (!isCurrent()) return {};
  const order = await readOrder();
  if (!isCurrent() || (order?.status && !['pending', 'cancelled'].includes(order.status))) return { order };

  try {
    await api.confirmOrderPayment(orderId);
  } catch (error) {
    if (error?.data?.reason === 'ORDER_PAYMENT_CLOSED') return { order, closed: true };
    if (error?.data?.reason === 'ORDER_PAYMENT_UNPAID') return { order, unpaid: true };
    // The confirmation may still commit even if the response was lost.
    if (!isPaymentTimeout(error)) return { order };
    return { order: isCurrent() ? await readOrder() : null };
  }
  return { confirmed: true, order: isCurrent() ? await readOrder() : null };
}

async function prepareOrderPayment(api, orderId, options, isCurrent, canRetry) {
  const pay = () => api.payOrder(orderId, options);
  try {
    return { response: await pay() };
  } catch (error) {
    if (!needsOrderStateRefresh(error)) throw error;
  }
  const reconcile = () => reconcileOrderPayment(api, orderId, isCurrent).catch(() => ({}));
  const resolution = await reconcile();
  if (!isCurrent() || !resolution.unpaid || !canRetry(resolution.order)) return { resolution };
  try {
    return { response: await pay() };
  } catch (error) {
    if (!needsOrderStateRefresh(error)) throw error;
    return { resolution: await reconcile() };
  }
}

module.exports = { isPaymentTimeout, needsOrderStateRefresh, prepareOrderPayment, reconcileOrderPayment };
