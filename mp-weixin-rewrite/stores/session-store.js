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
  async fetchProfile() {
    const response = await api.getUserProfile();
    this.state.profile = response.data || response;
    return this.state.profile;
  },
  async login(phoneCode) {
    miniLog.report({
      level: 'info',
      event: 'session_login_start',
      message: 'session login started',
      extra: {
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
          });
          reject(error);
        },
      });
    });
    miniLog.report({
      level: 'info',
      event: 'wx_login_success',
      message: 'wx.login success',
      extra: {
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    miniLog.report({
      level: 'info',
      event: 'login_api_request',
      message: 'request wx-login api',
      apiUrl: '/auth/wx-login',
      method: 'POST',
      extra: {
        hasCode: Boolean(loginResponse && loginResponse.code),
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    const response = await api.wxLogin(loginResponse.code, phoneCode);
    const payload = response.data || response;
    this.setAccessToken(payload.access_token || '');
    this.state.profile = payload.user || null;
    miniLog.report({
      level: 'info',
      event: 'login_success',
      message: 'login success',
      extra: {
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
    this.setAccessToken('');
    this.state.profile = null;
    this.setCurrentPatientId('');
  },
};

module.exports = sessionStore;
