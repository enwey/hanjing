const distributionApi = require('./api/index');

function clearLegacyObfuscatedAccessToken() {
  const token = wx.getStorageSync('access_token');
  if (typeof token === 'string' && token.indexOf('obf:') === 0) {
    wx.removeStorageSync('access_token');
  }
}

function parseInviteCodeFromLaunchOptions(options) {
  if (!options || !options.query) return "";
  const query = options.query;
  let inviteCode = query.inviteCode || query.invite_code || '';
  if (query.scene) {
    const sceneText = decodeURIComponent(query.scene);
    if (sceneText.indexOf("=") > -1) {
      sceneText.split("&").forEach((entry) => {
        const parts = entry.split("=");
        const key = parts[0];
        const value = parts.slice(1).join("=");
        if (key === "inviteCode" || key === "invite_code" || key === "code") inviteCode = value;
      });
    } else { inviteCode = sceneText; }
  }
  return String(inviteCode || "").trim();
}

async function tryBindPendingInvite() {
  const inviteCode = wx.getStorageSync("pending_invite_code");
  const token = wx.getStorageSync("access_token");
  if (!inviteCode || !token) return;
  try {
    const response = await distributionApi.bindDistribution(inviteCode);
    const status = (response && response.data && response.data.status) || response.status || "bound";
    if (status === "bound" || status === "already_bound" || status === "ignored_self") {
      wx.removeStorageSync("pending_invite_code");
    }
  } catch (error) {
    if (error && (error.message === "无效的邀请码" || error.message === "邀请码不能为空")) {
      wx.removeStorageSync("pending_invite_code");
    }
  }
}

App({
  globalData: { appName: "鼾静健康诊所" },
  onLaunch(options) {
    clearLegacyObfuscatedAccessToken();
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
    if (wx.onError) {
      wx.onError((error) => {
        console.error('[Global Error Catch]', error);
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
          content: '为了向您提供就近门店选择、挂号预约，以及睡眠鼾声录制与评估服务，我们需要在必要时申请您的地理位置与麦克风录音权限。请阅读并同意《隐私保护指引》后继续使用。',
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
    clearLegacyObfuscatedAccessToken();
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
  },
});
