const api = require('../api/index');
const miniLog = require('../common/utils/mini-log');
const AUTH_MODE_STORAGE_KEY = 'auth_mode';
let sessionRevision = 0;
// A token refresh keeps the login session; logout or a new login does not.
let loginGeneration = 0;

// Diagnostics are best-effort and must never delay authentication.
function reportDiagnostic(entry) {
  try {
    Promise.resolve(miniLog.reportNow(entry)).catch(() => {});
  } catch (error) {}
}

function assertLoginActive(options, revision) {
  if (sessionRevision !== revision || (options.isCancelled && options.isCancelled())) {
    throw new Error('登录操作已取消，请重新登录');
  }
}

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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= 0) {
    return true;
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
  const token = wx.getStorageSync('access_token');
  if (!pendingInviteCode) {
    return;
  }
  const clearCurrentInvite = () => {
    if (wx.getStorageSync('pending_invite_code') === pendingInviteCode &&
        wx.getStorageSync('access_token') === token) {
      wx.removeStorageSync('pending_invite_code');
    }
  };
  try {
    const response = await api.bindDistribution(pendingInviteCode);
    const status = response && ((response.data && response.data.status) || response.status);
    if (status === 'bound' || status === 'already_bound' || status === 'ignored_self') {
      clearCurrentInvite();
    }
  } catch (error) {
    if (error && (error.message === '无效的邀请码' || error.message === '邀请码不能为空' ||
        (error.data && ['PROMOTER_UNAVAILABLE', 'INVITE_CYCLE'].includes(error.data.reason)))) {
      clearCurrentInvite();
    }
  }
}

const ACCOUNT_CACHE_KEYS = [
  'current_patient_id', 'rewrite_current_patient_id',
  'selected_treatment_patient_id', 'selected_medical_record_patient_id',
  'last_local_snore_result', 'pending_snore_uploads', 'pending_appointment_assessment',
];
const CACHE_ARCHIVE_KEY = 'account_cache_archive';
const CACHE_OWNER_KEY = 'account_cache_owner';
// Read the owner before an expired access token is removed on startup.
const initialPayload = parseJwtPayload(wx.getStorageSync('access_token'));
let cacheOwner = String(wx.getStorageSync(CACHE_OWNER_KEY) || (initialPayload && initialPayload.id) || '');
if (cacheOwner) wx.setStorageSync(CACHE_OWNER_KEY, cacheOwner);

function switchAccountCache(nextOwner) {
  nextOwner = String(nextOwner || '');
  if (nextOwner && nextOwner === cacheOwner) {
    wx.setStorageSync(CACHE_OWNER_KEY, nextOwner);
    return false;
  }
  const saved = wx.getStorageSync(CACHE_ARCHIVE_KEY);
  const archive = Array.isArray(saved) ? saved.slice() : [];
  const values = {};
  ACCOUNT_CACHE_KEYS.forEach((key) => {
    const value = wx.getStorageSync(key);
    if (value !== undefined && value !== null && value !== '') values[key] = value;
  });
  if (Object.keys(values).length) archive.push({ owner: cacheOwner, values });
  // Preserve pending records before removing them from the active account.
  if (archive.length) wx.setStorageSync(CACHE_ARCHIVE_KEY, archive);
  ACCOUNT_CACHE_KEYS.forEach((key) => wx.removeStorageSync(key));
  let restoreIndex = -1;
  if (nextOwner) {
    for (let i = archive.length - 1; i >= 0; i -= 1) {
      if (archive[i].owner === nextOwner) { restoreIndex = i; break; }
    }
  }
  if (restoreIndex >= 0) {
    const restored = archive[restoreIndex].values || {};
    ACCOUNT_CACHE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(restored, key)) wx.setStorageSync(key, restored[key]);
    });
    archive.splice(restoreIndex, 1);
    if (archive.length) wx.setStorageSync(CACHE_ARCHIVE_KEY, archive);
    else wx.removeStorageSync(CACHE_ARCHIVE_KEY);
  }
  cacheOwner = nextOwner;
  if (nextOwner) wx.setStorageSync(CACHE_OWNER_KEY, nextOwner);
  else wx.removeStorageSync(CACHE_OWNER_KEY);
  return true;
}

const sessionStore = {
  state: {
    accessToken: readStoredAccessToken(),
    authMode: readStoredAuthMode(),
    profile: null,
    currentPatientId: wx.getStorageSync('current_patient_id') || '',
  },

  getRevision() {
    return sessionRevision;
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
  setAccessToken(accessToken, options = {}) {
    sessionRevision += 1;
    if (!options.isRefresh) loginGeneration += 1;
    this.state.accessToken = accessToken || '';
    if (accessToken) { wx.setStorageSync("access_token", accessToken); } else { wx.removeStorageSync("access_token"); }
  },
  clearLoginState() {
    // Authentication must be invalidated even if preserving account caches fails.
    this.setAccessToken('');
    this.setAuthMode('');
    this.state.profile = null;
    try {
      this.switchAccount('');
    } catch (error) {
      // Keep pending records and their existing owner in place. A different
      // account must successfully archive them before its login can commit.
      reportDiagnostic({
        level: 'warn',
        event: 'logout_cache_archive_deferred',
        message: 'Session cleared; account cache archival deferred',
      });
    }
    this.setCurrentPatientId('');
    wx.removeStorageSync('rewrite_current_patient_id');
    wx.removeStorageSync('selected_treatment_patient_id');
    wx.removeStorageSync('selected_medical_record_patient_id');
    const patientContext = require('./patient-context-store');
    if (patientContext && typeof patientContext.reset === 'function') patientContext.reset();
  },
  switchAccount(userId) {
    if (!switchAccountCache(userId)) return;
    this.state.currentPatientId = wx.getStorageSync('current_patient_id') || '';
    this.state.profile = null;
    const patientContext = require('./patient-context-store');
    if (patientContext && typeof patientContext.reset === 'function') patientContext.reset();
  },
  setCurrentPatientId(patientId) {
    this.state.currentPatientId = patientId || '';
    if (patientId) { wx.setStorageSync("current_patient_id", patientId); } else { wx.removeStorageSync("current_patient_id"); }
  },
  async fetchProfile(options = {}) {
    const generation = loginGeneration;
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
      if (generation !== loginGeneration || !this.isLoggedIn()) {
        const error = new Error('登录状态已变更，请重新加载资料');
        error.code = 'SESSION_CHANGED';
        throw error;
      }
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
    const revision = sessionRevision;
    assertLoginActive(options, revision);
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
    reportDiagnostic({
      level: 'info',
      event: 'session_login_start_sync',
      message: 'session login started',
      traceId,
      extra: {
        source,
        hasPhoneCode: Boolean(phoneCode),
      },
    });
    assertLoginActive(options, revision);
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
          reportDiagnostic({
            level: 'error',
            event: 'wx_login_failed_sync',
            message: error && error.errMsg,
            traceId,
            extra: {
              source,
            },
          });
          reject(error);
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
    reportDiagnostic({
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
      reportDiagnostic({
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
    reportDiagnostic({
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
    assertLoginActive(options, revision);
    const response = await api.wxLogin(loginResponse.code, phoneCode, { traceId });
    assertLoginActive(options, revision);
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
    if (normalizeAccessToken(payload.access_token) && !isTokenExpired(payload.access_token)) {
      const identity = parseJwtPayload(payload.access_token);
      this.switchAccount((payload.user && payload.user.id) || (identity && identity.id));
    }
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
    const revision = sessionRevision;
    assertLoginActive(options, revision);
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
    reportDiagnostic({
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
    reportDiagnostic({
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
    assertLoginActive(options, revision);
    const response = await authApi.passwordLogin(phone, password, { traceId });
    assertLoginActive(options, revision);
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
    if (normalizeAccessToken(payload.access_token) && !isTokenExpired(payload.access_token)) {
      const identity = parseJwtPayload(payload.access_token);
      this.switchAccount((payload.user && payload.user.id) || (identity && identity.id));
    }
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
