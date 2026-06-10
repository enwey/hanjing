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
        i = { gold: "黄金", silver: "白银", diamond: "钻石" };
      return (
        e.onMounted(async () => {
          var e;
          try {
            const [a, i] = await Promise.all([
              t.getTeamMembers(),
              t.getDistributorInfo(),
            ]);
            n.value = (null == (e = a.data) ? void 0 : e.list) || a.list || [];
            const s = i.data || i;
            ((o.value = s.teamCount || 0),
              (l.value = s.teamLevel2Count || 0),
              (r.value = (s.totalSales || 0) / 1e4));
          } catch (a) {}
        }),
        (t, a) =>
          e.e(
            {
              a: e.t(o.value),
              b: e.t(l.value),
              c: e.t(r.value.toFixed(1)),
              d: e.f(n.value, (t, a, n) => ({
                a: e.t(t.nickname[0]),
                b: e.t(t.nickname),
                c: e.t(t.orderCount),
                d: e.t(i[t.level]),
                e: e.n(t.level),
                f: e.t((t.totalSales / 1e4).toFixed(1)),
                g: t.id,
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
