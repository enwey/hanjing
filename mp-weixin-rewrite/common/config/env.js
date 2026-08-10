const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const systemInfo = (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
const isDevtools = systemInfo.platform === 'devtools';
const devApiHosts = isDevtools ? ['192.168.2.55', '127.0.0.1', 'localhost'] : ['192.168.2.55'];
const forceLocalApi = false;
const localApiBaseUrls = devApiHosts.map((host) => 'http://' + host + ':5005/api/v1');

const apiBaseUrlMap = {
  develop: localApiBaseUrls,
  trial: 'https://m.hanjinghealth.com/api/v1',
  release: 'https://m.hanjinghealth.com/api/v1',
};

const apiBaseUrl = forceLocalApi ? localApiBaseUrls : apiBaseUrlMap[envVersion] || apiBaseUrlMap.release;

module.exports = {
  envVersion,
  apiBaseUrl: Array.isArray(apiBaseUrl) ? apiBaseUrl[0] : apiBaseUrl,
  apiBaseUrls: Array.isArray(apiBaseUrl) ? apiBaseUrl : [apiBaseUrl],
};
