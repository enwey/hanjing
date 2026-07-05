"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const i = {
    normal: "普通会员",
    silver: "白银会员",
    gold: "黄金会员",
    diamond: "钻石会员",
  },
  a = { pending: "冻结中", settled: "已结算", refunded: "已撤销" },
  o = e.defineComponent({
    __name: "index",
    setup(o) {
      const n = e.ref({
          totalCommission: 0,
          availableCommission: 0,
          teamCount: 0,
          isDistributor: !1,
          canOpenDistribution: !1,
          openDisabledReason: "",
          memberLevel: "normal",
        }),
        r = e.ref([]),
        c = e.ref(!1),
        d = e.computed(() => !!n.value.isDistributor),
        u = e.computed(() => !!n.value.canOpenDistribution),
        l = e.computed(() => i[n.value.memberLevel] || "普通会员"),
        m = e.computed(() =>
          n.value.openDisabledReason || "开通后即可拥有邀请码、推广海报、佣金明细和团队数据。",
        ),
        p = e.computed(() => [
          {
            icon: "/static/icons/fee.svg",
            label: "提现",
            tap: () => y("/pages/distribution/withdraw/index"),
          },
          {
            icon: "/static/icons/price.svg",
            label: "佣金明细",
            tap: () => y("/pages/distribution/commission/index"),
          },
          {
            icon: "/static/icons/community.svg",
            label: "团队成员",
            tap: () => y("/pages/distribution/team/index"),
          },
          {
            icon: "/static/icons/paper-plane.svg",
            label: "邀请好友",
            tap: () => y("/pages/distribution/invite/index"),
          },
        ]),
        
        f = e.computed(() =>
          r.value.slice(0, 5).map((t) => ({
            id: t.id,
            name: t.productName || "",
            buyerName: t.buyerName || "",
            dateText: String(t.createdAt || "").slice(0, 10),
            commissionText: (Number(t.commission || 0) / 100).toFixed(2),
            statusText: a[t.status] || "",
            statusClass: t.status || "",
            image: t.productImage || "",
          })),
        ),
        y = (t) => e.index.navigateTo({ url: t }),
        h = async () => {
          c.value = !0;
          try {
            const [iData, aData] = await Promise.all([
              t.getDistributorInfo(),
              t.getDistributionOrders(),
            ]);
            n.value = iData.data || iData || {};
            r.value = (aData.data && aData.data.list) || aData.list || [];
          } catch (iErr) {
            e.index.showToast({ title: "加载分销数据失败", icon: "none" });
          } finally {
            c.value = !1;
          }
        },
        v = async () => {
          if (!u.value || c.value) return;
          try {
            e.index.showLoading({ title: "开通中..." });
            await t.openDistribution();
            e.index.hideLoading();
            e.index.showToast({ title: "分销已开通", icon: "success" });
            await h();
          } catch (iErr) {
            e.index.hideLoading();
            e.index.showToast({
              title: (iErr && iErr.message) || "开通失败",
              icon: "none",
            });
          }
        };
      return (
        e.onMounted(h),
        e.onShow(h),
        (t, i) =>
          e.e(
            {
              a: d.value,
            },
            d.value
              ? {
                  b: e.t((Number(n.value.totalCommission || 0) / 100).toFixed(2)),
                  c: e.t((Number(n.value.availableCommission || 0) / 100).toFixed(2)),
                  d: e.t(n.value.teamCount || 0),
                  e: e.f(p.value, (t, i, a) => ({
                    a: t.icon,
                    b: e.t(t.label),
                    c: t.label,
                    d: e.o(t.tap, t.label),
                  })),
                }
              : {
                  f: e.t(l.value),
                  g: e.t(m.value),
                  h: u.value ? "" : 1,
                  i: e.t(u.value ? "立即开通分销" : "暂不满足开通条件"),
                  j: e.o(v, "1c"),
                },
            d.value
              ? e.e(
                  {
                    o: e.o((e) => y("/pages/distribution/orders/index"), "99"),
                    p: e.f(f.value, (t, i, a) => ({
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
                    q: !f.value.length,
                  },
                  f.value.length ? {} : { r: e.p({ text: "暂无推广订单" }) },
                )
              : {},
            { s: e.o((e) => y("/pages/distribution/rules/index"), "b9") },
          )
      );
    },
  }),
  n = e._export_sfc(o, [["__scopeId", "data-v-6a5afdbe"]]);
wx.createPage(n);
