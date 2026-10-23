const envConfig = require('../common/config/env');
const miniLog = require('../common/utils/mini-log');

let refreshFlight = null;
let resolvedApiBaseUrl = envConfig.getApiBaseUrl();

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
  const baseUrls = envConfig.getApiBaseUrls();
  const candidates = Array.isArray(baseUrls) && baseUrls.length ? baseUrls : [envConfig.getApiBaseUrl()];
  if (!resolvedApiBaseUrl || candidates.indexOf(resolvedApiBaseUrl) === -1) {
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
            if (options.url === '/auth/wx-login') {
              miniLog.reportNow({
                level: response.statusCode >= 500 ? 'error' : 'warn',
                event: 'login_api_failed_sync',
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
          if (options.url === '/auth/wx-login') {
            miniLog.reportNow({
              level: 'error',
              event: 'login_network_failed_sync',
              message: errMsg,
              apiUrl: options.url,
              method: options.method || 'GET',
              traceId,
              extra: {
                baseUrl: currentBaseUrl,
              },
            });
          }
          tryNext(errMsg);
        },
      });
    };

    tryNext('');
  });
}

function getSessionStore() {
  try {
    return require('../stores/session-store');
  } catch (error) {
    return null;
  }
}

function syncSessionStoreAccessToken(accessToken) {
  try {
    const sessionStore = getSessionStore();
    if (sessionStore && sessionStore.state) {
      sessionStore.state.accessToken = accessToken || '';
    }
  } catch (error) {}
}

function getCurrentAuthMode() {
  try {
    const sessionStore = getSessionStore();
    return sessionStore && typeof sessionStore.getAuthMode === 'function'
      ? sessionStore.getAuthMode()
      : '';
  } catch (error) {
    return '';
  }
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

function getSessionSnapshot() {
  const store = getSessionStore();
  return {
    token: normalizeAccessToken(wx.getStorageSync('access_token')),
    revision: store && typeof store.getRevision === 'function' ? store.getRevision() : 0,
  };
}

function isCurrentSession(snapshot) {
  const current = getSessionSnapshot();
  return current.token === snapshot.token && current.revision === snapshot.revision;
}

function clearCurrentSession(snapshot) {
  if (!isCurrentSession(snapshot)) return;
  const store = getSessionStore();
  if (store && typeof store.clearLoginState === 'function') {
    store.clearLoginState();
  } else {
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('auth_mode');
    syncSessionStoreAccessToken('');
  }
}

function refreshAccessToken(snapshot) {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        if (!isCurrentSession(snapshot)) {
          reject(createRequestError('登录状态已变更，请重新发起请求', 401));
          return;
        }
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
          if (!isCurrentSession(snapshot)) {
            reject(createRequestError('登录状态已变更，请重新发起请求', 401));
            return;
          }
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
          const sessionStore = getSessionStore();
          if (sessionStore && typeof sessionStore.setAccessToken === 'function') {
            sessionStore.setAccessToken(payload.access_token, { isRefresh: true });
          } else {
            wx.setStorageSync('access_token', payload.access_token);
            syncSessionStoreAccessToken(payload.access_token);
          }
          if (sessionStore && typeof sessionStore.setAuthMode === 'function') {
            sessionStore.setAuthMode('wechat');
          }
          resolve({ token: payload.access_token, snapshot: getSessionSnapshot() });
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

function retryRequestWithToken(options, refreshed, resolve, reject) {
  const { token, snapshot } = refreshed;
  if (!isCurrentSession(snapshot)) {
    reject(createRequestError('登录状态已变更，请重新发起请求', 401));
    return;
  }
  executeWxRequest(options, token)
    .then(({ response }) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response.data);
        return;
      }
      if (response.statusCode === 401) {
        clearCurrentSession(snapshot);
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

  const snapshot = getSessionSnapshot();
  return new Promise((resolve, reject) => {
    executeWxRequest(options, token)
      .then(({ response }) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }

        if (response.statusCode === 401 && options.url !== '/auth/wx-login' && options.url !== '/auth/password-login') {
          // A response belongs to the session that issued the request, not a later login.
          if (!isCurrentSession(snapshot)) {
            reject(createRequestError('登录状态已变更，请重新发起请求', 401));
            return;
          }
          if (getCurrentAuthMode() !== 'wechat') {
            clearCurrentSession(snapshot);
            reject(createRequestError(
              (response.data && response.data.message) || '登录已失效，请重新登录',
              response.statusCode,
              response.data,
            ));
            return;
          }

          // Share only within the same session generation. Logout/new login invalidates
          // the old flight without allowing its completion to overwrite the new one.
          if (!refreshFlight || refreshFlight.snapshot.revision !== snapshot.revision ||
              refreshFlight.snapshot.token !== snapshot.token) {
            const flight = { snapshot };
            flight.promise = refreshAccessToken(snapshot)
              .catch((error) => {
                clearCurrentSession(snapshot);
                throw error;
              })
              .finally(() => {
                if (refreshFlight === flight) refreshFlight = null;
              });
            refreshFlight = flight;
          }
          refreshFlight.promise
            .then((refreshed) => {
              retryRequestWithToken(options, refreshed, resolve, reject);
            })
            .catch(reject);
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
  get apiBaseUrl() {
    return resolvedApiBaseUrl || envConfig.getApiBaseUrl();
  },
  request,
  createRequestError,
};
