const distributionApi = require('./api/index');
const { capture: captureBackendReferral, decodeScene, isBackendCode } = require('./common/utils/backend-referral');
const miniLog = require('./common/utils/mini-log');

const originalPage = Page;

Page = function registerTrackedPage(pageOptions) {
  const config = pageOptions || {};
  const originalOnLoad = config.onLoad;
  const originalOnShow = config.onShow;
  const originalOnHide = config.onHide;
  const originalOnUnload = config.onUnload;

  config.onLoad = function trackedOnLoad(...args) {
    try {
      captureBackendReferral(args[0]);
    } catch (e) {}
    if (typeof originalOnLoad === 'function') {
      return originalOnLoad.apply(this, args);
    }
    return undefined;
  };

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

function ordinaryInviteCode(value) {
  if (typeof value !== 'string' || isBackendCode(value)) return '';
  return value.trim();
}

function parseInviteCodeFromLaunchOptions(options) {
  if (!options || !options.query) return "";
  const query = options.query;
  let inviteCode = ordinaryInviteCode(query.inviteCode) || ordinaryInviteCode(query.invite_code);
  const sceneText = decodeScene(query.scene);
  if (sceneText) {
    if (sceneText.indexOf("=") > -1) {
      sceneText.split("&").forEach((entry) => {
        const parts = entry.split("=");
        const key = parts[0];
        const value = parts.slice(1).join("=");
        if (key === "inviteCode" || key === "invite_code" || key === "code") {
          inviteCode = ordinaryInviteCode(value) || inviteCode;
        }
      });
    } else { inviteCode = ordinaryInviteCode(sceneText) || inviteCode; }
  }
  return inviteCode;
}

const pendingInviteFlights = new Map();
async function tryBindPendingInvite() {
  const inviteCode = wx.getStorageSync("pending_invite_code");
  const token = wx.getStorageSync("access_token");
  if (!inviteCode || !token) return;
  if (isBackendCode(inviteCode)) {
    wx.removeStorageSync('pending_invite_code');
    return;
  }
  const flightKey = JSON.stringify([token, inviteCode]);
  if (pendingInviteFlights.has(flightKey)) return pendingInviteFlights.get(flightKey);
  const clearCurrentInvite = () => {
    if (wx.getStorageSync('pending_invite_code') === inviteCode &&
        wx.getStorageSync('access_token') === token) {
      wx.removeStorageSync('pending_invite_code');
    }
  };
  const flight = (async () => {
    try {
      const response = await distributionApi.bindDistribution(inviteCode);
      const status = response && ((response.data && response.data.status) || response.status);
      if (status === "bound" || status === "already_bound" || status === "ignored_self") {
        clearCurrentInvite();
      }
    } catch (error) {
      if (error && (error.message === "无效的邀请码" || error.message === "邀请码不能为空" ||
          (error.data && ['PROMOTER_UNAVAILABLE', 'INVITE_CYCLE', 'INVALID_INVITE'].includes(error.data.reason)))) {
        clearCurrentInvite();
      }
    }
  })();
  pendingInviteFlights.set(flightKey, flight);
  try { await flight; } finally { pendingInviteFlights.delete(flightKey); }
}

App({
  globalData: { appName: "兴康明诊所", currentRoute: '', lastRoute: '' },
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
    captureBackendReferral(options);
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
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
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        const popup = page?.selectComponent?.('#privacyPopup');
        if (popup) {
          popup.requestAuthorization(resolve);
        } else {
          resolve({ event: 'disagree' });
          wx.showToast({ title: '请先同意隐私保护指引后再使用该功能', icon: 'none', duration: 2000 });
        }
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
    captureBackendReferral(options);
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
  },
});
