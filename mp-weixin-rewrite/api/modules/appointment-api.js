const { request } = require('../request');

function getAppointments(query) {
  return request({ url: '/appointments', method: 'GET', data: query, failMessage: '加载预约列表失败' });
}

function getAppointmentDetail(appointmentId) {
  return request({ url: '/appointments/' + appointmentId, method: 'GET', failMessage: '加载预约详情失败' });
}

function createAppointment(data) {
  return request({ url: '/appointments', method: 'POST', data, failMessage: '创建预约失败' });
}

function cancelAppointment(appointmentId, reason) {
  return request({ url: '/appointments/' + appointmentId + '/cancel', method: 'POST', data: { reason }, failMessage: '取消预约失败' });
}

function rescheduleAppointment(appointmentId, data) {
  return request({ url: '/appointments/' + appointmentId + '/reschedule', method: 'POST', data, failMessage: '改约失败' });
}

function payAppointmentDeposit(appointmentId) {
  return request({ url: '/appointments/' + appointmentId + '/pay', method: 'POST', failMessage: '支付预约定金失败' });
}

function confirmAppointmentPayment(appointmentId) {
  return request({ url: '/appointments/' + appointmentId + '/confirm-pay', method: 'POST', failMessage: '确认预约支付失败' });
}

function submitAppointmentEvaluation(appointmentId, data) {
  return request({ url: '/appointments/' + appointmentId + '/evaluation', method: 'POST', data, failMessage: '提交就诊评价失败' });
}

function getBookingSettings() {
  return request({ url: '/settings/booking', method: 'GET', failMessage: '加载预约设置失败' });
}

module.exports = {
  getAppointments,
  getAppointmentDetail,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  payAppointmentDeposit,
  confirmAppointmentPayment,
  submitAppointmentEvaluation,
  getBookingSettings
};
