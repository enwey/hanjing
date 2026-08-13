const miniLog = require('./common/utils/mini-log');

const originalPage = Page;

Page = function registerTrackedPage(pageOptions) {
  const config = pageOptions || {};
  const originalOnShow = config.onShow;
  const originalOnHide = config.onHide;
  const originalOnUnload = config.onUnload;

  config.onShow = function trackedOnShow(...args) {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.currentRoute = this.route || '';
    }
    if (typeof originalOnShow === 'function') {
      return originalOnShow.apply(this, args);
    }
    return undefined;
  };

  config.onHide = function trackedOnHide(...args) {
    const app = getApp();
    if (app && app.globalData && this.route) {
      app.globalData.lastRoute = this.route;
    }
    if (typeof originalOnHide === 'function') {
      return originalOnHide.apply(this, args);
    }
    return undefined;
  };

  config.onUnload = function trackedOnUnload(...args) {
    const app = getApp();
    if (app && app.globalData && this.route) {
      app.globalData.lastRoute = this.route;
    }
    if (typeof originalOnUnload === 'function') {
      return originalOnUnload.apply(this, args);
    }
    return undefined;
  };

  return originalPage(config);
};

function clearLegacyObfuscatedAccessToken() {
  const token = wx.getStorageSync('access_token');
  if (typeof token === 'string' && token.indexOf('obf:') === 0) {
    wx.removeStorageSync('access_token');
  }
}

App({
  globalData: { appName: "鼾静健康", currentRoute: '', lastRoute: '' },
  onLaunch(options) {
    miniLog.init();
    miniLog.report({
      level: 'info',
      event: 'app_launch',
      message: 'app launched',
      extra: {
        scene: options && options.scene,
      },
    });
    clearLegacyObfuscatedAccessToken();
    if (wx.onError) {
      wx.onError((error) => {
        console.error('[Global Error Catch]', error);
        miniLog.report({
          level: 'error',
          event: 'js_error',
          message: error,
        });
        const realtimeLogManager = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
        if (realtimeLogManager) {
          realtimeLogManager.error('[JS Error]', error);
        }
      });
    }
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        wx.globalPrivacyResolve = resolve;
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        if (currentPage) {
          const popup = currentPage.selectComponent ? currentPage.selectComponent('#privacyPopup') : null;
          if (popup) {
            popup.setData({ showPrivacy: true });
            return;
          }
        }
        wx.showModal({
          title: '隐私保护指引提示',
          content: '为了向您提供手机号登录、睡眠鼾声录制与分析等功能，我们需要在必要时申请手机号与麦克风录音权限。请阅读并同意《隐私保护指引》后继续使用。',
          cancelText: '拒绝',
          confirmText: '同意并授权',
          success(result) {
            if (result.confirm) {
              resolve({ event: 'agree', buttonId: 'agree-btn' });
            } else {
              resolve({ event: 'disagree' });
            }
          },
          fail() {
            resolve({ event: 'disagree' });
          },
        });
      });
    }
  },
  onShow(options) {
    miniLog.report({
      level: 'info',
      event: 'app_show',
      message: 'app show',
      extra: {
        scene: options && options.scene,
      },
    });
    clearLegacyObfuscatedAccessToken();
  },
});
