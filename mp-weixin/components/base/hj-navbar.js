"use strict";
const e = require("../../common/vendor.js"),
  t = e.defineComponent({
    __name: "hj-navbar",
    props: {
      title: { default: "" },
      bgColor: { default: "#FFFFFF" },
      textColor: { default: "#1F2937" },
      showBack: { type: Boolean, default: !1 },
      fixed: { type: Boolean, default: !0 },
      transparent: { type: Boolean, default: !1 },
    },
    emits: ["back"],
    setup(t, { emit: a }) {
      const o = a,
        n = e.ref(0),
        showNavbar = e.ref(!1);
      e.onMounted(() => {
        const t = e.index.getWindowInfo();
        n.value = t.statusBarHeight || 44;
        const s = getCurrentPages(),
          c = s[s.length - 1],
          r = c ? c.route : "";
        showNavbar.value = [
          "pages/index/index",
          "pages/appointment/index",
          "pages/assessment/index",
          "pages/treatment/index",
          "pages/product/index",
          "pages/profile/index",
          "pages/treatment/sleep-report/index",
        ].includes(r);
      });
      const r = e.computed(() => n.value + 44);
      function l() {
        (o("back"), e.index.navigateBack({ delta: 1 }));
      }
      return (t, a) =>
        e.e(
          { showNavbar: showNavbar.value },
          { a: t.showBack },
          t.showBack ? { b: t.textColor, c: e.o(l, "99") } : {},
          {
            d: e.t(t.title),
            e: t.textColor,
            f: "44px",
            g: t.fixed ? 1 : "",
            h: t.transparent ? 1 : "",
            i: r.value + "px",
            j: n.value + "px",
            k: t.transparent ? "transparent" : t.bgColor,
            l: t.fixed,
          },
          t.fixed ? { m: r.value + "px" } : {},
        );
    },
  }),
  a = e._export_sfc(t, [["__scopeId", "data-v-1529c78d"]]);
wx.createComponent(a);
