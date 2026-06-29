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
        o = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          frozenCommission: 0,
        }),
        i = e.ref("all"),
        n = [
          { key: "all", label: "全部" },
          { key: "settled", label: "已结算" },
          { key: "pending", label: "待结算" },
          { key: "refunded", label: "已撤销" },
        ],
        s = { settled: "已结算", pending: "待结算", refunded: "已撤销" },
        u = e.computed(() => (o.value.totalCommission || 0)),
        r = e.computed(() => (o.value.frozenCommission || 0)),
        d = e.computed(() => (o.value.availableCommission || 0)),
        v = e.computed(() =>
          "all" === i.value
            ? l.value
            : l.value.filter((e) => e.status === i.value),
        ),
        c = async () => {
          try {
            const [a, i] = await Promise.all([
              t.getDistributionCommissionStats(),
              t.getDistributionCommissions(),
            ]);
            o.value = a.data || a;
            l.value = (i.data && i.data.list) || i.list || [];
          } catch (a) {
            e.index.showToast({ title: "加载佣金明细失败", icon: "none" });
          }
        };
      return (
        e.onMounted(c),
        e.onShow(c),
        (t, a) =>
          e.e(
            {
              a: e.t((u.value / 100).toFixed(2)),
              b: e.t((r.value / 100).toFixed(2)),
              c: e.t((d.value / 100).toFixed(2)),
              d: e.f(n, (t, a, l) => ({
                a: e.t(t.label),
                b: t.key,
                c: i.value === t.key ? 1 : "",
                d: e.o((e) => (i.value = t.key), t.key),
              })),
              e: e.f(v.value, (t, a, l) => {
                return e.e(
                  {
                    a: t.productImage || "",
                    b: e.t(t.productName || "订单佣金"),
                    c: e.t(t.buyerName),
                    d: e.t(String(t.createdAt || "").split("T")[0]),
                    e: 2 === t.commissionLevel,
                  },
                  (t.commissionLevel, {}),
                  {
                    f: e.t((t.commission / 100).toFixed(2)),
                    g: e.t(s[t.status] || "处理中"),
                    h: e.n(t.status),
                    i: t.id,
                  },
                );
              }),
              f: !v.value.length,
            },
            v.value.length ? {} : { g: e.p({ text: "暂无佣金记录" }) },
          )
      );
    },
  }),
  l = e._export_sfc(a, [["__scopeId", "data-v-8fd26dea"]]);
wx.createPage(l);
