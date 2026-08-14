const sessionStore = require('../../stores/session-store');
const miniLog = require('../../common/utils/mini-log');

const LOGIN_DIAGNOSTIC_VERSION = 'login-diagnostics-20260812-1';

const COPY = {
  navTitle: '\u767b\u5f55',
  brandName: '\u9f3e\u9759\u5065\u5eb7',
  brandSlogan: '\u53ef\u5148\u6d4f\u89c8\u9996\u9875\u3001\u7761\u7720\u8bc4\u4f30\u3001\u6253\u5361\u8bf4\u660e\u4e0e\u5065\u5eb7\u6587\u7ae0\uff0c\u9700\u8981\u67e5\u770b\u6216\u540c\u6b65\u4e2a\u4eba\u8bb0\u5f55\u65f6\u518d\u767b\u5f55\u3002',
  lockIcon: '\u00b7',
  tipTitle: '\u767b\u5f55\u8bf4\u660e',
  tipContent: '\u4e2a\u4eba\u8d44\u6599\u3001\u5bb6\u5ead\u6210\u5458\u3001\u6253\u5361\u8bb0\u5f55\u540c\u6b65\u7b49\u529f\u80fd\u9700\u8981\u767b\u5f55\u540e\u4f7f\u7528\u3002\u767b\u5f55\u65f6\u4ec5\u7528\u4e8e\u9a8c\u8bc1\u624b\u673a\u53f7\u5e76\u5efa\u7acb\u8d26\u53f7\u3002',
  loginButton: '\u624b\u673a\u53f7\u5feb\u6377\u767b\u5f55',
  protocolPrefix: '\u6211\u5df2\u9605\u8bfb\u5e76\u540c\u610f',
  userAgreement: '\u300a\u7528\u6237\u534f\u8bae\u300b',
  andText: '\u4e0e',
  privacyPolicy: '\u300a\u9690\u79c1\u653f\u7b56\u300b',
};

const TOAST = {
  needAgreement: '\u8bf7\u5148\u540c\u610f\u7528\u6237\u534f\u8bae\u4e0e\u9690\u79c1\u653f\u7b56',
  authCancelled: '\u6388\u6743\u5df2\u53d6\u6d88',
  loggingIn: '\u5b89\u5168\u767b\u5f55\u4e2d...',
  loginSuccess: '\u767b\u5f55\u6210\u529f',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
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
  '/pages/assessment/index',
  '/pages/treatment/index',
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

function reportLoginEvent(level, event, message, context = {}) {
  miniLog.report({
    level,
    event,
    message,
    traceId: context.traceId || '',
    extra: context.extra || context,
  });
}

function reportLoginEventNow(level, event, message, context = {}) {
  return miniLog.reportNow({
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
  return miniLog.reportNow({
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
    redirectUrl: '',
    backUrl: '',
    loginTraceId: '',
    copy: COPY,
  },

  onLoad(options = {}) {
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({
        redirectUrl: readRedirectUrl(options),
        backUrl: readBackUrl(options),
      });
      reportLoginEvent('info', 'login_page_loaded', LOGIN_DIAGNOSTIC_VERSION, {
        platform: sysInfo.platform,
      });
    } catch (error) {
      console.error(error);
    }
  },

  handleAgreementChange(event) {
    const values = event.detail.value || [];
    this.setData({ agreed: values.indexOf('agree') > -1 });
  },

  viewAgreement() {
    wx.navigateTo({ url: '/pages/auth/agreement/index' });
  },

  viewPrivacy() {
    wx.navigateTo({ url: '/pages/auth/privacy/index' });
  },

  handleBack() {
    const backUrl = String(this.data.backUrl || '').trim();
    if (backUrl) {
      if (TAB_ROUTES.includes(backUrl.split('?')[0])) {
        wx.switchTab({ url: backUrl.split('?')[0] });
        return;
      }
      wx.reLaunch({ url: backUrl });
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  onLoginTap() {
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

  async onLoginOpenTypeError(event) {
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
    await reportLoginEventNow('error', 'login_open_type_error_sync', detail.errMsg || 'getPhoneNumber open-type error', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    wx.showModal({
      title: '登录失败',
      content: buildLoginErrorMessage({ message: detail.errMsg || TOAST.loginFailed }),
      showCancel: false,
    });
  },

  navigateAfterLogin() {
    const target = resolveAfterLogin(this.data.redirectUrl);
    if (target.type === 'tab') {
      wx.switchTab({ url: target.url });
      return;
    }
    wx.reLaunch({ url: target.url });
  },

  async onGetPhoneNumber(event) {
    const detail = event && event.detail ? event.detail : {};
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
    await reportLoginEventNow('info', 'login_phone_callback_sync', detail.errMsg || 'getPhoneNumber callback', {
      source: 'auth_login',
      traceId,
      agreed: Boolean(this.data.agreed),
      hasPhoneCode: Boolean(detail.code),
      errMsg: detail.errMsg || '',
      errno: detail.errno,
    });
    if (!this.data.agreed) {
      reportLoginEvent('warn', 'login_agreement_missing', 'phone callback received before agreement', {
        source: 'auth_login',
        traceId,
      });
      await reportLoginEventNow('warn', 'login_agreement_missing_sync', 'phone callback received before agreement', {
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
      await reportLoginEventNow('warn', 'login_phone_auth_cancelled_sync', detail.errMsg || 'phone authorization cancelled', {
        source: 'auth_login',
        traceId,
        errMsg: detail.errMsg || '',
        errno: detail.errno,
      });
      wx.showToast({ title: TOAST.authCancelled, icon: 'none' });
      return;
    }

    wx.showLoading({ title: TOAST.loggingIn });
    try {
      await reportLoginEventNow('info', 'login_session_start_sync', 'start session login', {
        source: 'auth_login',
        traceId,
        hasPhoneCode: true,
      });
      await sessionStore.login(detail.code, { source: 'auth_login', traceId });
      await sessionStore.fetchProfile({ source: 'auth_login', traceId });
      wx.hideLoading();
      wx.showToast({ title: TOAST.loginSuccess, icon: 'success' });
      setTimeout(() => {
        this.navigateAfterLogin();
      }, 1200);
    } catch (error) {
      wx.hideLoading();
      reportLoginFailure(error, { source: 'auth_login', traceId });
      await reportLoginFailureNow(error, { source: 'auth_login', traceId });
      wx.showModal({
        title: '登录失败',
        content: buildLoginErrorMessage(error, TOAST.loginFailed),
        showCancel: false,
      });
      console.error(error);
    }
  },
});
