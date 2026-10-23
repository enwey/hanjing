const sessionStore = require('../../stores/session-store');
const miniLog = require('../../common/utils/mini-log');
const envConfig = require('../../common/config/env');

const LOGIN_DIAGNOSTIC_VERSION = 'login-diagnostics-20260812-1';

const COPY = {
  navTitle: '\u624b\u673a\u53f7\u5feb\u6377\u767b\u5f55',
  brandName: '\u9f3e\u9759\u5065\u5eb7\u8bca\u6240',
  brandSlogan: '\u4e13\u6ce8\u7761\u7720\u547c\u5438\u5065\u5eb7 \u00b7 \u8ba9\u6bcf\u4e00\u4e2a\u591c\u665a\u5b89\u5b81\u65e0\u58f0',
  lockIcon: '\ud83d\udd12',
  tipTitle: '\u5b89\u5168\u63d0\u793a',
  tipContent: '\u4e3a\u4fdd\u62a4\u60a8\u7684\u4e2a\u4eba\u9690\u79c1\u53ca\u5c31\u8bca\u4fe1\u606f\uff0c\u8bf7\u5148\u5b8c\u6210\u767b\u5f55\u9a8c\u8bc1\u3002\u624b\u673a\u53f7\u7528\u4e8e\u8bc6\u522b\u60a8\u7684\u8d26\u53f7\u8eab\u4efd\uff0c\u786e\u4fdd\u60a8\u8bbf\u95ee\u4e0e\u672c\u4eba\u8d26\u53f7\u5173\u8054\u7684\u4fe1\u606f\u3002',
  loginButton: '\u624b\u673a\u53f7\u5feb\u6377\u767b\u5f55',
  passwordLoginEntry: '\u4f7f\u7528\u624b\u673a\u53f7+\u5bc6\u7801\u767b\u5f55',
  passwordLoginTitle: '\u5bc6\u7801\u767b\u5f55',
  passwordLoginCancel: '\u53d6\u6d88',
  phonePlaceholder: '\u8bf7\u8f93\u516511\u4f4d\u624b\u673a\u53f7',
  passwordPlaceholder: '\u8bf7\u8f93\u5165\u767b\u5f55\u5bc6\u7801',
  passwordLoginButton: '\u624b\u673a\u53f7\u5bc6\u7801\u767b\u5f55',
  passwordLoginHint: '\u82e5\u5df2\u5728\u8d26\u53f7\u5b89\u5168\u4e2d\u8bbe\u7f6e\u767b\u5f55\u5bc6\u7801\uff0c\u53ef\u76f4\u63a5\u4f7f\u7528\u672c\u65b9\u5f0f\u767b\u5f55\u3002',
  protocolPrefix: '\u6211\u5df2\u9605\u8bfb\u5e76\u540c\u610f',
  userAgreement: '\u300a\u7528\u6237\u534f\u8bae\u300b',
  andText: '\u4e0e',
  privacyPolicy: '\u300a\u9690\u79c1\u653f\u7b56\u300b',
  envSwitcherTitle: '\u8c03\u8bd5\u63a5\u53e3',
};

const TOAST = {
  needAgreement: '\u8bf7\u5148\u540c\u610f\u7528\u6237\u534f\u8bae\u4e0e\u9690\u79c1\u653f\u7b56',
  authCancelled: '\u6388\u6743\u5df2\u53d6\u6d88',
  loggingIn: '\u5b89\u5168\u767b\u5f55\u4e2d...',
  passwordLoggingIn: '\u767b\u5f55\u4e2d...',
  loginSuccess: '\u767b\u5f55\u6210\u529f',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  invalidPhone: '\u8bf7\u8f93\u5165\u6b63\u786e\u768411\u4f4d\u624b\u673a\u53f7',
  invalidPassword: '\u8bf7\u8f93\u5165\u767b\u5f55\u5bc6\u7801',
};

function buildLoginErrorMessage(error, fallback) {
  const message = String((error && error.message) || fallback || TOAST.loginFailed).trim();
  if (!message) {
    return TOAST.loginFailed;
  }
  if (message.length <= 120) {
    return message;
  }
  return `${message.slice(0, 117)}...`;
}

const TAB_ROUTES = [
  '/pages/index/index',
  '/pages/appointment/index',
  '/pages/treatment/index',
  '/pages/product/index',
  '/pages/profile/index',
];

function readRedirectUrl(options) {
  const target = options && options.redirect ? decodeURIComponent(options.redirect) : '';
  return String(target || '').trim();
}

function readBackUrl(options) {
  const target = options && options.back ? decodeURIComponent(options.back) : '';
  return String(target || '').trim();
}

function resolveAfterLogin(redirectUrl) {
  if (!redirectUrl || !redirectUrl.startsWith('/pages/')) {
    return { type: 'tab', url: '/pages/profile/index' };
  }
  if (TAB_ROUTES.includes(redirectUrl.split('?')[0])) {
    return { type: 'tab', url: redirectUrl.split('?')[0] };
  }
  return { type: 'relaunch', url: redirectUrl };
}

function resolveBackTarget(pageInstance) {
  const backUrl = String((pageInstance && pageInstance.data && pageInstance.data.backUrl) || '').trim();
  if (backUrl && backUrl.startsWith('/pages/')) {
    if (TAB_ROUTES.includes(backUrl.split('?')[0])) {
      return { type: 'tab', url: backUrl.split('?')[0] };
    }
    return { type: 'relaunch', url: backUrl };
  }

  try {
    const app = getApp();
    const lastRoute = app && app.globalData && app.globalData.lastRoute
      ? `/${String(app.globalData.lastRoute).replace(/^\/+/, '')}`
      : '';
    if (lastRoute && !lastRoute.startsWith('/pages/auth/')) {
      if (TAB_ROUTES.includes(lastRoute.split('?')[0])) {
        return { type: 'tab', url: lastRoute.split('?')[0] };
      }
      return { type: 'relaunch', url: lastRoute };
    }
  } catch (error) {
    console.error(error);
  }

  return { type: 'tab', url: '/pages/index/index' };
}

function reportLoginEvent(level, event, message, context = {}) {
  miniLog.report({
    level,
    event,
    message,
    traceId: context.traceId || '',
    extra: context.extra || context,
  });
}

function reportDiagnostic(entry) {
  try {
    Promise.resolve(miniLog.reportNow(entry)).catch(() => {});
  } catch (error) {}
}

function reportLoginEventNow(level, event, message, context = {}) {
  return reportDiagnostic({
    level,
    event,
    message,
    traceId: context.traceId || '',
    extra: context.extra || context,
  });
}

function reportLoginFailure(error, context = {}) {
  miniLog.report({
    level: 'error',
    event: 'login_failed',
    message: error && error.message,
    statusCode: error && error.statusCode,
    traceId: context.traceId || '',
    extra: {
      source: context.source || '',
      response: error && error.data,
    },
  });
}

function reportLoginFailureNow(error, context = {}) {
  return reportDiagnostic({
    level: 'error',
    event: 'login_failed',
    message: error && error.message,
    statusCode: error && error.statusCode,
    traceId: context.traceId || '',
    extra: {
      source: context.source || '',
      response: error && error.data,
      errMsg: error && error.errMsg,
    },
  });
}

Page({
  data: {
    agreed: false,
    submitting: false,
    redirectUrl: '',
    backUrl: '',
    loginTraceId: '',
    copy: COPY,
    showEnvSwitcher: false,
    currentApiEnvLabel: '',
    currentApiBaseUrl: '',
    showPasswordLoginModal: false,
    phone: '',
    password: '',
  },

  onLoad(options = {}) {
    this._unloaded = false;
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({
        redirectUrl: readRedirectUrl(options),
        backUrl: readBackUrl(options),
        showEnvSwitcher: envConfig.envVersion === 'develop',
      });
      this.syncApiEnvInfo();
      reportLoginEvent('info', 'login_page_loaded', LOGIN_DIAGNOSTIC_VERSION, {
        platform: sysInfo.platform,
      });
    } catch (error) {
      console.error(error);
    }
  },

  onUnload() {
    this._unloaded = true;
    this.hideLoginLoading();
    clearTimeout(this._loginRedirectTimer);
  },

  showLoginLoading(title) {
    if (this._unloaded) return;
    this._loginLoading = true;
    wx.showLoading({ title });
  },

  hideLoginLoading() {
    if (!this._loginLoading) return;
    this._loginLoading = false;
    wx.hideLoading();
  },

  handleAgreementChange(event) {
    const values = event.detail.value || [];
    this.setData({ agreed: values.indexOf('agree') > -1 });
  },

  syncApiEnvInfo() {
    const currentApiEnv = envConfig.getCurrentApiEnv();
    const options = envConfig.getApiEnvOptions();
    const currentOption = options.find((item) => item.key === currentApiEnv) || options[0] || {};
    this.setData({
      currentApiEnvLabel: currentOption.label || '未设置',
      currentApiBaseUrl: currentOption.baseUrl || envConfig.getApiBaseUrl(),
    });
  },

  handleApiEnvSwitch() {
    if (envConfig.envVersion !== 'develop') {
      return;
    }
    const options = envConfig.getApiEnvOptions();
    wx.showActionSheet({
      itemList: options.map((item) => `${item.label}：${item.baseUrl}`),
      success: (result) => {
        const selected = options[result.tapIndex];
        if (!selected) return;
        envConfig.setApiEnvOverride(selected.key);
        this.syncApiEnvInfo();
        wx.showToast({
          title: `已切换到${selected.label}`,
          icon: 'none',
        });
      },
    });
  },

  viewAgreement() {
    wx.navigateTo({ url: '/pages/auth/agreement/index' });
  },

  viewPrivacy() {
    wx.navigateTo({ url: '/pages/auth/privacy/index' });
  },

  handleBack() {
    const pages = getCurrentPages();
    if (Array.isArray(pages) && pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          const target = resolveBackTarget(this);
          if (target.type === 'tab') {
            wx.switchTab({ url: target.url });
            return;
          }
          wx.reLaunch({ url: target.url });
        },
      });
      return;
    }
    const target = resolveBackTarget(this);
    if (target.type === 'tab') {
      wx.switchTab({ url: target.url });
      return;
    }
    wx.reLaunch({ url: target.url });
  },

  onLoginTap() {
    if (this.data.submitting || this._unloaded) return;
    const traceId = miniLog.createTraceId();
    this.setData({ loginTraceId: traceId });
    reportLoginEvent('info', 'login_button_tap', 'login button tapped', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
    });
    reportLoginEventNow('info', 'login_button_tap_sync', 'login button tapped', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
    });
    if (!this.data.agreed) {
      reportLoginEvent('warn', 'login_agreement_missing', 'user tapped login before agreement', {
        source: 'auth_login',
        traceId,
      });
      reportLoginEventNow('warn', 'login_agreement_missing_sync', 'user tapped login before agreement', {
        source: 'auth_login',
        traceId,
      });
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
    }
  },

  onAgreementRequiredTap() {
    this.onLoginTap();
  },

  openPasswordLoginModal() {
    if (this.data.submitting || this._unloaded) return;
    if (!this.data.agreed) {
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
      return;
    }
    this.setData({ showPasswordLoginModal: true });
  },

  closePasswordLoginModal() {
    this.setData({
      showPasswordLoginModal: false,
      phone: '',
      password: '',
    });
  },

  noop() {},

  handlePhoneInput(event) {
    this.setData({ phone: String(event.detail.value || '').replace(/\D/g, '').slice(0, 11) });
  },

  handlePasswordInput(event) {
    this.setData({ password: String(event.detail.value || '').slice(0, 20) });
  },

  async onLoginOpenTypeError(event) {
    if (this._unloaded || this.data.submitting) return;
    const detail = event && event.detail ? event.detail : {};
    const traceId = this.data.loginTraceId || miniLog.createTraceId();
    if (!this.data.loginTraceId) {
      this.setData({ loginTraceId: traceId });
    }
    reportLoginEvent('error', 'login_open_type_error', detail.errMsg || 'getPhoneNumber open-type error', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    reportLoginEventNow('error', 'login_open_type_error_sync', detail.errMsg || 'getPhoneNumber open-type error', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    if (this._unloaded) return;
    wx.showModal({
      title: '登录失败',
      content: buildLoginErrorMessage({ message: detail.errMsg || TOAST.loginFailed }),
      showCancel: false,
    });
  },

  navigateAfterLogin() {
    if (this._unloaded) return;
    const target = resolveAfterLogin(this.data.redirectUrl);
    const fail = () => {
      if (this._unloaded) return;
      this.setData({ submitting: false });
      wx.showToast({ title: '页面跳转失败，请重试', icon: 'none' });
    };
    if (target.type === 'tab') {
      wx.switchTab({ url: target.url, fail });
      return;
    }
    wx.reLaunch({ url: target.url, fail });
  },

  async completeLogin(options) {
    if (this._unloaded) return;
    let profileLoaded = true;
    try {
      await sessionStore.fetchProfile(options);
    } catch (error) {
      profileLoaded = false;
      // A rejected session must not be reported as a successful login.
      if ((error && error.statusCode === 401) || !sessionStore.isLoggedIn()) {
        throw error;
      }
    }
    if (this._unloaded) return;
    if (!sessionStore.isLoggedIn()) {
      throw new Error('登录状态已失效，请重新登录');
    }
    this.hideLoginLoading();
    this.closePasswordLoginModal();
    wx.showToast({
      title: profileLoaded ? TOAST.loginSuccess : '登录成功，资料暂未加载',
      icon: profileLoaded ? 'success' : 'none',
    });
    this._loginRedirectTimer = setTimeout(() => {
      this.navigateAfterLogin();
    }, 1200);
  },

  async onGetPhoneNumber(event) {
    if (this.data.submitting || this._unloaded) return;
    const detail = event && event.detail ? event.detail : {};
    if (this.data.agreed && detail.code) {
      this.setData({ submitting: true });
    }
    const traceId = this.data.loginTraceId || miniLog.createTraceId();
    if (!this.data.loginTraceId) {
      this.setData({ loginTraceId: traceId });
    }
    reportLoginEvent('info', 'login_phone_callback', detail.errMsg || 'getPhoneNumber callback', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      hasPhoneCode: Boolean(detail.code),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    reportLoginEventNow('info', 'login_phone_callback_sync', detail.errMsg || 'getPhoneNumber callback', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      hasPhoneCode: Boolean(detail.code),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    if (this._unloaded) return;
    if (!this.data.agreed) {
      this.setData({ submitting: false });
      reportLoginEvent('warn', 'login_agreement_missing', 'phone callback received before agreement', {
        source: 'auth_login',
        traceId,
      });
      reportLoginEventNow('warn', 'login_agreement_missing_sync', 'phone callback received before agreement', {
        source: 'auth_login',
        traceId,
      });
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
      return;
    }
    if (!detail.code) {
      reportLoginEvent('warn', 'login_phone_auth_cancelled', detail.errMsg || 'phone authorization cancelled', {
        source: 'auth_login',
        traceId,
      });
      reportLoginEventNow('warn', 'login_phone_auth_cancelled_sync', detail.errMsg || 'phone authorization cancelled', {
        source: 'auth_login',
        traceId,
        errMsg: detail.errMsg || '',
        errno: detail.errno,
      });
      wx.showToast({ title: TOAST.authCancelled, icon: 'none' });
      return;
    }

    this.showLoginLoading(TOAST.loggingIn);
    try {
      reportLoginEventNow('info', 'login_session_start_sync', 'start session login', {
        source: 'auth_login',
        traceId,
        hasPhoneCode: true,
      });
      if (this._unloaded) return;
      await sessionStore.login(detail.code, { source: 'auth_login', traceId, isCancelled: () => this._unloaded });
      await this.completeLogin({ source: 'auth_login', traceId });
    } catch (error) {
      this.hideLoginLoading();
      if (this._unloaded) return;
      reportLoginFailure(error, { source: 'auth_login', traceId });
      reportLoginFailureNow(error, { source: 'auth_login', traceId });
      if (this._unloaded) return;
      this.setData({ submitting: false });
      wx.showModal({
        title: '登录失败',
        content: buildLoginErrorMessage(error, TOAST.loginFailed),
        showCancel: false,
      });
      console.error(error);
    }
  },

  async onPasswordLoginTap() {
    if (this.data.submitting || this._unloaded) return;
    const traceId = miniLog.createTraceId();
    const phone = String(this.data.phone || '').trim();
    const password = String(this.data.password || '');
    this.setData({ loginTraceId: traceId });

    if (!this.data.agreed) {
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: TOAST.invalidPhone, icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: TOAST.invalidPassword, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    this.showLoginLoading(TOAST.passwordLoggingIn);
    try {
      await sessionStore.passwordLogin(phone, password, {
        source: 'auth_password_login',
        traceId,
        isCancelled: () => this._unloaded,
      });
      await this.completeLogin({ source: 'auth_password_login', traceId });
    } catch (error) {
      this.hideLoginLoading();
      if (this._unloaded) return;
      reportLoginFailure(error, { source: 'auth_password_login', traceId });
      reportLoginFailureNow(error, { source: 'auth_password_login', traceId });
      if (this._unloaded) return;
      this.setData({ submitting: false });
      wx.showModal({
        title: '登录失败',
        content: buildLoginErrorMessage(error, TOAST.loginFailed),
        showCancel: false,
      });
      console.error(error);
    }
  },
});
