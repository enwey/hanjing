"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");

const n = e.defineComponent({
  __name: "login",
  setup(o) {
    const userStore = t.useUserStore();

    async function onGetPhoneNumber(event) {
      console.log("[Login] GetPhoneNumber event:", event);
      const { detail } = event;
      if (!detail || !detail.code) {
        e.index.showToast({
          title: "授权已取消",
          icon: "none"
        });
        return;
      }
      
      e.index.showLoading({ title: "安全登录中..." });
      try {
        // detail.code is the WeChat phone number temporary authorization code
        await userStore.login(detail.code);
        e.index.hideLoading();
        e.index.showToast({
          title: "登录成功",
          icon: "success"
        });
        setTimeout(() => {
          e.index.navigateBack({
            fail: () => {
              e.index.switchTab({ url: "/pages/index/index" });
            }
          });
        }, 1200);
      } catch (err) {
        e.index.hideLoading();
        e.index.showToast({
          title: "登录失败，请重试",
          icon: "none"
        });
        console.error(err);
      }
    }

    function onCancel() {
      e.index.navigateBack({
        fail: () => {
          e.index.switchTab({ url: "/pages/index/index" });
        }
      });
    }

    function viewAgreement() {
      e.index.showModal({
        title: "用户协议",
        content: "此处为鼾静健康诊所用户协议，我们将严格保护您的就诊隐私及个人信息安全。",
        showCancel: false
      });
    }

    function viewPrivacy() {
      e.index.showModal({
        title: "隐私政策",
        content: "此处为鼾静健康诊所隐私政策，我们将严格保护您的就诊隐私及个人信息安全。",
        showCancel: false
      });
    }

    return (props, context) => {
      return {
        onGetPhoneNumber,
        onCancel,
        viewAgreement,
        viewPrivacy
      };
    };
  }
});

wx.createPage(n);
