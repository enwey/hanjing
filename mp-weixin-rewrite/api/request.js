const { apiBaseUrl } = require('../common/config/env');

let isRefreshing = false;
let requestQueue = [];

function createRequestError(message, statusCode, data) {
  const error = new Error(message || '请求失败，请稍后重试');
  error.statusCode = statusCode;
  error.data = data;
  return error;
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
        wx.request({
          url: apiBaseUrl + '/auth/wx-login',
          method: 'POST',
          data: { code: loginResult.code },
          header: { 'content-type': 'application/json' },
          timeout: 10000,
          success(response) {
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
          },
          fail() {
            reject(createRequestError('登录授权失败'));
          },
        });
      },
      fail() {
        reject(createRequestError('登录授权失败'));
      },
    });
  });
}

function retryRequestWithToken(options, token, resolve, reject) {
  const headers = Object.assign({ 'content-type': 'application/json' }, options.header || {});
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  wx.request({
    url: apiBaseUrl + options.url,
    method: options.method || 'GET',
    data: options.data,
    header: headers,
    timeout: options.timeout || 10000,
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response.data);
        return;
      }
      reject(createRequestError(
        (response.data && response.data.message) || options.failMessage || '请求失败，请稍后重试',
        response.statusCode,
        response.data,
      ));
    },
    fail() {
      reject(createRequestError(options.failMessage || '网络连接失败，请稍后重试'));
    },
  });
}

function request(options) {
  const token = wx.getStorageSync('access_token');
  const headers = Object.assign({ 'content-type': 'application/json' }, options.header || {});
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBaseUrl + options.url,
      method: options.method || 'GET',
      data: options.data,
      header: headers,
      timeout: options.timeout || 10000,
      success(response) {
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
      },
      fail() {
        reject(createRequestError(options.failMessage || '网络连接失败，请稍后重试'));
      },
    });
  });
}

module.exports = {
  apiBaseUrl,
  request,
  createRequestError,
};
