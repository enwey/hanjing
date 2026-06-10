"use strict";
const e = require("../../../common/vendor.js"),
  n = require("../../../mock/index.js"),
  l = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref(null),
        u = e.ref(!0),
        i = e.computed(() => {
          var e;
          return (null == (e = o.value) ? void 0 : e.snoreAnalysis)
            ? n.getSnoreRiskInfo(o.value.snoreAnalysis.riskLevel)
            : null;
        }),
        t = e.computed(() => {
          var e;
          if (!(null == (e = o.value) ? void 0 : e.snoreAnalysis)) return [];
          const n = o.value.snoreAnalysis;
          return [
            { label: "平均分贝", value: n.avgDecibel + " dB", icon: "🔊" },
            { label: "峰值分贝", value: n.peakDecibel + " dB", icon: "📈" },
            { label: "鼾声占比", value: n.snoreRate + "%", icon: "💤" },
            { label: "呼吸暂停", value: n.apneaEvents + " 次", icon: "⚠️" },
          ];
        }),
        r = e.computed(() => {
          var e;
          if (!(null == (e = o.value) ? void 0 : e.snoreAnalysis)) return 0;
          const n = o.value.snoreAnalysis;
          return Math.min(
            100,
            Math.round(
              (n.avgDecibel / 80) * 30 +
                (n.snoreRate / 100) * 30 +
                (n.apneaEvents / 20) * 40,
            ),
          );
        });
      function s() {
        e.index.switchTab({ url: "/pages/appointment/index" });
      }
      function v() {
        e.index.switchTab({ url: "/pages/index/index" });
      }
      function c() {
        e.index.redirectTo({ url: "/pages/assessment/recording/index" });
      }
      return (
        e.onMounted(async () => {
          var e;
          try {
            const n = getCurrentPages(),
              a = n[n.length - 1],
              u = null == (e = null == a ? void 0 : a.options) ? void 0 : e.id;
            if (u) {
              const e = await l.getSnoreAnalysis(u);
              o.value = e.data;
            }
          } catch (n) {
            console.error("[SnoreResult] 加载失败", n);
          } finally {
            u.value = !1;
          }
        }),
        (n, l) => {
          var a, d, p, b, f, g, m, x;
          return e.e(
            {
              a: e.p({ title: "鼾声分析报告", showBack: !0 }),
              b: !u.value && o.value,
            },
            !u.value && o.value
              ? {
                  c: e.t(null == (a = i.value) ? void 0 : a.title),
                  d: null == (d = i.value) ? void 0 : d.color,
                  e: e.t(r.value),
                  f: null == (p = i.value) ? void 0 : p.color,
                  g: e.t(null == (b = i.value) ? void 0 : b.desc),
                  h: null == (f = i.value) ? void 0 : f.bgColor,
                  i: r.value + "%",
                  j: null == (g = i.value) ? void 0 : g.color,
                  k: e.f(t.value, (n, l, a) => ({
                    a: e.t(n.icon),
                    b: e.t(n.value),
                    c: e.t(n.label),
                    d: n.label,
                  })),
                  l: e.t(null == (m = i.value) ? void 0 : m.advice),
                  m: e.f(
                    null == (x = i.value) ? void 0 : x.tips,
                    (n, l, a) => ({ a: e.t(l + 1), b: e.t(n), c: l }),
                  ),
                  n: e.o(s, "c6"),
                  o: e.o(c, "42"),
                  p: e.o(v, "69"),
                }
              : {},
          );
        }
      );
    },
  }),
  u = e._export_sfc(o, [["__scopeId", "data-v-45b6ad14"]]);
wx.createPage(u);
