const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const cloudApiBaseUrl = 'https://m.hanjinghealth.com/api/v1';

const apiBaseUrlMap = {
  develop: cloudApiBaseUrl,
  trial: cloudApiBaseUrl,
  release: cloudApiBaseUrl,
};

const apiBaseUrl = apiBaseUrlMap[envVersion] || apiBaseUrlMap.release;

module.exports = {
  envVersion,
  apiBaseUrl,
  apiBaseUrls: [apiBaseUrl],
};
