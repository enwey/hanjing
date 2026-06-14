"use strict";
const e = require("../../common/vendor.js"),
  i = require("../../stores/index.js");
Math || l();
const l = () => "../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(l) {
      const n = i.useUserStore();
      e.onShow(async () => {
        const token = e.index.getStorageSync("access_token");
        if (token) {
          n.profile || (await n.fetchProfile());
        }
      });
      e.onMounted(async () => {
        const token = e.index.getStorageSync("access_token");
        if (token) {
          n.profile || (await n.fetchProfile());
        }
      });
      function onUserCardTap() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
        } else {
          e.index.navigateTo({ url: "/pages/profile/settings/index" });
        }
      }
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
        return {
          a: e.p({ title: "我的" }),
          b: e.t(
            (e.unref(n).profile && e.unref(n).profile.nickname
              ? e.unref(n).profile.nickname.slice(0, 1)
              : "👤"),
          ),
          c: e.t(
            (e.unref(n).profile && e.unref(n).profile.nickname
              ? e.unref(n).profile.nickname
              : "点击登录"),
          ),
          d: e.f(r, (i, l, nVal) => ({
            a: e.t(i.title),
            b: e.f(i.items, (i, l, nVal2) => ({
              a: e.t(i.icon),
              b: e.t(i.label),
              c: i.label,
              d: e.o((l) => {
                const token = e.index.getStorageSync("access_token");
                if (i.label !== "在线客服" && !token) {
                  e.index.navigateTo({ url: "/pages/auth/login" });
                  return;
                }
                return ((nVal3 = i.url), void e.index.navigateTo({ url: nVal3 }));
                var nVal3;
              }, i.label),
            })),
            c: i.title,
          })),
          e: e.o(onUserCardTap),
          f: e.t(
            (e.unref(n).profile
              ? (e.unref(n).profile.memberLevel === "gold" ? "黄金会员" : "普通会员")
              : "未登录"),
          ),
        };
      };
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-093cfe40"]]);
wx.createPage(r);
