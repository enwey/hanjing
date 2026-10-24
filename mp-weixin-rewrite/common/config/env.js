const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const envVersion = miniProgram.envVersion || 'develop';
let runtimePlatform = '';
try {
  const systemInfo = (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
  runtimePlatform = String(systemInfo.platform || '').toLowerCase();
} catch (error) {}
const canUseLocalApi = envVersion === 'develop' && runtimePlatform === 'devtools';

const API_ENV_OVERRIDE_KEY = 'debug_api_env_override';
const localApiBaseUrl = 'http://127.0.0.1:5005/api/v1';
const productionApiBaseUrl = 'https://m.xingkangming.com/api/v1';

const apiBaseUrlMap = {
  local: localApiBaseUrl,
  production: productionApiBaseUrl,
};

function readApiEnvOverride() {
  if (!canUseLocalApi) return '';
  try {
    const value = String(wx.getStorageSync(API_ENV_OVERRIDE_KEY) || '').trim();
    return value && apiBaseUrlMap[value] ? value : '';
  } catch (error) {
    return '';
  }
}

function getDefaultApiEnv() {
  // A real-device preview is also reported as `develop`. Defaulting develop
  // builds to 127.0.0.1 makes the phone call itself instead of the backend.
  // Developers can still explicitly select the local API from the debug switch.
  return 'production';
}

function getCurrentApiEnv() {
  const override = readApiEnvOverride();
  return override || getDefaultApiEnv();
}

function getApiBaseUrl() {
  return apiBaseUrlMap[getCurrentApiEnv()] || productionApiBaseUrl;
}

function getApiBaseUrls() {
  return [getApiBaseUrl()];
}

function setApiEnvOverride(value) {
  if (!canUseLocalApi) return;
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
  runtimePlatform,
  canUseLocalApi,
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
