"use strict";
const e = require("../../../common/vendor.js"),
  l = require("../../../api/index.js");
Math || n();
const n = () => "../../../components/base/hj-navbar.js",
  t = e.defineComponent({
    __name: "index",
    setup(n) {
      const t = e.ref(null),
        a = e.ref([]),
        r = e.ref(!0);
      function formatPriceYuan(e) {
        return "¥" + (e / 100).toFixed(0);
      }
      const redeemCoupons = e.ref([]);

      async function loadAvailableCoupons() {
        try {
          const res = await l.getAvailableCoupons();
          redeemCoupons.value = res.data?.list || res.list || [];
        } catch (err) {
          console.error("[Member Benefits] Fetch coupons error:", err);
        }
      }

      async function onRedeemCoupon(couponId) {
        e.index.showModal({
          title: "确认兑换",
          content: "确定要消耗积分兑换该代金券吗？",
          success: async (res) => {
            if (res.confirm) {
              try {
                e.index.showLoading({ title: "兑换中..." });
                const redeemRes = await l.redeemCoupon(couponId);
                if (redeemRes && redeemRes.code === 0) {
                  e.index.showToast({ title: "兑换成功", icon: "success" });
                  const infoRes = await l.getMemberInfo();
                  t.value = infoRes.data || infoRes;
                } else {
                  e.index.showToast({ title: redeemRes.message || "兑换失败", icon: "none" });
                }
              } catch (err) {
                e.index.showToast({ title: "兑换失败，请重试", icon: "none" });
              } finally {
                e.index.hideLoading();
              }
            }
          }
        });
      }

      e.onMounted(async () => {
        const [eVal, nVal] = await Promise.all([
          l.getMemberInfo(),
          l.getMemberLevels(),
          loadAvailableCoupons()
        ]);
        ((t.value = eVal.data || eVal), (a.value = nVal.data || nVal), (r.value = !1));
      });
      const u = {
          normal: { bg: "#F3F4F6", color: "#9CA3AF" },
          silver: { bg: "#F3F4F6", color: "#6B7280" },
          gold: {
            bg: "linear-gradient(135deg, #FFF9E6, #FFEDB3)",
            color: "#F5A623",
          },
          diamond: {
            bg: "linear-gradient(135deg, #EEF4FF, #D9E6FF)",
            color: "#3B6BF5",
          },
        },
        i = {
          appointment: "A",
          assess: "S",
          discount: "D",
          service: "V",
          channel: "C",
          free: "F",
        };
      function calculateNextLevelProgress() {
        if (!t.value || !a.value.length) return { percent: 0, diff: 0 };
        const e = a.value.find((e) => e.level === t.value.currentLevel),
          l = a.value.findIndex((e) => e.level === t.value.currentLevel) + 1;
        if (l >= a.value.length) return { percent: 100, diff: 0 };
        const n = a.value[l],
          r = (null == e ? void 0 : e.spentRequired) || 0,
          v = n.spentRequired,
          u = t.value.totalSpent;
        return {
          percent: Math.min(Math.round(((u - r) / (v - r)) * 100), 100),
          diff: v - u,
          nextTitle: n.title,
        };
      }
      return (l, n) =>
        e.e(
          { a: e.p({ title: "会员权益", "show-back": !0 }), b: r.value },
          r.value
            ? {}
            : t.value
              ? e.e(
                  {
                    d: e.t(
                      "gold" === t.value.currentLevel
                        ? "黄金会员"
                        : "diamond" === t.value.currentLevel
                          ? "钻石会员"
                          : "silver" === t.value.currentLevel
                            ? "白银会员"
                            : "普通会员",
                    ),
                    e: e.t(formatPriceYuan(t.value.totalSpent)),
                    f: e.t(t.value.points),
                    g: calculateNextLevelProgress().diff > 0,
                    points: t.value.points,
                    nRedeemCoupons: e.f(redeemCoupons.value, (item) => ({
                      id: item.id,
                      title: item.title,
                      value: item.value,
                      minSpend: item.minSpend,
                      pointsCost: item.pointsCost,
                      onRedeem: e.o(() => onRedeemCoupon(item.id), item.id),
                    })),
                  },
                  calculateNextLevelProgress().diff > 0
                    ? {
                        h: e.t(formatPriceYuan(calculateNextLevelProgress().diff)),
                        i: e.t(calculateNextLevelProgress().nextTitle),
                        j: calculateNextLevelProgress().percent + "%",
                      }
                    : {},
                  {
                    k: (u[t.value.currentLevel] || u.normal).bg,
                    l: e.f(a.value, (l, n, r) =>
                      e.e(
                        {
                          a:
                            a.value.indexOf(l) <=
                            a.value.findIndex(
                              (e) => e.level === t.value.currentLevel,
                            ),
                        },
                        a.value.indexOf(l) <=
                          a.value.findIndex(
                            (e) => e.level === t.value.currentLevel,
                          )
                          ? {
                              b: e.f(l.benefits, (n, r, v) =>
                                e.e(
                                  {
                                    a: e.t(i[n.icon] || "?"),
                                    b: e.t(n.title),
                                    c: e.t(n.desc),
                                  },
                                  (a.value.indexOf(l),
                                  a.value.findIndex(
                                    (e) => e.level === t.value.currentLevel,
                                  ),
                                  {}),
                                  { d: n.title },
                                ),
                              ),
                              c:
                                a.value.indexOf(l) <=
                                a.value.findIndex(
                                  (e) => e.level === t.value.currentLevel,
                                )
                                  ? 1
                                  : "",
                              d:
                                a.value.indexOf(l) <=
                                a.value.findIndex(
                                  (e) => e.level === t.value.currentLevel,
                                ),
                            }
                          : {},
                        { e: l.level },
                      ),
                    ),
                    m: e.f(a.value, (l, n, a) =>
                      e.e(
                        {
                          a: l.color,
                          b: e.t(l.title),
                          c: e.t(formatPriceYuan(l.spentRequired)),
                          d: e.t("normal" === l.level ? "即享" : "升级"),
                          e: l.level === t.value.currentLevel,
                        },
                        (l.level, t.value.currentLevel, {}),
                        { f: l.level },
                      ),
                    ),
                  },
                )
              : {},
          { c: t.value },
        );
    },
  }),
  a = e._export_sfc(t, [["__scopeId", "data-v-bf62d399"]]);
wx.createPage(a);
