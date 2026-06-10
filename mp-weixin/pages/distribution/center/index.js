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
      const a = e.ref(null),
        o = e.ref([]),
        d = e.ref([]),
        n = e.computed(() => {
          var e;
          return (null == (e = a.value) ? void 0 : e.totalCommission) || 0;
        }),
        s = e.computed(() => {
          var e;
          return (null == (e = a.value) ? void 0 : e.availableCommission) || 0;
        }),
        u = e.computed(() => {
          var e;
          return (null == (e = a.value) ? void 0 : e.teamCount) || 0;
        }),
        r = e.computed(() => o.value.slice(0, 5)),
        l = e.computed(() => d.value.slice(0, 4)),
        c = { pending: "待结算", settled: "已结算", cancelled: "已取消" },
        m = (t) => e.index.navigateTo({ url: t });
      return (
        e.onMounted(async () => {
          var e, i;
          try {
            const [n, s, u] = await Promise.all([
              t.getDistributorInfo(),
              t.getDistributionOrders(),
              t.getDistributionProducts(),
            ]);
            ((a.value = n.data || n),
              (o.value =
                (null == (e = s.data) ? void 0 : e.list) || s.list || []),
              (d.value =
                (null == (i = u.data) ? void 0 : i.list) || u.list || []));
          } catch (n) {}
        }),
        (t, i) =>
          e.e(
            {
              a: e.t((n.value / 100).toFixed(0)),
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
                c: e.t((t.price / 100).toFixed(0)),
                d: e.t(((t.price * t.commissionRate) / 100).toFixed(0)),
                e: t.id,
                f: e.o((e) => m("/pages/product/detail?id=" + t.id), t.id),
              })),
              j: e.o((e) => m("/pages/distribution/commission/index"), "5f"),
              k: e.f(r.value, (t, i, a) => {
                return {
                  a: t.productImage,
                  b: e.t(t.productName),
                  c: e.t(t.buyerName),
                  d: e.t(((o = t.createdAt), o.split("T")[0])),
                  e: e.t((t.commission / 100).toFixed(2)),
                  f: e.t(c[t.status]),
                  g: e.n(t.status),
                  h: t.id,
                };
                var o;
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
