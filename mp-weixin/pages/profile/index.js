"use strict";
const e = require("../../common/vendor.js"),
  i = require("../../stores/index.js");
Math || l();
const l = () => "../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(l) {
      const n = i.useUserStore();
      e.onMounted(async () => {
        n.profile || (await n.fetchProfile());
      });
      const r = [
        {
          title: "我的健康",
          items: [
            {
              icon: "📋",
              label: "病历档案",
              url: "/pages/profile/medical-records/index",
            },
            {
              icon: "💊",
              label: "阻鼾器管理",
              url: "/pages/profile/device-manage/wearing-data/index",
            },
            {
              icon: "👨‍👩‍👧",
              label: "家庭成员",
              url: "/pages/profile/family-members/index",
            },
          ],
        },
        {
          title: "我的服务",
          items: [
            {
              icon: "💰",
              label: "会员权益",
              url: "/pages/profile/member-benefits/index",
            },
            { icon: "📦", label: "我的订单", url: "/pages/order/index" },
            {
              icon: "🔗",
              label: "分销中心",
              url: "/pages/distribution/center/index",
            },
            { icon: "🎬", label: "直播中心", url: "/pages/live/list/index" },
          ],
        },
        {
          title: "其他",
          items: [
            {
              icon: "💬",
              label: "在线客服",
              url: "/pages/profile/online-service/index",
            },
            {
              icon: "🔔",
              label: "消息通知",
              url: "/pages/profile/notifications/index",
            },
            { icon: "⚙️", label: "设置", url: "/pages/profile/settings/index" },
          ],
        },
      ];
      return (i, l) => {
        var t, a, o;
        return {
          a: e.p({ title: "我的" }),
          b: e.t(
            (null ==
            (a = null == (t = e.unref(n).profile) ? void 0 : t.nickname)
              ? void 0
              : a.slice(0, 1)) || "张",
          ),
          c: e.t(
            (null == (o = e.unref(n).profile) ? void 0 : o.nickname) ||
              "张先生",
          ),
          d: e.f(r, (i, l, n) => ({
            a: e.t(i.title),
            b: e.f(i.items, (i, l, n) => ({
              a: e.t(i.icon),
              b: e.t(i.label),
              c: i.label,
              d: e.o((l) => {
                return ((n = i.url), void e.index.navigateTo({ url: n }));
                var n;
              }, i.label),
            })),
            c: i.title,
          })),
        };
      };
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-093cfe40"]]);
wx.createPage(r);
