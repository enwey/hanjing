const api = require('../api/index');
const miniLog = require('../common/utils/mini-log');

function decodeBase64Url(input) {
  if (!input) {
    return '';
  }
  let normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  try {
    return wx.base64ToArrayBuffer
      ? String.fromCharCode.apply(null, new Uint8Array(wx.base64ToArrayBuffer(normalized)))
      : '';
  } catch (error) {
    return '';
  }
}

function parseJwtPayload(token) {
  const text = String(token || '');
  const parts = text.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payloadText = decodeBase64Url(parts[1]);
    return payloadText ? JSON.parse(payloadText) : null;
  } catch (error) {
    return null;
  }
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

function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return now >= Number(payload.exp || 0);
}

function readStoredAccessToken() {
  const rawToken = wx.getStorageSync('access_token') || '';
  const token = normalizeAccessToken(rawToken);
  if (!token) {
    if (rawToken) {
      wx.removeStorageSync('access_token');
    }
    return '';
  }
  if (isTokenExpired(token)) {
    wx.removeStorageSync('access_token');
    return '';
  }
  return token;
}

const sessionStore = {
  state: {
    accessToken: readStoredAccessToken(),
    profile: null,
    currentPatientId: wx.getStorageSync('current_patient_id') || '',
  },

  isLoggedIn() {
    const token = readStoredAccessToken();
    this.state.accessToken = token;
    return Boolean(token);
  },
  setAccessToken(accessToken) {
    this.state.accessToken = accessToken || '';
    if (accessToken) { wx.setStorageSync("access_token", accessToken); } else { wx.removeStorageSync("access_token"); }
  },
  setCurrentPatientId(patientId) {
    this.state.currentPatientId = patientId || '';
    if (patientId) { wx.setStorageSync("current_patient_id", patientId); } else { wx.removeStorageSync("current_patient_id"); }
  },
  async fetchProfile(options = {}) {
    const traceId = options.traceId || '';
    const shouldReport = Boolean(traceId || options.source);
    if (shouldReport) {
      miniLog.report({
        level: 'info',
        event: 'profile_request',
        message: 'request user profile',
        apiUrl: '/user/profile',
        method: 'GET',
        traceId,
        extra: {
          source: options.source || '',
        },
      });
    }
    try {
      const response = await api.getUserProfile({ traceId });
      this.state.profile = response.data || response;
      if (shouldReport) {
        miniLog.report({
          level: 'info',
          event: 'profile_success',
          message: 'user profile loaded',
          traceId,
          extra: {
            source: options.source || '',
            hasProfile: Boolean(this.state.profile),
            userId: this.state.profile && this.state.profile.id,
            hasPhone: Boolean(this.state.profile && this.state.profile.phone),
          },
        });
      }
      return this.state.profile;
    } catch (error) {
      if (shouldReport) {
        miniLog.report({
          level: 'error',
          event: 'profile_failed',
          message: error && error.message,
          statusCode: error && error.statusCode,
          traceId,
          extra: {
            source: options.source || '',
            response: error && error.data,
          },
        });
      }
      throw error;
    }
  },
  async login(phoneCode, options = {}) {
    const traceId = options.traceId || miniLog.createTraceId();
    const source = options.source || 'unknown';
    miniLog.report({
      level: 'info',
      event: 'session_login_start',
      message: 'session login started',
      traceId,
      extra: {
        source,
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    await miniLog.reportNow({
      level: 'info',
      event: 'session_login_start_sync',
      message: 'session login started',
      traceId,
      extra: {
        source,
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    const loginResponse = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail(error) {
          miniLog.report({
            level: 'error',
            event: 'wx_login_failed',
            message: error && error.errMsg,
            traceId,
            extra: {
              source,
            },
          });
          miniLog.reportNow({
            level: 'error',
            event: 'wx_login_failed_sync',
            message: error && error.errMsg,
            traceId,
            extra: {
              source,
            },
          }).then(() => {
            reject(error);
          });
          return;
        },
      });
    });
    miniLog.report({
      level: 'info',
      event: 'wx_login_success',
      message: 'wx.login success',
      traceId,
      extra: {
        source,
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    await miniLog.reportNow({
      level: 'info',
      event: 'wx_login_success_sync',
      message: 'wx.login success',
      traceId,
      extra: {
        source,
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    if (!loginResponse || !loginResponse.code) {
      miniLog.report({
        level: 'warn',
        event: 'wx_login_missing_code',
        message: 'wx.login success without code',
        traceId,
        extra: {
          source,
          hasPhoneCode: Boolean(phoneCode),
        },
      });
      await miniLog.reportNow({
        level: 'warn',
        event: 'wx_login_missing_code_sync',
        message: 'wx.login success without code',
        traceId,
        extra: {
          source,
          hasPhoneCode: Boolean(phoneCode),
        },
      });
    }
    miniLog.report({
      level: 'info',
      event: 'login_api_request',
      message: 'request wx-login api',
      apiUrl: '/auth/wx-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    await miniLog.reportNow({
      level: 'info',
      event: 'login_api_request_sync',
      message: 'request wx-login api',
      apiUrl: '/auth/wx-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    const response = await api.wxLogin(loginResponse.code, phoneCode, { traceId });
    const payload = response.data || response;
    miniLog.report({
      level: 'info',
      event: 'login_api_success',
      message: 'wx-login api success',
      apiUrl: '/auth/wx-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasAccessToken: Boolean(payload.access_token),
        hasUser: Boolean(payload.user),
      },
    });
    this.setAccessToken(payload.access_token || '');
    this.state.profile = payload.user || null;
    miniLog.report({
      level: 'info',
      event: 'login_success',
      message: 'login success',
      traceId,
      extra: {
        source,
        hasAccessToken: Boolean(payload.access_token),
        hasUser: Boolean(payload.user),
        userId: payload.user && payload.user.id,
        hasPhone: Boolean(payload.user && payload.user.phone),
      },
    });
    return payload;
  },
  logout() {
    this.setAccessToken('');
    this.state.profile = null;
    this.setCurrentPatientId('');
  },
};

module.exports = sessionStore;
