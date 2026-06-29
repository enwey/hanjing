"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const a = e.defineComponent({
    __name: "index",
    setup(a) {
      const n = e.ref([]),
        o = e.ref(0),
        l = e.ref(0),
        r = e.ref(0),
        i = { gold: "金牌", silver: "银牌", diamond: "钻石" },
        s = async () => {
          try {
            const [a, s] = await Promise.all([
              t.getTeamMembers(),
              t.getDistributorInfo(),
            ]);
            const members = ((a.data && a.data.list) || a.list || []).map((t) => ({
              ...t,
              avatarText: (t.nickname || "用").slice(0, 1),
              joinedAtText: t.joinedAt || "",
            }));
            n.value = members;
            const u = s.data || s;
            o.value = u.teamCount || 0;
            l.value = u.teamLevel2Count || 0;
            r.value = members.reduce((sum, item) => sum + Number(item.totalSales || 0), 0) / 1e4;
          } catch (a) {
            e.index.showToast({ title: "加载团队成员失败", icon: "none" });
          }
        };
      return (
        e.onMounted(s),
        e.onShow(s),
        (t, a) =>
          e.e(
            {
              a: e.t(o.value),
              b: e.t(l.value),
              c: e.t(r.value.toFixed(1)),
              d: e.f(n.value, (t, a, n) => ({
                a: e.t(t.avatarText),
                b: e.t(t.nickname),
                c: e.t(t.orderCount),
                d: e.t(i[t.level] || "银牌"),
                e: e.n(t.level),
                f: e.t((t.totalSales / 1e4).toFixed(1)),
                g: t.id,
                h: e.t(t.statusText || ""),
                i: e.t(t.statusClass || ""),
                j: e.t(t.joinedAtText || ""),
              })),
              e: !n.value.length,
            },
            n.value.length ? {} : { f: e.p({ text: "暂无团队成员" }) },
          )
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-e9b2690b"]]);
wx.createPage(n);
