const { request } = require('../request');

function getTimeline(query) {
  return request({ url: '/treatment/timeline', method: 'GET', data: query, failMessage: '加载治疗时间线失败' });
}

function getTreatmentRecord(query) {
  return request({ url: '/treatment/record', method: 'GET', data: query, failMessage: '加载治疗记录失败' });
}

function getTreatmentRecords(query) {
  return request({ url: '/treatment/records', method: 'GET', data: query, failMessage: '加载治疗记录列表失败' });
}

function getSleepReport(query) {
  return request({ url: '/treatment/sleep-report', method: 'GET', data: query, failMessage: '加载睡眠报告失败' });
}

function getDeviceAdjustments(query) {
  return request({ url: '/treatment/adjustments', method: 'GET', data: query, failMessage: '加载设备调整记录失败' });
}

function getDeviceMaintenance(query) {
  return request({ url: '/treatment/device-maintenance', method: 'GET', data: query, failMessage: '加载设备维护记录失败' });
}

function getDeviceFeedback(query) {
  return request({ url: '/treatment/device-feedback', method: 'GET', data: query, failMessage: '加载设备反馈失败' });
}

function submitDeviceFeedback(data) {
  return request({ url: '/treatment/feedback', method: 'POST', data, failMessage: '提交设备反馈失败' });
}

function getWearingRecords(query) {
  return request({ url: '/treatment/wearing-records', method: 'GET', data: query, failMessage: '加载佩戴记录失败' });
}

function getWearingSummary(query) {
  return request({ url: '/treatment/wearing-summary', method: 'GET', data: query, failMessage: '加载佩戴汇总失败' });
}

function submitWearingCheckin(data) {
  return request({ url: '/treatment/wearing', method: 'POST', data, failMessage: '提交佩戴打卡失败' });
}

module.exports = {
  getTimeline,
  getTreatmentRecord,
  getTreatmentRecords,
  getSleepReport,
  getDeviceAdjustments,
  getDeviceMaintenance,
  getDeviceFeedback,
  submitDeviceFeedback,
  getWearingRecords,
  getWearingSummary,
  submitWearingCheckin
};
