const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const devApiHost = '127.0.0.1';

const apiBaseUrlMap = {
  develop: 'http://' + devApiHost + ':5005/api/v1',
  trial: 'https://test-api.hanjing.com/v1',
  release: 'https://api.hanjing.com/v1',
};

module.exports = {
  envVersion,
  apiBaseUrl: apiBaseUrlMap[envVersion] || apiBaseUrlMap.release,
};
