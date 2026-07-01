"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");

const n = e.defineComponent({
  __name: "login",
  setup(o) {
    const userStore = t.useUserStore();
    const isAgree = e.ref(false);
    const isDevTools = e.ref(false);

    e.onMounted(() => {
      try {
        const sysInfo = e.index.getSystemInfoSync();
        isDevTools.value = sysInfo.platform === "devtools";
        console.log("[Login] isDevTools:", isDevTools.value);
      } catch (err) {
        console.error(err);
      }
    });

    function onCheckboxChange(event) {
      isAgree.value = event.detail.value.includes("agree");
    }

    function onLoginTap() {
      if (!isAgree.value) {
        e.index.showToast({
          title: "请先同意用户协议与隐私政策",
          icon: "none"
        });
      }
    }

    async function onGetPhoneNumber(event) {
      if (!isAgree.value) {
        e.index.showToast({
          title: "请先同意用户协议与隐私政策",
          icon: "none"
        });
        return;
      }
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
        await userStore.login(detail.code);
        e.index.hideLoading();
        e.index.showToast({
          title: "登录成功",
          icon: "success"
        });
        setTimeout(() => {
          e.index.navigateBack({
            fail: () => {
              e.index.switchTab({ url: "/pages/profile/index" });
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

    async function onDeveloperLogin() {
      if (!isAgree.value) {
        e.index.showToast({
          title: "请先同意用户协议与隐私政策",
          icon: "none"
        });
        return;
      }
      
      e.index.showModal({
        title: "模拟手机号登录",
        content: "",
        editable: true,
        placeholderText: "请输入测试登录的手机号（11位数字）",
        success: async (res) => {
          if (res.confirm) {
            const phone = res.content ? res.content.trim() : "";
            if (!/^\d{11}$/.test(phone)) {
              e.index.showToast({ title: "请输入11位数字手机号", icon: "none" });
              return;
            }
            
            e.index.showLoading({ title: "安全登录中..." });
            try {
              // Pass the raw 11-digit phone number directly to login
              await userStore.login(phone);
              e.index.hideLoading();
              e.index.showToast({
                title: "登录成功",
                icon: "success"
              });
              setTimeout(() => {
                e.index.navigateBack({
                  fail: () => {
                    e.index.switchTab({ url: "/pages/profile/index" });
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
        }
      });
    }

    function onCancel() {
      e.index.navigateBack({
        fail: () => {
          e.index.switchTab({ url: "/pages/index/index" });
        }
      });
    }

    function viewAgreement() {
      e.index.navigateTo({
        url: "/pages/auth/agreement/index"
      });
    }

    function viewPrivacy() {
      e.index.navigateTo({
        url: "/pages/auth/privacy/index"
      });
    }

    return (props, context) => {
      return {
        a: e.unref(isAgree),
        b: e.o(onLoginTap),
        c: e.o(onGetPhoneNumber),
        d: e.o(onCancel),
        e: e.o(onCheckboxChange),
        f: e.o(viewAgreement),
        g: e.o(viewPrivacy),
        h: e.unref(isDevTools),
        i: e.o(onDeveloperLogin),
      };
    };
  }
});

wx.createPage(n);
