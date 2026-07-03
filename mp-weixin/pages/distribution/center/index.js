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
      const distributorInfo = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          teamCount: 0,
          isDistributor: !1,
        }),
        commissionList = e.ref([]),
        productList = e.ref([]),
        totalCommission = e.computed(() => (distributorInfo.value.totalCommission || 0)),
        availableCommission = e.computed(() => (distributorInfo.value.availableCommission || 0)),
        teamCount = e.computed(() => (distributorInfo.value.teamCount || 0)),
        recentCommissions = e.computed(() => commissionList.value.slice(0, 5)),
        hotProducts = e.computed(() => productList.value.slice(0, 4)),
        commissionStatusNames = { pending: "冻结中", settled: "已结算", refunded: "已撤销" },
        goPage = (t) => e.index.navigateTo({ url: t }),
        loadData = async () => {
          try {
            const infoRes = await t.getDistributorInfo();
            const infoResData = infoRes.data || infoRes;
            const [commissionsRes, productsRes] = await Promise.all([
              t.getDistributionCommissions(),
              t.getDistributionProducts(),
            ]);
            distributorInfo.value = infoResData;
            commissionList.value = (commissionsRes.data && commissionsRes.data.list) || commissionsRes.list || [];
            productList.value = (productsRes.data && productsRes.data.list) || productsRes.list || [];
          } catch (err) {
            e.index.showToast({ title: "加载分销数据失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (t, i) =>
          e.e(
            {
              a: e.t((totalCommission.value / 100).toFixed(2)),
              b: e.t((availableCommission.value / 100).toFixed(2)),
              c: e.t(teamCount.value),
              d: e.o((e) => goPage("/pages/distribution/withdraw/index"), "b3"),
              e: e.o((e) => goPage("/pages/distribution/commission/index"), "36"),
              f: e.o((e) => goPage("/pages/distribution/team/index"), "40"),
              g: e.o((e) => goPage("/pages/distribution/invite/index"), "2e"),
              h: e.o((e) => goPage("/pages/distribution/products/index"), "de"),
              i: e.f(hotProducts.value, (t, i, a) => ({
                a: t.image,
                b: e.t(t.name),
                c: e.t((t.price / 100).toFixed(2)),
                d: e.t(`¥${((t.commission || 0) / 100).toFixed(2)}`),
                e: t.id,
                f: e.o((e) => goPage("/pages/product/detail?id=" + t.id), t.id),
              })),
              j: e.o((e) => goPage("/pages/distribution/commission/index"), "5f"),
              k: e.f(recentCommissions.value, (t, i, a) => {
                return {
                  a: t.productImage || "",
                  b: e.t(t.productName || "订单佣金"),
                  c: e.t(t.buyerName),
                  d: e.t(String(t.createdAt || "").split("T")[0]),
                  e: e.t((t.commission / 100).toFixed(2)),
                  f: e.t(commissionStatusNames[t.status] || "处理中"),
                  g: e.n(t.status),
                  h: t.id,
                };
              }),
              l: !recentCommissions.value.length,
            },
            recentCommissions.value.length ? {} : { m: e.p({ text: "暂无推广订单" }) },
            { n: e.o((e) => goPage("/pages/distribution/rules/index"), "d5") },
          )
      );
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-6a5afdbe"]]);
wx.createPage(a);
