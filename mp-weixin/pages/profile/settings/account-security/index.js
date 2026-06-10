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
      return (
        e.onMounted(async () => {
          const e = await a.getAccountSecurity();
          ((n.value = e.data || e), (l.value = !1));
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
