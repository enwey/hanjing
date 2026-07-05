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
        r = e.ref(!0),
        s = e.ref("");
      function formatPriceYuan(e) {
        return "¥" + (e / 100).toFixed(0);
      }

      e.onMounted(async () => {
        try {
          const [eVal, nVal] = await Promise.all([
            l.getMemberInfo(),
            l.getMemberLevels()
          ]);
          const memberInfo = eVal && eVal.code === 0 ? eVal.data : null;
          const memberLevels = nVal && nVal.code === 0 && Array.isArray(nVal.data) ? nVal.data : null;
          if (
            !memberInfo ||
            !memberInfo.currentLevel ||
            typeof memberInfo.points !== "number" ||
            typeof memberInfo.totalSpent !== "number" ||
            !memberLevels ||
            !memberLevels.length ||
            !memberLevels.some((item) => item.level === memberInfo.currentLevel)
          ) {
            throw new Error("会员数据不完整");
          }
          t.value = memberInfo;
          a.value = memberLevels;
          s.value = "";
        } catch (err) {
          console.error("[Member Benefits] load error:", err);
          t.value = null;
          a.value = [];
          s.value = err && err.message ? err.message : "会员信息暂不可用";
        } finally {
          r.value = !1;
        }
      });
      const u = {
          normal: {
            bg: "linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)",
            color: "#9A6A14",
          },
          silver: {
            bg: "linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)",
            color: "#9A6A14",
          },
          gold: {
            bg: "linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)",
            color: "#8A5A00",
          },
          diamond: {
            bg: "linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)",
            color: "#8A5A00",
          },
        },
        i = {
          appointment: {
            icon: "/static/icons/calendar.svg",
            bg: "linear-gradient(135deg, #e8f0ff 0%, #cddcff 100%)",
          },
          assess: {
            icon: "/static/icons/assessment.svg",
            bg: "linear-gradient(135deg, #e9fbf1 0%, #c9f2db 100%)",
          },
          discount: {
            icon: "/static/icons/price.svg",
            bg: "linear-gradient(135deg, #fff1e8 0%, #ffd9c2 100%)",
          },
          service: {
            icon: "/static/icons/chat.svg",
            bg: "linear-gradient(135deg, #eef4ff 0%, #d9e6ff 100%)",
          },
          channel: {
            icon: "/static/icons/community.svg",
            bg: "linear-gradient(135deg, #f3ecff 0%, #e1d1ff 100%)",
          },
          free: {
            icon: "/static/icons/heart.svg",
            bg: "linear-gradient(135deg, #fff4dd 0%, #ffe3a8 100%)",
          },
        };
      function getCurrentLevel() {
        if (!t.value || !a.value.length || !t.value.currentLevel) return null;
        return a.value.find((item) => item.level === t.value.currentLevel);
      }
      function getCurrentTheme() {
        const currentLevel = getCurrentLevel();
        return currentLevel ? u[currentLevel.level] : null;
      }
      function getCurrentLevelTitle() {
        const currentLevel = getCurrentLevel();
        return currentLevel ? currentLevel.title : "";
      }
      function getCurrentBenefits() {
        if (!t.value || !a.value.length) return [];
        const currentLevelIndex = a.value.findIndex((item) => item.level === t.value.currentLevel);
        if (currentLevelIndex < 0) return [];
        const mergedBenefits = new Map();
        a.value
          .filter((item, index) => index <= currentLevelIndex)
          .forEach((level) => {
            (Array.isArray(level.benefits) ? level.benefits : []).forEach((benefit) => {
              const benefitMeta = i[benefit.icon];
              if (!benefitMeta || !benefit.title || !benefit.desc) {
                return;
              }
              mergedBenefits.set(benefit.icon, {
                icon: benefitMeta.icon,
                iconBg: benefitMeta.bg,
                title: benefit.title,
                desc: benefit.desc,
              });
            });
          });
        return Array.from(mergedBenefits.values());
      }
      function calculateNextLevelProgress() {
        if (!t.value || !a.value.length) return { percent: 0, diff: 0 };
        const e = a.value.find((e) => e.level === t.value.currentLevel),
          l = a.value.findIndex((e) => e.level === t.value.currentLevel) + 1;
        if (!e || l >= a.value.length) return { percent: 100, diff: 0 };
        const n = a.value[l],
          r = e.spentRequired,
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
                    d: e.t(getCurrentLevelTitle()),
                    e: e.t(formatPriceYuan(t.value.totalSpent)),
                    f: e.t(t.value.points),
                    g: calculateNextLevelProgress().diff > 0,
                  },
                  calculateNextLevelProgress().diff > 0
                    ? {
                        h: e.t(formatPriceYuan(calculateNextLevelProgress().diff)),
                        i: e.t(calculateNextLevelProgress().nextTitle),
                        j: calculateNextLevelProgress().percent + "%",
                      }
                    : {},
                  {
                    k: getCurrentTheme() ? getCurrentTheme().bg : "",
                    l: e.f(getCurrentBenefits(), (l, n, r) =>
                      ({
                        a: l.icon,
                        b: e.t(l.title),
                        c: e.t(l.desc),
                        d: l.iconBg,
                        e: l.title,
                      }),
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
              : { n: e.t(s.value) },
          { c: t.value },
        );
    },
  }),
  a = e._export_sfc(t, [["__scopeId", "data-v-bf62d399"]]);
wx.createPage(a);
