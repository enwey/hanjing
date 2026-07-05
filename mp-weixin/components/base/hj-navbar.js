"use strict";
const e = require("../../common/vendor.js");

const routeTitles = {
  "pages/profile/device-manage/index": "阻鼾器管理",
  "pages/profile/settings/index": "设置",
  "pages/distribution/center/index": "分销中心",
  "pages/distribution/commission/index": "佣金明细",
  "pages/distribution/orders/index": "推广订单",
  "pages/distribution/invite/index": "邀请好友",
  "pages/distribution/products/index": "推广商品",
  "pages/distribution/rules/index": "分销规则",
  "pages/distribution/team/index": "团队成员",
  "pages/distribution/withdraw-records/index": "提现记录",
  "pages/distribution/withdraw/index": "提现申请",
  "pages/live/list/index": "直播中心",
  "pages/live/playback/index": "直播详情"
};

const t = e.defineComponent({
  __name: "hj-navbar",
  props: {
    title: { default: "" },
    bgColor: { default: "#FFFFFF" },
    textColor: { default: "#1F2937" },
    showBack: { type: Boolean, default: !1 },
    customBack: { type: Boolean, default: !1 },
    fixed: { type: Boolean, default: !0 },
    transparent: { type: Boolean, default: !1 },
  },
  emits: ["back"],
  setup(t, { emit: a }) {
    const emit = a,
      statusBarHeight = e.ref(0),
      cHeight = e.ref(44),
      showNavbar = e.ref(!1),
      isTabbarPage = e.ref(!1),
      pageRoute = e.ref("");
    e.onMounted(() => {
      const t = e.index.getWindowInfo();
      statusBarHeight.value = t.statusBarHeight || 20;
      
      let capsule = { top: 0, height: 0 };
      try {
        capsule = e.index.getMenuButtonBoundingClientRect();
      } catch (err) {
        console.error("[hj-navbar] getMenuButtonBoundingClientRect fail", err);
      }
      
      if (capsule && capsule.top && capsule.height) {
        const gap = capsule.top - statusBarHeight.value;
        cHeight.value = (gap * 2) + capsule.height;
      } else {
        cHeight.value = 44;
      }

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
    const totalHeight = e.computed(() => statusBarHeight.value + cHeight.value);
    const shouldShowBack = e.computed(() => {
      if (t.showBack) return true;
      const pages = getCurrentPages();
      if (pages.length <= 1) return false;
      return !isTabbarPage.value;
    });
    const navbarTitle = e.computed(() => {
      if (t.title) return t.title;
      if (pageRoute.value && routeTitles[pageRoute.value]) {
        return routeTitles[pageRoute.value];
      }
      return "";
    });
    function goBack() {
      emit("back");
      if (t.customBack) {
        return;
      }
      e.index.navigateBack({
        delta: 1,
        fail() {
          e.index.switchTab({
            url: "/pages/appointment/index"
          });
        }
      });
    }
    return (t, a) =>
      e.e(
        { showNavbar: showNavbar.value },
        { a: e.unref(shouldShowBack) },
        e.unref(shouldShowBack) ? { b: t.textColor, c: e.o(goBack, "99") } : {},
        {
          d: e.t(e.unref(navbarTitle)),
          e: t.textColor,
          f: cHeight.value + "px",
          g: t.fixed ? 1 : "",
          h: t.transparent ? 1 : "",
          i: totalHeight.value + "px",
          j: statusBarHeight.value + "px",
          k: t.transparent ? "transparent" : t.bgColor,
          l: t.fixed,
        },
        t.fixed ? { m: totalHeight.value + "px" } : {},
      );
  },
});
const a = e._export_sfc(t, [["__scopeId", "data-v-1529c78d"]]);
wx.createComponent(a);
