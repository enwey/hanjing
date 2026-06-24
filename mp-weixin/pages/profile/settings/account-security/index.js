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
            { a: e.p({ title: "账号安全", "show-back": !0 }), b: l.value },
            l.value
              ? {}
              : n.value
                ? {
                    d: e.t(n.value.phone),
                    e: e.t(n.value.hasPassword ? "已设置" : "未设置"),
                    f: e.t(
                      n.value.realNameVerified
                        ? "已认证（" + n.value.realName + "）"
                        : "未认证",
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
