const { request } = require('../request');

function getHomeStats() {
  return request({ url: '/home/stats', method: 'GET', failMessage: '加载首页数据失败' });
}

function getStores(query) {
  return request({ url: '/stores', method: 'GET', data: query, failMessage: '加载门店失败' });
}

function getDoctors(query) {
  return request({ url: '/doctors', method: 'GET', data: query, failMessage: '加载医生失败' });
}

function getSchedules(query) {
  return request({ url: '/schedules', method: 'GET', data: query, failMessage: '加载排班失败' });
}

function getScheduleDates(query) {
  return request({ url: '/schedules/dates', method: 'GET', data: query, failMessage: '加载排班日期失败' });
}

function getTimeSlots(scheduleId) {
  return request({ url: '/schedules/' + scheduleId + '/slots', method: 'GET', failMessage: '加载可预约时段失败' });
}

module.exports = {
  getHomeStats,
  getStores,
  getDoctors,
  getSchedules,
  getScheduleDates,
  getTimeSlots
};
