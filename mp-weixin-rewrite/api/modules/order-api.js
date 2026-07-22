const { request } = require('../request');

function getOrders(query) {
  return request({ url: '/orders', method: 'GET', data: query, failMessage: '加载订单列表失败' });
}

function getOrderDetail(orderId) {
  return request({ url: '/orders/' + orderId, method: 'GET', failMessage: '加载订单详情失败' });
}

function createOrder(data) {
  return request({ url: '/orders', method: 'POST', data, failMessage: '创建订单失败' });
}

function payOrder(orderId) {
  return request({ url: '/orders/' + orderId + '/pay', method: 'POST', failMessage: '发起订单支付失败' });
}

function confirmOrderPayment(orderId) {
  return request({ url: '/orders/' + orderId + '/confirm-pay', method: 'POST', failMessage: '确认订单支付失败' });
}

function cancelOrder(orderId) {
  return request({ url: '/orders/' + orderId + '/cancel', method: 'POST', failMessage: '取消订单失败' });
}

function confirmReceipt(orderId) {
  return request({ url: '/orders/' + orderId + '/confirm-receipt', method: 'POST', failMessage: '确认收货失败' });
}

function applyRefund(orderId, data) {
  return request({ url: '/orders/' + orderId + '/refund', method: 'POST', data: data || {}, failMessage: '申请退款失败' });
}

function getOrderLogistics(orderId) {
  return request({ url: '/orders/' + orderId + '/logistics', method: 'GET', failMessage: '加载物流轨迹失败' });
}

module.exports = {
  getOrders,
  getOrderDetail,
  createOrder,
  payOrder,
  confirmOrderPayment,
  cancelOrder,
  confirmReceipt,
  applyRefund,
  getOrderLogistics
};
