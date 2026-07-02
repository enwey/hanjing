"use strict";
const e = require("../../../../common/vendor.js"),
  a = require("../../../../api/index.js");
Math || t();
const t = () => "../../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref(null),
        l = e.ref(!0);

      const showPhoneModal = e.ref(false);
      const showRealnameModal = e.ref(false);
      const inputPhone = e.ref("");
      const inputCode = e.ref("");
      const inputRealName = e.ref("");
      const inputIdCard = e.ref("");

      async function fetchInfo() {
        try {
          const res = await a.getAccountSecurity();
          n.value = res.data || res;
        } catch (err) {
          console.error(err);
        }
      }

      async function onGetCode() {
        const phone = inputPhone.value.trim();
        if (!phone || !/^1\d{10}$/.test(phone)) {
          e.index.showToast({ title: "请输入11位手机号", icon: "none" });
          return;
        }
        try {
          e.index.showLoading({ title: "发送中..." });
          const res = await a.sendPhoneCode(phone);
          if (res && res.code === 0) {
            e.index.showToast({ title: "验证码已发送", icon: "success" });
            if (res.data && res.data.code) {
              inputCode.value = res.data.code;
            }
          } else {
            e.index.showToast({ title: res.message || "发送失败", icon: "none" });
          }
        } catch (err) {
          e.index.showToast({ title: "发送失败，请重试", icon: "none" });
        } finally {
          e.index.hideLoading();
        }
      }

      async function onSubmitPhone() {
        const phone = inputPhone.value.trim();
        const code = inputCode.value.trim();
        if (!phone || !code) {
          e.index.showToast({ title: "请输入手机和验证码", icon: "none" });
          return;
        }
        try {
          e.index.showLoading({ title: "提交中..." });
          const res = await a.changePhone(phone, code);
          if (res && res.code === 0) {
            e.index.showToast({ title: "手机换绑成功", icon: "success" });
            showPhoneModal.value = false;
            await fetchInfo();
          } else {
            e.index.showToast({ title: res.message || "修改失败", icon: "none" });
          }
        } catch (err) {
          e.index.showToast({ title: "操作失败，请重试", icon: "none" });
        } finally {
          e.index.hideLoading();
        }
      }

      async function onSubmitRealname() {
        const realName = inputRealName.value.trim();
        const idCard = inputIdCard.value.trim();
        if (!realName || !idCard) {
          e.index.showToast({ title: "请填写姓名和身份证", icon: "none" });
          return;
        }
        if (!/^\d{17}[\dXx]$/.test(idCard)) {
          e.index.showToast({ title: "身份证格式不正确", icon: "none" });
          return;
        }
        try {
          e.index.showLoading({ title: "认证中..." });
          const res = await a.verifyRealName(realName, idCard);
          if (res && res.code === 0) {
            e.index.showToast({ title: "实名认证成功", icon: "success" });
            showRealnameModal.value = false;
            await fetchInfo();
            try {
              const userStore = require("../../../../stores/index.js").useUserStore();
              await userStore.fetchProfile();
            } catch(ex){}
          } else {
            e.index.showToast({ title: res.message || "认证失败", icon: "none" });
          }
        } catch (err) {
          e.index.showToast({ title: "操作失败，请重试", icon: "none" });
        } finally {
          e.index.hideLoading();
        }
      }

      function onLogout() {
        e.index.showModal({
          title: "提示",
          content: "确定要退出登录吗？",
          success: (res) => {
            if (res.confirm) {
              try {
                const userStore = require("../../../../stores/index.js").useUserStore();
                userStore.logout();
                e.index.showToast({ title: "已退出登录", icon: "success" });
                setTimeout(() => {
                  e.index.switchTab({ url: "/pages/profile/index" });
                }, 1000);
              } catch (err) {
                console.error("[Account Security] Logout failed:", err);
              }
            }
          }
        });
      }
      return (
        e.onMounted(async () => {
          try {
            console.log("[Account Security] Fetching account security info...");
            const res = await a.getAccountSecurity();
            console.log("[Account Security] Fetch success:", JSON.stringify(res));
            n.value = res.data || res;
          } catch (err) {
            console.error("[Account Security] Fetch error:", err);
            e.index.showToast({ title: "加载失败，请重试", icon: "none" });
          } finally {
            l.value = !1;
          }
        }),
        (a, t) => {
          var u;
          return e.e(
            {
              a: e.p({ title: "账号安全", "show-back": !0 }),
              b: l.value,
              showPhoneModal: showPhoneModal.value,
              showRealnameModal: showRealnameModal.value,
              inputPhone: inputPhone.value,
              inputCode: inputCode.value,
              inputRealName: inputRealName.value,
              inputIdCard: inputIdCard.value,
              onPhoneInput: e.o((e) => (inputPhone.value = e.detail.value)),
              onCodeInput: e.o((e) => (inputCode.value = e.detail.value)),
              onRealNameInput: e.o((e) => (inputRealName.value = e.detail.value)),
              onIdCardInput: e.o((e) => (inputIdCard.value = e.detail.value)),
              onGetCode: e.o(onGetCode),
              onSubmitPhone: e.o(onSubmitPhone),
              onSubmitRealname: e.o(onSubmitRealname),
              onOpenPhoneModal: e.o(() => { showPhoneModal.value = true; inputPhone.value = ""; inputCode.value = ""; }),
              onClosePhoneModal: e.o(() => { showPhoneModal.value = false; }),
              onOpenRealnameModal: e.o(() => { showRealnameModal.value = true; inputRealName.value = ""; inputIdCard.value = ""; }),
              onCloseRealnameModal: e.o(() => { showRealnameModal.value = false; }),
            },
            l.value
              ? {}
              : n.value
                ? {
                    d: e.t(n.value.phone),
                    e: e.t(n.value.hasPassword ? "已设置" : "未设置"),
                    f: e.t(
                      n.value.realNameVerified
                        ? "已认证（" + n.value.realName + "）"
                        : "点击去认证",
                    ),
                    g: e.t(
                      null == (u = n.value.lastLogin)
                        ? void 0
                        : u.slice(0, 16).replace("T", " "),
                    ),
                    h: e.t(n.value.loginDevice),
                    i: e.o(onLogout),
                  }
                : {},
            { c: n.value },
          );
        }
      );
    },
  }),
  l = e._export_sfc(n, [["__scopeId", "data-v-ecc58349"]]);
wx.createPage(l);
