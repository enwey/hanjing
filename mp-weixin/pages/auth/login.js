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
      e.index.showModal({
        title: "用户协议",
        content: "本协议是您与鼾静健康诊所关于使用本小程序各项服务所订立的契约。我们非常重视您的隐私，您的就诊信息、睡眠监测数据将严格受法律保护，不用于未经您授权的任何其他商业用途。",
        showCancel: false
      });
    }

    function viewPrivacy() {
      e.index.showModal({
        title: "隐私政策",
        content: "我们收集您的手机号码仅用于就诊档案实名绑定、预约挂号提醒及治疗追踪服务；收集您的地理位置仅用于为您匹配最近的线下诊所；麦克风权限仅在您启动“鼾声分析”时使用，且音频仅用于AI睡眠呼吸指标评估。我们绝不会向任何第三方披露您的敏感健康与个人隐私信息。",
        showCancel: false
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
