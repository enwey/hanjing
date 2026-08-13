const { request } = require('../request');

function getHomeStats() {
  return request({ url: '/home/stats', method: 'GET', failMessage: '加载首页数据失败' });
}

module.exports = {
  getHomeStats,
};
