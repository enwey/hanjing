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
      const l = e.ref([]),
        o = e.ref({ totalCommission: 0, availableCommission: 0 }),
        i = e.ref("all"),
        n = [
          { key: "all", label: "全部" },
          { key: "settled", label: "已结算" },
          { key: "pending", label: "待结算" },
          { key: "cancelled", label: "已取消" },
        ],
        s = { settled: "已结算", pending: "待结算", cancelled: "已取消" },
        u = e.computed(() => {
          var e;
          return (null == (e = o.value) ? void 0 : e.totalCommission) || 0;
        }),
        r = e.computed(() => {
          var e;
          return (null == (e = o.value) ? void 0 : e.availableCommission) || 0;
        }),
        d = e.computed(() => {
          var e, t;
          return (
            ((null == (e = o.value) ? void 0 : e.totalCommission) || 0) -
            ((null == (t = o.value) ? void 0 : t.availableCommission) || 0)
          );
        }),
        v = e.computed(() =>
          "all" === i.value
            ? l.value
            : l.value.filter((e) => e.status === i.value),
        );
      return (
        e.onMounted(async () => {
          var e;
          try {
            const [a, i] = await Promise.all([
              t.getDistributorInfo(),
              t.getDistributionOrders(),
            ]);
            ((o.value = a.data || a),
              (l.value =
                (null == (e = i.data) ? void 0 : e.list) || i.list || []));
          } catch (a) {}
        }),
        (t, a) =>
          e.e(
            {
              a: e.t((u.value / 100).toFixed(0)),
              b: e.t((r.value / 100).toFixed(2)),
              c: e.t((d.value / 100).toFixed(0)),
              d: e.f(n, (t, a, l) => ({
                a: e.t(t.label),
                b: t.key,
                c: i.value === t.key ? 1 : "",
                d: e.o((e) => (i.value = t.key), t.key),
              })),
              e: e.f(v.value, (t, a, l) => {
                return e.e(
                  {
                    a: t.productImage,
                    b: e.t(t.productName),
                    c: e.t(t.buyerName),
                    d: e.t(((o = t.createdAt), o.split("T")[0])),
                    e: 2 === t.commissionLevel,
                  },
                  (t.commissionLevel, {}),
                  {
                    f: e.t((t.commission / 100).toFixed(2)),
                    g: e.t(s[t.status]),
                    h: e.n(t.status),
                    i: t.id,
                  },
                );
                var o;
              }),
              f: !v.value.length,
            },
            v.value.length ? {} : { g: e.p({ text: "暂无订单" }) },
          )
      );
    },
  }),
  l = e._export_sfc(a, [["__scopeId", "data-v-8fd26dea"]]);
wx.createPage(l);
