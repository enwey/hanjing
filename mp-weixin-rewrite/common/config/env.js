const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';

const API_ENV_OVERRIDE_KEY = 'debug_api_env_override';
const localApiBaseUrl = 'http://127.0.0.1:5005/api/v1';
const productionApiBaseUrl = 'https://m.hanjinghealth.com/api/v1';

const apiBaseUrlMap = {
  local: localApiBaseUrl,
  production: productionApiBaseUrl,
};

function readApiEnvOverride() {
  try {
    const value = String(wx.getStorageSync(API_ENV_OVERRIDE_KEY) || '').trim();
    return value && apiBaseUrlMap[value] ? value : '';
  } catch (error) {
    return '';
  }
}

function getDefaultApiEnv() {
  return envVersion === 'develop' ? 'local' : 'production';
}

function getCurrentApiEnv() {
  const override = readApiEnvOverride();
  return override || getDefaultApiEnv();
}

function getApiBaseUrl() {
  return apiBaseUrlMap[getCurrentApiEnv()] || productionApiBaseUrl;
}

function getApiBaseUrls() {
  const current = getApiBaseUrl();
  const candidates = [current];
  Object.keys(apiBaseUrlMap).forEach((key) => {
    const url = apiBaseUrlMap[key];
    if (url && candidates.indexOf(url) === -1) {
      candidates.push(url);
    }
  });
  return candidates;
}

function setApiEnvOverride(value) {
  try {
    const nextValue = String(value || '').trim();
    if (!nextValue) {
      wx.removeStorageSync(API_ENV_OVERRIDE_KEY);
      return;
    }
    if (apiBaseUrlMap[nextValue]) {
      wx.setStorageSync(API_ENV_OVERRIDE_KEY, nextValue);
    }
  } catch (error) {}
}

function getApiEnvOptions() {
  return [
    { key: 'local', label: '本地环境', baseUrl: localApiBaseUrl },
    { key: 'production', label: '正式环境', baseUrl: productionApiBaseUrl },
  ];
}

const exportsObject = {
  envVersion,
  localApiBaseUrl,
  productionApiBaseUrl,
  getCurrentApiEnv,
  getApiBaseUrl,
  getApiBaseUrls,
  setApiEnvOverride,
  getApiEnvOptions,
};

Object.defineProperty(exportsObject, 'apiBaseUrl', {
  enumerable: true,
  get: getApiBaseUrl,
});

Object.defineProperty(exportsObject, 'apiBaseUrls', {
  enumerable: true,
  get: getApiBaseUrls,
});

module.exports = exportsObject;
