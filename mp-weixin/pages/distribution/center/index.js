"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const i = { pending: "冻结中", settled: "已结算", refunded: "已撤销" },
  a = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          teamCount: 0,
        }),
        n = e.ref([]),
        r = e.ref(!1),
        s = e.computed(() => [
          {
            icon: "/static/icons/fee.svg",
            label: "提现",
            tap: () => d("/pages/distribution/withdraw/index"),
          },
          {
            icon: "/static/icons/price.svg",
            label: "佣金明细",
            tap: () => d("/pages/distribution/commission/index"),
          },
          {
            icon: "/static/icons/community.svg",
            label: "团队成员",
            tap: () => d("/pages/distribution/team/index"),
          },
          {
            icon: "/static/icons/paper-plane.svg",
            label: "邀请好友",
            tap: () => d("/pages/distribution/invite/index"),
          },
        ]),
        c = e.computed(() =>
          n.value.slice(0, 5).map((e) => ({
            id: e.id,
            name: e.productName || "",
            buyerName: e.buyerName || "",
            dateText: String(e.createdAt || "").slice(0, 10),
            commissionText: (Number(e.commission || 0) / 100).toFixed(2),
            statusText: i[e.status] || "",
            statusClass: e.status || "",
            image: e.productImage || "",
          })),
        ),
        d = (t) => e.index.navigateTo({ url: t }),
        u = async () => {
          r.value = !0;
          try {
            const [iData, aData] = await Promise.all([
              t.getDistributorInfo(),
              t.getDistributionOrders(),
            ]);
            o.value = iData.data || iData || {};
            n.value = (aData.data && aData.data.list) || aData.list || [];
          } catch (iErr) {
            e.index.showToast({ title: "加载分销数据失败", icon: "none" });
          } finally {
            r.value = !1;
          }
        };
      return (
        e.onMounted(u),
        e.onShow(u),
        (t, i) => ({
          a: e.t((Number(o.value.totalCommission || 0) / 100).toFixed(2)),
          b: e.t((Number(o.value.availableCommission || 0) / 100).toFixed(2)),
          c: e.t(o.value.teamCount || 0),
          d: e.f(s.value, (t, i, a) => ({
            a: t.icon,
            b: e.t(t.label),
            c: t.label,
            d: e.o(t.tap, t.label),
          })),
          e: e.o((e) => d("/pages/distribution/orders/index"), "44"),
          f: e.f(c.value, (t, i, a) => ({
            a: t.image,
            b: !t.image,
            c: e.t(t.name),
            d: e.t(t.buyerName),
            e: e.t(t.dateText),
            f: e.t(t.commissionText),
            g: e.t(t.statusText),
            h: e.n(t.statusClass),
            i: t.id,
          })),
          g: !c.value.length,
          h: e.p({ text: "暂无推广订单" }),
          i: e.o((e) => d("/pages/distribution/rules/index"), "12"),
        })
      );
    },
  }),
  o = e._export_sfc(a, [["__scopeId", "data-v-6a5afdbe"]]);
wx.createPage(o);
