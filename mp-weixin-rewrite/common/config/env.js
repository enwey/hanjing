const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
const cloudApiBaseUrl = 'https://m.hanjinghealth.com/api/v1';
const trialApiBaseUrl = 'https://test-api.hanjing.com/v1';
const releaseApiBaseUrl = 'https://api.hanjing.com/v1';

const apiBaseUrlMap = {
  develop: cloudApiBaseUrl,
  trial: trialApiBaseUrl,
  release: releaseApiBaseUrl,
};

const apiBaseUrl = apiBaseUrlMap[envVersion] || apiBaseUrlMap.release;

module.exports = {
  envVersion,
  apiBaseUrl,
  apiBaseUrls: [apiBaseUrl],
};
