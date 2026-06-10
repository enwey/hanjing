"use strict";
const e = require("../../../common/vendor.js");
Math || o();
const o = () => "../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(o) {
      const n = [
        {
          icon: "user",
          label: "个人信息",
          url: "/pages/profile/settings/personal-info/index",
          color: "#3B6BF5",
        },
        {
          icon: "lock",
          label: "账号安全",
          url: "/pages/profile/settings/account-security/index",
          color: "#1A9D5C",
        },
      ];
      return (o, r) => ({
        a: e.p({ title: "设置", "show-back": !0 }),
        b: e.f(n, (o, n, r) => ({
          a: e.t("user" === o.icon ? "U" : "L"),
          b: o.color + "15",
          c: o.color,
          d: e.t(o.label),
          e: o.label,
          f: e.o((n) => {
            return ((r = o.url), void e.index.navigateTo({ url: r }));
            var r;
          }, o.label),
        })),
      });
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-2c4614d4"]]);
wx.createPage(r);
