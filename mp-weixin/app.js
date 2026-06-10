"use strict";

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

const e = require("./common/vendor.js");
Math;

const o = e.defineComponent({
  __name: "App",
  setup: (o) => {
    e.onLaunch(() => {
      console.log("[鼾静健康] App Launch");
      if (!e.index.getStorageSync("access_token")) {
        console.log("[鼾静健康] 未登录");
      }

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
          wx.showModal({
            title: "隐私保护指引提示",
            content:
              "为了向您提供就近门店选择、挂号预约、以及睡眠鼾声录制与评估服务，我们需要在必要时申请您的地理位置与麦克风录音权限。请阅读并同意《隐私保护指引》后继续使用。",
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
        });
      }
    });

    e.onShow(() => {
      console.log("[鼾静健康] App Show");
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
