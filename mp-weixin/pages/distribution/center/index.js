"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const i = e.defineComponent({
    __name: "index",
    setup(i) {
      const a = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          teamCount: 0,
          isDistributor: !1,
        }),
        o = e.ref([]),
        d = e.ref([]),
        n = e.computed(() => (a.value.totalCommission || 0)),
        s = e.computed(() => (a.value.availableCommission || 0)),
        u = e.computed(() => (a.value.teamCount || 0)),
        r = e.computed(() => o.value.slice(0, 5)),
        l = e.computed(() => d.value.slice(0, 4)),
        c = { pending: "冻结中", settled: "已结算", refunded: "已撤销" },
        m = (t) => e.index.navigateTo({ url: t }),
        g = async () => {
          try {
            const n = await t.getDistributorInfo();
            const s = n.data || n;
            const [u, r] = await Promise.all([
              t.getDistributionCommissions(),
              t.getDistributionProducts(),
            ]);
            a.value = s;
            o.value = (u.data && u.data.list) || u.list || [];
            d.value = (r.data && r.data.list) || r.list || [];
          } catch (a) {
            e.index.showToast({ title: "加载分销数据失败", icon: "none" });
          }
        };
      return (
        e.onMounted(g),
        e.onShow(g),
        (t, i) =>
          e.e(
            {
              a: e.t((n.value / 100).toFixed(2)),
              b: e.t((s.value / 100).toFixed(2)),
              c: e.t(u.value),
              d: e.o((e) => m("/pages/distribution/withdraw/index"), "b3"),
              e: e.o((e) => m("/pages/distribution/commission/index"), "36"),
              f: e.o((e) => m("/pages/distribution/team/index"), "40"),
              g: e.o((e) => m("/pages/distribution/invite/index"), "2e"),
              h: e.o((e) => m("/pages/distribution/products/index"), "de"),
              i: e.f(l.value, (t, i, a) => ({
                a: t.image,
                b: e.t(t.name),
                c: e.t((t.price / 100).toFixed(2)),
                d: e.t(`¥${((t.commission || 0) / 100).toFixed(2)}`),
                e: t.id,
                f: e.o((e) => m("/pages/product/detail?id=" + t.id), t.id),
              })),
              j: e.o((e) => m("/pages/distribution/commission/index"), "5f"),
              k: e.f(r.value, (t, i, a) => {
                return {
                  a: t.productImage || "",
                  b: e.t(t.productName || "订单佣金"),
                  c: e.t(t.buyerName),
                  d: e.t(String(t.createdAt || "").split("T")[0]),
                  e: e.t((t.commission / 100).toFixed(2)),
                  f: e.t(c[t.status] || "处理中"),
                  g: e.n(t.status),
                  h: t.id,
                };
              }),
              l: !r.value.length,
            },
            r.value.length ? {} : { m: e.p({ text: "暂无推广订单" }) },
            { n: e.o((e) => m("/pages/distribution/rules/index"), "d5") },
          )
      );
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-6a5afdbe"]]);
wx.createPage(a);
