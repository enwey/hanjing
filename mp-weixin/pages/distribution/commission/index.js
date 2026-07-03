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
      const commissionList = e.ref([]),
        commissionStats = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          frozenCommission: 0,
        }),
        activeTab = e.ref("all"),
        tabList = [
          { key: "all", label: "全部" },
          { key: "settled", label: "已结算" },
          { key: "pending", label: "待结算" },
          { key: "refunded", label: "已撤销" },
        ],
        statusNames = { settled: "已结算", pending: "待结算", refunded: "已撤销" },
        totalCommission = e.computed(() => (commissionStats.value.totalCommission || 0)),
        frozenCommission = e.computed(() => (commissionStats.value.frozenCommission || 0)),
        availableCommission = e.computed(() => (commissionStats.value.availableCommission || 0)),
        filteredCommissionList = e.computed(() =>
          "all" === activeTab.value
            ? commissionList.value
            : commissionList.value.filter((e) => e.status === activeTab.value),
        ),
        loadData = async () => {
          try {
            const [statsRes, listRes] = await Promise.all([
              t.getDistributionCommissionStats(),
              t.getDistributionCommissions(),
            ]);
            commissionStats.value = statsRes.data || statsRes;
            commissionList.value = (listRes.data && listRes.data.list) || listRes.list || [];
          } catch (err) {
            e.index.showToast({ title: "加载佣金明细失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (t, a) =>
          e.e(
            {
              a: e.t((totalCommission.value / 100).toFixed(2)),
              b: e.t((frozenCommission.value / 100).toFixed(2)),
              c: e.t((availableCommission.value / 100).toFixed(2)),
              d: e.f(tabList, (t, a, l) => ({
                a: e.t(t.label),
                b: t.key,
                c: activeTab.value === t.key ? 1 : "",
                d: e.o((e) => (activeTab.value = t.key), t.key),
              })),
              e: e.f(filteredCommissionList.value, (t, a, l) => {
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
                    g: e.t(statusNames[t.status] || "处理中"),
                    h: e.n(t.status),
                    i: t.id,
                  },
                );
              }),
              f: !filteredCommissionList.value.length,
            },
            filteredCommissionList.value.length ? {} : { g: e.p({ text: "暂无佣金记录" }) },
          )
      );
    },
  }),
  l = e._export_sfc(a, [["__scopeId", "data-v-8fd26dea"]]);
wx.createPage(l);
