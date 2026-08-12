const { apiBaseUrl, apiBaseUrls } = require('../common/config/env');
const miniLog = require('../common/utils/mini-log');

let isRefreshing = false;
let requestQueue = [];
let resolvedApiBaseUrl = apiBaseUrl;

function createRequestError(message, statusCode, data) {
  const error = new Error(message || '请求失败，请稍后重试');
  error.statusCode = statusCode;
  error.data = data;
  return error;
}

function normalizeAccessToken(token) {
  const text = token === null || token === undefined ? '' : String(token);
  if (!text) {
    return '';
  }
  const normalized = text.trim().replace(/[^\x20-\x7E]/g, '');
  if (!normalized) {
    return '';
  }
  if (!/^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function getRequestBaseUrls() {
  const candidates = Array.isArray(apiBaseUrls) && apiBaseUrls.length ? apiBaseUrls : [apiBaseUrl];
  if (!resolvedApiBaseUrl) {
    return candidates;
  }
  const ordered = [resolvedApiBaseUrl];
  candidates.forEach((item) => {
    if (item && item !== resolvedApiBaseUrl) {
      ordered.push(item);
    }
  });
  return ordered;
}

function executeWxRequest(options, token) {
  const baseUrls = getRequestBaseUrls();
  const headers = Object.assign({ 'content-type': 'application/json' }, options.header || {});
  const traceId = options.traceId || miniLog.createTraceId();
  headers['X-Trace-Id'] = traceId;
  const safeToken = normalizeAccessToken(token);
  if (safeToken) {
    headers.Authorization = 'Bearer ' + safeToken;
  }

  return new Promise((resolve, reject) => {
    let currentIndex = 0;

    const tryNext = (lastErrorMessage) => {
      if (currentIndex >= baseUrls.length) {
        reject(createRequestError(lastErrorMessage || options.failMessage || '网络连接失败，请稍后重试'));
        return;
      }

      const currentBaseUrl = baseUrls[currentIndex];
      currentIndex += 1;

      wx.request({
        url: currentBaseUrl + options.url,
        method: options.method || 'GET',
        data: options.data,
        header: headers,
        timeout: options.timeout || 10000,
        success(response) {
          resolvedApiBaseUrl = currentBaseUrl;
          if (response.statusCode < 200 || response.statusCode >= 300) {
            miniLog.report({
              level: response.statusCode >= 500 ? 'error' : 'warn',
              event: options.url === '/auth/wx-login' ? 'login_api_failed' : 'api_response_failed',
              message: (response.data && response.data.message) || options.failMessage || 'api response failed',
              apiUrl: options.url,
              method: options.method || 'GET',
              statusCode: response.statusCode,
              traceId,
              extra: {
                baseUrl: currentBaseUrl,
                responseCode: response.data && response.data.code,
              },
            });
          }
          resolve({
            response,
            baseUrl: currentBaseUrl,
            traceId,
          });
        },
        fail(error) {
          const errMsg = (error && error.errMsg) || options.failMessage || '网络连接失败，请稍后重试';
          miniLog.report({
            level: 'error',
            event: options.url === '/auth/wx-login' ? 'login_network_failed' : 'api_network_failed',
            message: errMsg,
            apiUrl: options.url,
            method: options.method || 'GET',
            traceId,
            extra: {
              baseUrl: currentBaseUrl,
            },
          });
          tryNext(errMsg);
        },
      });
    };

    tryNext('');
  });
}

function syncSessionStoreAccessToken(accessToken) {
  try {
    const sessionStore = require('../stores/session-store');
    if (sessionStore && sessionStore.state) {
      sessionStore.state.accessToken = accessToken || '';
    }
  } catch (error) {}
}

function extractRefreshPayload(responseData) {
  if (!responseData) {
    return {};
  }
  if (responseData.code === 0 && responseData.data) {
    return responseData.data;
  }
  return responseData.data || responseData;
}

function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        if (!loginResult || !loginResult.code) {
          reject(createRequestError('登录授权失败'));
          return;
        }
        executeWxRequest({
          url: '/auth/wx-login',
          method: 'POST',
          data: { code: loginResult.code },
          header: { 'content-type': 'application/json' },
          timeout: 10000,
          failMessage: '登录授权失败',
        }).then(({ response }) => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(createRequestError(
              (response.data && response.data.message) || '登录授权失败',
              response.statusCode,
              response.data,
            ));
            return;
          }
          const payload = extractRefreshPayload(response.data);
          if (!payload || !payload.access_token) {
            reject(createRequestError('登录授权失败'));
            return;
          }
          wx.setStorageSync('access_token', payload.access_token);
          syncSessionStoreAccessToken(payload.access_token);
          resolve(payload.access_token);
        }).catch((error) => {
          reject(createRequestError((error && error.message) || '登录授权失败'));
        });
      },
      fail() {
        reject(createRequestError('登录授权失败'));
      },
    });
  });
}

function retryRequestWithToken(options, token, resolve, reject) {
  executeWxRequest(options, token)
    .then(({ response }) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response.data);
        return;
      }
      reject(createRequestError(
        (response.data && response.data.message) || options.failMessage || '请求失败，请稍后重试',
        response.statusCode,
        response.data,
      ));
    })
    .catch((error) => {
      reject(createRequestError((error && error.message) || options.failMessage || '网络连接失败，请稍后重试'));
    });
}

function request(options) {
  const rawToken = wx.getStorageSync('access_token');
  const token = normalizeAccessToken(rawToken);
  if (rawToken && !token) {
    wx.removeStorageSync('access_token');
    syncSessionStoreAccessToken('');
  }

  return new Promise((resolve, reject) => {
    executeWxRequest(options, token)
      .then(({ response }) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }

        if (response.statusCode === 401 && options.url !== '/auth/wx-login') {
          wx.removeStorageSync('access_token');
          syncSessionStoreAccessToken('');

          if (isRefreshing) {
            requestQueue.push((newToken) => {
              retryRequestWithToken(options, newToken, resolve, reject);
            });
            return;
          }

          isRefreshing = true;
          refreshAccessToken()
            .then((newToken) => {
              isRefreshing = false;
              requestQueue.forEach((callback) => callback(newToken));
              requestQueue = [];
              retryRequestWithToken(options, newToken, resolve, reject);
            })
            .catch((error) => {
              isRefreshing = false;
              requestQueue = [];
              reject(error);
            });
          return;
        }

        reject(createRequestError(
          (response.data && response.data.message) || options.failMessage || '请求失败，请稍后重试',
          response.statusCode,
          response.data,
        ));
      })
      .catch((error) => {
        reject(createRequestError(
          (error && error.message) || options.failMessage || '网络连接失败，请稍后重试',
        ));
      });
  });
}

module.exports = {
  apiBaseUrl,
  request,
  createRequestError,
};
