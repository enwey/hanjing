"use strict";

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const e = require("./common/vendor.js");
Math;

function parseInviteCodeFromOptions(options) {
  let inviteCode = "";
  if (options && options.query) {
    inviteCode = options.query.inviteCode || options.query.invite_code || "";
    if (options.query.scene) {
      const sceneStr = decodeURIComponent(options.query.scene);
      if (sceneStr.indexOf("=") > -1) {
        const sceneParams = {};
        sceneStr.split("&").forEach((pair) => {
          const parts = pair.split("=");
          if (parts[0]) {
            sceneParams[parts[0]] = parts.slice(1).join("=");
          }
        });
        inviteCode = sceneParams.invite_code || sceneParams.inviteCode || sceneParams.code || inviteCode;
      } else {
        inviteCode = sceneStr;
      }
    }
  }
  return String(inviteCode || "").trim();
}

async function tryBindPendingInvite(inviteCode) {
  if (!inviteCode) return;
  const token = e.index.getStorageSync("access_token");
  if (!token) return;

  try {
    const api = require("./api/index.js");
    const res = await api.bindDistribution(inviteCode);
    const status = (res && res.data && res.data.status) || (res && res.status) || "bound";
    if (status === "bound" || status === "already_bound" || status === "ignored_self") {
      e.index.removeStorageSync("pending_invite_code");
    }
    console.log("[鼾静健康] 邀请绑定结果:", status);
  } catch (err) {
    if (
      err &&
      (err.message === "无效的邀请码" ||
        err.message === "邀请码不能为空" ||
        err.message === "未授权或登录过期")
    ) {
      e.index.removeStorageSync("pending_invite_code");
    }
    console.error("[鼾静健康] 邀请绑定失败", err);
  }
}

function handleInviteOptions(options) {
  const inviteCode = parseInviteCodeFromOptions(options);
  if (!inviteCode) return;

  console.log("[鼾静健康] 监测到推荐邀请码:", inviteCode);
  e.index.setStorageSync("pending_invite_code", inviteCode);
  tryBindPendingInvite(inviteCode);
}

const o = e.defineComponent({
  __name: "App",
  setup: (o) => {
    e.onLaunch((options) => {
      console.log("[鼾静健康] App Launch", options);
      if (!e.index.getStorageSync("access_token")) {
        console.log("[鼾静健康] 未登录");
      }
      handleInviteOptions(options);

      // Global error logging and tracking
      if (wx.onError) {
        wx.onError((err) => {
          console.error("[Global Error Catch]", err);
          const log = wx.getRealtimeLogManager
            ? wx.getRealtimeLogManager()
            : null;
          if (log) {
            log.error("[JS Error]", err);
          }
        });
      }

      // WeChat Privacy Protection Guideline integration
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve) => {
          wx.globalPrivacyResolve = resolve;
          const pages = getCurrentPages();
          const curPage = pages[pages.length - 1];
          if (curPage) {
            const popup = curPage.selectComponent ? curPage.selectComponent("#privacyPopup") : null;
            if (popup) {
              popup.setData({ showPrivacy: true });
            } else {
              wx.showModal({
                title: "隐私保护指引提示",
                content: "为了向您提供就近门店选择、挂号预约、以及睡眠鼾声录制与评估服务，我们需要在必要时申请您的地理位置与麦克风录音权限。请阅读并同意《隐私保护指引》后继续使用。",
                cancelText: "拒绝",
                confirmText: "同意并授权",
                success: (res) => {
                  if (res.confirm) {
                    resolve({ event: "agree", buttonId: "agree-btn" });
                  } else {
                    resolve({ event: "disagree" });
                  }
                },
              });
            }
          } else {
            resolve({ event: "disagree" });
          }
        });
      }
    });

    e.onShow((options) => {
      console.log("[鼾静健康] App Show", options);
      handleInviteOptions(options);
    });

    e.onHide(() => {
      console.log("[鼾静健康] App Hide");
    });

    return () => {};
  },
});

function n() {
  const n = e.createSSRApp(o);
  const p = e.createPinia();
  n.use(p);
  return { app: n, pinia: p };
}

n().app.mount("#app");
exports.createApp = n;
