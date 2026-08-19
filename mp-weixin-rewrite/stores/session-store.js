const api = require('../api/index');
const miniLog = require('../common/utils/mini-log');
const AUTH_MODE_STORAGE_KEY = 'auth_mode';

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

function readStoredAuthMode() {
  try {
    return String(wx.getStorageSync(AUTH_MODE_STORAGE_KEY) || '').trim();
  } catch (error) {
    return '';
  }
}

async function bindPendingInviteCode() {
  const pendingInviteCode = wx.getStorageSync('pending_invite_code');
  if (!pendingInviteCode) {
    return;
  }
  try {
    const response = await api.bindDistribution(pendingInviteCode);
    const status = (response && response.data && response.data.status) || response.status || 'bound';
    if (status === 'bound' || status === 'already_bound' || status === 'ignored_self') {
      wx.removeStorageSync('pending_invite_code');
    }
  } catch (error) {
    if (error && (error.message === '无效的邀请码' || error.message === '邀请码不能为空')) {
      wx.removeStorageSync('pending_invite_code');
    }
  }
}

const sessionStore = {
  state: {
    accessToken: readStoredAccessToken(),
    authMode: readStoredAuthMode(),
    profile: null,
    currentPatientId: wx.getStorageSync('current_patient_id') || '',
  },

  isLoggedIn() {
    const token = readStoredAccessToken();
    this.state.accessToken = token;
    return Boolean(token);
  },
  getAccessToken() {
    const token = readStoredAccessToken();
    this.state.accessToken = token;
    return token;
  },
  getAuthMode() {
    const authMode = readStoredAuthMode();
    this.state.authMode = authMode;
    return authMode;
  },
  setAuthMode(authMode) {
    const nextMode = authMode ? String(authMode).trim() : '';
    this.state.authMode = nextMode;
    if (nextMode) {
      wx.setStorageSync(AUTH_MODE_STORAGE_KEY, nextMode);
    } else {
      wx.removeStorageSync(AUTH_MODE_STORAGE_KEY);
    }
  },
  setAccessToken(accessToken) {
    this.state.accessToken = accessToken || '';
    if (accessToken) { wx.setStorageSync("access_token", accessToken); } else { wx.removeStorageSync("access_token"); }
  },
  clearLoginState() {
    this.setAccessToken('');
    this.setAuthMode('');
    this.state.profile = null;
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
    this.setAuthMode('wechat');
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
    await bindPendingInviteCode();
    return payload;
  },
  async passwordLogin(phone, password, options = {}) {
    const traceId = options.traceId || miniLog.createTraceId();
    const source = options.source || 'password_login';
    const authApi = require('../api/modules/auth-api');
    miniLog.report({
      level: 'info',
      event: 'session_password_login_start',
      message: 'session password login started',
      traceId,
      extra: {
        source,
        phone: String(phone || '').slice(0, 3),
      },
    });
    await miniLog.reportNow({
      level: 'info',
      event: 'session_password_login_start_sync',
      message: 'session password login started',
      traceId,
      extra: {
        source,
        phone: String(phone || '').slice(0, 3),
      },
    });
    miniLog.report({
      level: 'info',
      event: 'login_api_request',
      message: 'request password-login api',
      apiUrl: '/auth/password-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasPhone: Boolean(phone),
        hasPassword: Boolean(password),
      },
    });
    await miniLog.reportNow({
      level: 'info',
      event: 'login_api_request_sync',
      message: 'request password-login api',
      apiUrl: '/auth/password-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasPhone: Boolean(phone),
        hasPassword: Boolean(password),
      },
    });
    const response = await authApi.passwordLogin(phone, password, { traceId });
    const payload = response.data || response;
    miniLog.report({
      level: 'info',
      event: 'login_api_success',
      message: 'password-login api success',
      apiUrl: '/auth/password-login',
      method: 'POST',
      traceId,
      extra: {
        source,
        hasAccessToken: Boolean(payload.access_token),
        hasUser: Boolean(payload.user),
      },
    });
    this.setAccessToken(payload.access_token || '');
    this.setAuthMode('password');
    this.state.profile = payload.user || null;
    miniLog.report({
      level: 'info',
      event: 'login_success',
      message: 'password login success',
      traceId,
      extra: {
        source,
        hasAccessToken: Boolean(payload.access_token),
        hasUser: Boolean(payload.user),
        userId: payload.user && payload.user.id,
        hasPhone: Boolean(payload.user && payload.user.phone),
      },
    });
    await bindPendingInviteCode();
    return payload;
  },
  logout() {
    this.clearLoginState();
    this.setCurrentPatientId('');
  },
};

module.exports = sessionStore;
