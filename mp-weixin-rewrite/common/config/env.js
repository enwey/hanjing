const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const localApiBaseUrl = 'http://192.168.2.41:5005/api/v1';
const productionApiBaseUrl = 'https://m.hanjinghealth.com/api/v1';

const apiBaseUrlMap = {
  develop: localApiBaseUrl,
  trial: productionApiBaseUrl,
  release: productionApiBaseUrl,
};

const resolvedApiBaseUrl = apiBaseUrlMap[envVersion] || productionApiBaseUrl;

module.exports = {
  envVersion,
  apiBaseUrl: resolvedApiBaseUrl,
  apiBaseUrls: [resolvedApiBaseUrl],
};
