const { request } = require('../request');

function getTreatmentRecord(query) {
  return request({ url: '/treatment/record', method: 'GET', data: query, failMessage: '加载佩戴记录失败' });
}

function getSleepReport(query) {
  return request({ url: '/treatment/sleep-report', method: 'GET', data: query, failMessage: '加载睡眠报告失败' });
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
  getTreatmentRecord,
  getSleepReport,
  getWearingRecords,
  getWearingSummary,
  submitWearingCheckin
};
