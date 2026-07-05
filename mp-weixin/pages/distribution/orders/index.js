"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const i = {
    all: "全部",
    settled: "已结算",
    pending: "冻结中",
    refunded: "已撤销",
  },
  a = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref([]),
        n = e.ref("all"),
        r = e.computed(() =>
          "all" === n.value ? o.value : o.value.filter((e) => e.status === n.value),
        ),
        s = async () => {
          try {
            const eData = await t.getDistributionOrders();
            o.value = (eData.data && eData.data.list) || eData.list || [];
          } catch (iErr) {
            e.index.showToast({ title: "加载推广订单失败", icon: "none" });
          }
        };
      return (
        e.onMounted(s),
        e.onShow(s),
        (t, a) => ({
          a: e.f(Object.keys(i), (t, a, o) => ({
            a: e.t(i[t]),
            b: t,
            c: n.value === t ? 1 : "",
            d: e.o((e) => (n.value = t), t),
          })),
          b: e.f(r.value, (t, a, o) => ({
            a: t.productImage || "",
            b: !(t.productImage || ""),
            c: e.t(t.productName || ""),
            d: e.t(t.buyerName || ""),
            e: e.t(String(t.createdAt || "").slice(0, 10)),
            f: e.t(`订单 ¥${(Number(t.orderAmount || 0) / 100).toFixed(2)}`),
            g: e.t(`佣金 +${(Number(t.commission || 0) / 100).toFixed(2)}`),
            h: e.t(i[t.status] || ""),
            i: e.n(t.status || ""),
            j: 2 === Number(t.commissionLevel || 1),
            k: t.id,
          })),
          c: !r.value.length,
          d: e.p({ text: "暂无推广订单" }),
        })
      );
    },
  }),
  o = e._export_sfc(a, [["__scopeId", "data-v-63e8a384"]]);
wx.createPage(o);
