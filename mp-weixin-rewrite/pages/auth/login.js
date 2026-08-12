const sessionStore = require('../../stores/session-store');
const miniLog = require('../../common/utils/mini-log');

const LOGIN_DIAGNOSTIC_VERSION = 'login-diagnostics-20260812-1';

const COPY = {
  navTitle: '\u5fae\u4fe1\u6388\u6743\u767b\u5f55',
  brandName: '\u9f3e\u9759\u5065\u5eb7\u8bca\u6240',
  brandSlogan: '\u4e13\u6ce8\u7761\u7720\u547c\u5438\u5065\u5eb7 \u00b7 \u8ba9\u6bcf\u4e00\u4e2a\u591c\u665a\u5b89\u5b81\u65e0\u58f0',
  lockIcon: '\ud83d\udd12',
  tipTitle: '\u5b89\u5168\u6388\u6743\u63d0\u793a',
  tipContent: '\u8bf7\u5148\u4f7f\u7528\u5fae\u4fe1\u5b8c\u6210\u767b\u5f55\u3002\u9884\u7ea6\u6302\u53f7\u3001\u75c5\u5386\u7ba1\u7406\u7b49\u9700\u8981\u5b9e\u540d\u8054\u7cfb\u7684\u529f\u80fd\uff0c\u5c06\u5728\u4f7f\u7528\u65f6\u5f15\u5bfc\u60a8\u7ed1\u5b9a\u624b\u673a\u53f7\u3002',
  loginButton: '\u5fae\u4fe1\u6388\u6743\u767b\u5f55',
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

  async handleLogin() {
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
      return;
    }

    wx.showLoading({ title: TOAST.loggingIn });
    try {
      await reportLoginEventNow('info', 'login_session_start_sync', 'start session login', {
        source: 'auth_login',
        traceId,
        hasPhoneCode: false,
      });
      await sessionStore.login('', { source: 'auth_login', traceId });
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
      wx.showToast({ title: TOAST.loginFailed, icon: 'none' });
      console.error(error);
    }
  },

  navigateAfterLogin() {
    const target = resolveAfterLogin(this.data.redirectUrl);
    if (target.type === 'tab') {
      wx.switchTab({ url: target.url });
      return;
    }
    wx.reLaunch({ url: target.url });
  },
});
