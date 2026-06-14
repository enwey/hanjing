"use strict";
const e = require("../../common/vendor.js");

const routeTitles = {
  "pages/distribution/center/index": "分销中心",
  "pages/distribution/commission/index": "佣金明细",
  "pages/distribution/invite/index": "邀请好友",
  "pages/distribution/products/index": "推广商品",
  "pages/distribution/rules/index": "分销规则",
  "pages/distribution/team/index": "团队成员",
  "pages/distribution/withdraw-records/index": "提现记录",
  "pages/distribution/withdraw/index": "提现申请",
  "pages/live/list/index": "直播中心",
  "pages/live/playback/index": "直播回放"
};

const t = e.defineComponent({
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
      showNavbar = e.ref(!1),
      isTabbarPage = e.ref(!1),
      pageRoute = e.ref("");
    e.onMounted(() => {
      const t = e.index.getWindowInfo();
      n.value = t.statusBarHeight || 44;
      const s = getCurrentPages(),
        c = s[s.length - 1],
        r = c ? c.route : "";
      pageRoute.value = r;
      isTabbarPage.value = [
        "pages/index/index",
        "pages/appointment/index",
        "pages/treatment/index",
        "pages/product/index",
        "pages/profile/index"
      ].includes(r);
      showNavbar.value = true;
    });
    const r = e.computed(() => n.value + 44);
    const shouldShowBack = e.computed(() => {
      if (t.showBack) return true;
      return !isTabbarPage.value;
    });
    const navbarTitle = e.computed(() => {
      if (t.title) return t.title;
      if (pageRoute.value && routeTitles[pageRoute.value]) {
        return routeTitles[pageRoute.value];
      }
      return "";
    });
    function l() {
      o("back");
      e.index.navigateBack({
        delta: 1,
        fail() {
          e.index.switchTab({
            url: "/pages/index/index"
          });
        }
      });
    }
    return (t, a) =>
      e.e(
        { showNavbar: showNavbar.value },
        { a: e.unref(shouldShowBack) },
        e.unref(shouldShowBack) ? { b: t.textColor, c: e.o(l, "99") } : {},
        {
          d: e.t(e.unref(navbarTitle)),
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
});
const a = e._export_sfc(t, [["__scopeId", "data-v-1529c78d"]]);
wx.createComponent(a);
