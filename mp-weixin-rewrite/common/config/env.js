const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const devApiHosts = ['localhost', '127.0.0.1'];

const apiBaseUrlMap = {
  develop: devApiHosts.map((host) => 'http://' + host + ':5005/api/v1'),
  trial: 'https://test-api.hanjing.com/v1',
  release: 'https://api.hanjing.com/v1',
};

const apiBaseUrl = apiBaseUrlMap[envVersion] || apiBaseUrlMap.release;

module.exports = {
  envVersion,
  apiBaseUrl: Array.isArray(apiBaseUrl) ? apiBaseUrl[0] : apiBaseUrl,
  apiBaseUrls: Array.isArray(apiBaseUrl) ? apiBaseUrl : [apiBaseUrl],
};
