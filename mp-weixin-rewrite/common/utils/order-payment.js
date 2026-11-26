function isPaymentTimeout(error) {
  return [408, 504].includes(Number(error?.statusCode)) ||
    /timeout|超时/i.test(String(error?.errMsg || error?.message || ''));
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
  if (!isCurrent() || (order?.status && order.status !== 'pending')) return { order };

  try {
    await api.confirmOrderPayment(orderId);
  } catch (error) {
    if (error?.data?.reason === 'ORDER_PAYMENT_UNPAID') return { order, unpaid: true };
    // The confirmation may still commit even if the response was lost.
    if (!isPaymentTimeout(error)) return { order };
    return { order: isCurrent() ? await readOrder() : null };
  }
  return { confirmed: true, order: isCurrent() ? await readOrder() : null };
}

module.exports = { isPaymentTimeout, reconcileOrderPayment };
