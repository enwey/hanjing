const sessionStore = require('../../stores/session-store');
const miniLog = require('../../common/utils/mini-log');

const LOGIN_DIAGNOSTIC_VERSION = 'login-diagnostics-20260812-1';

const COPY = {
  navTitle: '\u5fae\u4fe1\u6388\u6743\u767b\u5f55',
  brandName: '\u9f3e\u9759\u5065\u5eb7\u8bca\u6240',
  brandSlogan: '\u4e13\u6ce8\u7761\u7720\u547c\u5438\u5065\u5eb7 \u00b7 \u8ba9\u6bcf\u4e00\u4e2a\u591c\u665a\u5b89\u5b81\u65e0\u58f0',
  lockIcon: '\ud83d\udd12',
  tipTitle: '\u5b89\u5168\u6388\u6743\u63d0\u793a',
  tipContent: '\u6839\u636e\u56fd\u5bb6\u7f51\u7edc\u5b89\u5168\u6cd5\u53ca\u5c31\u8bca\u771f\u5b9e\u6027\u8981\u6c42\uff0c\u9884\u7ea6\u6302\u53f7\u3001\u75c5\u5386\u7ba1\u7406\u3001\u7761\u7720\u76d1\u6d4b\u7b49\u529f\u80fd\u9700\u7ed1\u5b9a\u60a8\u7684\u624b\u673a\u53f7\u7801\u3002',
  loginButton: '\u5fae\u4fe1\u624b\u673a\u53f7\u4e00\u952e\u767b\u5f55',
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
  devLoginTitle: '\u6a21\u62df\u624b\u673a\u53f7\u767b\u5f55',
  devLoginPlaceholder: '\u8bf7\u8f93\u5165\u6d4b\u8bd5\u767b\u5f55\u7684\u624b\u673a\u53f7\uff0811\u4f4d\u6570\u5b57\uff09',
  invalidPhone: '\u8bf7\u8f93\u516511\u4f4d\u6570\u5b57\u624b\u673a\u53f7',
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

function reportLoginEvent(level, event, message, extra) {
  miniLog.report({
    level,
    event,
    message,
    extra,
  });
}

function reportLoginFailure(error) {
  miniLog.report({
    level: 'error',
    event: 'login_failed',
    message: error && error.message,
    statusCode: error && error.statusCode,
    extra: {
      response: error && error.data,
    },
  });
}

Page({
  data: {
    agreed: false,
    isDevTools: false,
    redirectUrl: '',
    backUrl: '',
    copy: COPY,
  },

  onLoad(options = {}) {
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({
        isDevTools: sysInfo.platform === 'devtools',
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
    reportLoginEvent('info', 'login_button_tap', 'login button tapped', {
      agreed: Boolean(this.data.agreed),
    });
    if (!this.data.agreed) {
      reportLoginEvent('warn', 'login_agreement_missing', 'user tapped login before agreement');
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
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

  async onGetPhoneNumber(event) {
    const detail = event && event.detail ? event.detail : {};
    reportLoginEvent('info', 'login_phone_callback', detail.errMsg || 'getPhoneNumber callback', {
      agreed: Boolean(this.data.agreed),
      hasPhoneCode: Boolean(detail.code),
    });
    if (!this.data.agreed) {
      reportLoginEvent('warn', 'login_agreement_missing', 'phone callback received before agreement');
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
      return;
    }
    if (!detail.code) {
      reportLoginEvent('warn', 'login_phone_auth_cancelled', detail.errMsg || 'phone authorization cancelled');
      wx.showToast({ title: TOAST.authCancelled, icon: 'none' });
      return;
    }

    wx.showLoading({ title: TOAST.loggingIn });
    try {
      await sessionStore.login(detail.code);
      await sessionStore.fetchProfile();
      wx.hideLoading();
      wx.showToast({ title: TOAST.loginSuccess, icon: 'success' });
      setTimeout(() => {
        this.navigateAfterLogin();
      }, 1200);
    } catch (error) {
      wx.hideLoading();
      reportLoginFailure(error);
      wx.showToast({ title: TOAST.loginFailed, icon: 'none' });
      console.error(error);
    }
  },

  async onDeveloperLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: TOAST.needAgreement, icon: 'none' });
      return;
    }

    wx.showModal({
      title: TOAST.devLoginTitle,
      content: '',
      editable: true,
      placeholderText: TOAST.devLoginPlaceholder,
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        const phone = result.content ? result.content.trim() : '';
        if (!/^\d{11}$/.test(phone)) {
          wx.showToast({ title: TOAST.invalidPhone, icon: 'none' });
          return;
        }

        wx.showLoading({ title: TOAST.loggingIn });
        try {
          await sessionStore.login(phone);
          await sessionStore.fetchProfile();
          wx.hideLoading();
          wx.showToast({ title: TOAST.loginSuccess, icon: 'success' });
          setTimeout(() => {
            this.navigateAfterLogin();
          }, 1200);
        } catch (error) {
          wx.hideLoading();
          reportLoginFailure(error);
          wx.showToast({ title: TOAST.loginFailed, icon: 'none' });
          console.error(error);
        }
      },
    });
  },
});
