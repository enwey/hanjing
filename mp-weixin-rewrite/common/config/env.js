const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const systemInfo = (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
const isDevtools = systemInfo.platform === 'devtools';
const cloudApiBaseUrl = 'https://m.hanjinghealth.com/api/v1';
const devApiHosts = isDevtools ? ['127.0.0.1', 'localhost', '192.168.2.55'] : ['192.168.2.55'];
const forceLocalApi = true;
const localApiBaseUrls = devApiHosts.map((host) => 'http://' + host + ':5005/api/v1');

const apiBaseUrlMap = {
  develop: cloudApiBaseUrl,
  trial: cloudApiBaseUrl,
  release: cloudApiBaseUrl,
};

const apiBaseUrl = forceLocalApi ? localApiBaseUrls : apiBaseUrlMap[envVersion] || apiBaseUrlMap.release;

module.exports = {
  envVersion,
  apiBaseUrl: Array.isArray(apiBaseUrl) ? apiBaseUrl[0] : apiBaseUrl,
  apiBaseUrls: Array.isArray(apiBaseUrl) ? apiBaseUrl : [apiBaseUrl],
};
