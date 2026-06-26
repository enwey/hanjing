"use strict";
const e = require("../../../common/vendor.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(t) {
      const a = e.ref(!0),
        o = e.ref("week"),
        u = e.computed(() => ("week" === o.value ? "过去7天" : "过去30天")),
        n = e.reactive({ hasData: false, compliance: 0, weekAvg: 0, avgComfort: 0, streak: 0, score: 0, betterThan: 0, trend: [] }),
        l = e.reactive({ hasData: false, compliance: 0, weekAvg: 0, avgComfort: 0, streak: 0, score: 0, betterThan: 0, trend: [] }),
        v = e.computed(() => ("week" === o.value ? n : l));
      const c = e.computed(() => {
          const currentData = "week" === o.value ? n : l;
          if (currentData.trend && currentData.trend.length > 0) {
            return currentData.trend;
          }
          return [];
        }),
        r = e.computed(() => c.value.map((e) => e.score)),
        m = e.computed(() => Math.max(...r.value, 1)),
        p = e.computed(() => {
          const e = v.value;
          return e.hasData ? e.score : 0;
        }),
        i = e.computed(() => {
          const e = p.value;
          return e >= 90
            ? { label: "优秀", color: "#1A9D5C", bg: "#D3F5E3" }
            : e >= 75
              ? { label: "良好", color: "#3B6BF5", bg: "#EEF4FF" }
              : e >= 60
                ? { label: "一般", color: "#F59E0B", bg: "#FFFBEB" }
                : { label: "需改善", color: "#EF4444", bg: "#FEE2E2" };
        }),
        g = e.computed(() => ({
          betterThan: v.value.betterThan || 0,
          avgDuration: 5.8,
          avgCompliance: 72,
          yourDurationPct: Math.min(
            100,
            Math.round((v.value.weekAvg / 8) * 100),
          ),
        })),
        s = e.computed(() => {
          const e = v.value,
            t = [];
          if (!e.hasData) {
            return [{
              icon: "📭",
              text: "暂无真实佩戴记录。完成每日佩戴打卡后，这里会生成治疗报告。",
              type: "info",
            }];
          }
          return (
            e.compliance >= 85
              ? t.push({
                  icon: "✅",
                  text: `您的佩戴依从率达到 ${e.compliance}%，远超平均水平，继续保持！`,
                  type: "good",
                })
              : e.compliance < 60 &&
                t.push({
                  icon: "⚠️",
                  text: `依从率仅 ${e.compliance}%，建议设置手机闹钟提醒佩戴。`,
                  type: "warn",
                }),
            e.weekAvg >= 7
              ? t.push({
                  icon: "💤",
                  text: `平均佩戴 ${e.weekAvg}h，已达到理想时长，治疗效果良好。`,
                  type: "good",
                })
              : e.weekAvg < 5 &&
                t.push({
                  icon: "📉",
                  text: `平均佩戴 ${e.weekAvg}h，建议逐步延长至 6-8h 以获得最佳效果。`,
                  type: "warn",
                }),
            e.avgComfort >= 4
              ? t.push({
                  icon: "😊",
                  text: `设备舒适度评分 ${e.avgComfort}/5，适配良好。`,
                  type: "good",
                })
              : e.avgComfort < 3 &&
                t.push({
                  icon: "⚠️",
                  text: `舒适度评分偏低（${e.avgComfort}/5），建议预约医生进行设备调整。`,
                  type: "warn",
                }),
            t.push({
              icon: "💡",
              text: "建议每周至少佩戴 6 晚，连续使用 3 个月以上效果最显著。",
              type: "info",
            }),
            t
          );
        }),
        h = e.computed(() => v.value.avgComfort < 3);

      async function loadReportData() {
        try {
          const api = require("../../../api/index.js");
          const res = await api.getSleepReport({ range: o.value });
          if (res && res.data) {
            const target = o.value === "week" ? n : l;
            Object.assign(target, res.data);
          }
        } catch (err) {
          console.error("加载睡眠报告失败", err);
          const target = o.value === "week" ? n : l;
          Object.assign(target, { hasData: false, compliance: 0, weekAvg: 0, avgComfort: 0, streak: 0, score: 0, betterThan: 0, trend: [] });
        }
      }

      async function d(val) {
        o.value = val;
        await loadReportData();
      }
      function w() {
        e.index.switchTab({ url: "/pages/appointment/index" });
      }
      return (
        e.onMounted(async () => {
          await loadReportData();
          a.value = !1;
        }),
        (t, n) =>
          e.e(
            { a: e.p({ title: "睡眠健康报告", showBack: !0 }), b: !a.value },
            a.value
              ? {}
              : e.e(
                  {
                    c: "week" === o.value ? 1 : "",
                    d: e.o((e) => d("week"), "7a"),
                    e: "month" === o.value ? 1 : "",
                    f: e.o((e) => d("month"), "2c"),
                    g: e.t(p.value),
                    h: i.value.color,
                    i: e.t(i.value.label),
                    j: i.value.color,
                    k: e.t(u.value),
                    l: p.value + "%",
                    m: i.value.color,
                    n: i.value.bg,
                    o: e.t(v.value.weekAvg),
                    p: (v.value.weekAvg / 8) * 100 + "%",
                    q: e.t(v.value.compliance),
                    r: v.value.compliance + "%",
                    s: e.t(v.value.avgComfort),
                    t: (v.value.avgComfort / 5) * 100 + "%",
                    v: e.t(v.value.streak),
                    w: Math.min(100, (v.value.streak / 30) * 100) + "%",
                    x: e.f(r.value, (e, t, a) => ({
                      a: t,
                      b: (e / m.value) * 100 + "%",
                      c: e >= 80 ? "#1A9D5C" : e >= 60 ? "#F59E0B" : "#EF4444",
                    })),
                    y: e.f(c.value, (t, a, o) => ({ a: e.t(t.date), b: a })),
                    z: e.t(g.value.betterThan),
                    A: g.value.yourDurationPct + "%",
                    B: (g.value.avgDuration / 8) * 100 + "%",
                    C: e.t(v.value.weekAvg),
                    D: e.t(g.value.avgDuration),
                    E: v.value.compliance + "%",
                    F: g.value.avgCompliance + "%",
                    G: e.t(v.value.compliance),
                    H: e.t(g.value.avgCompliance),
                    I: e.f(s.value, (t, a, o) => ({
                      a: e.t(t.icon),
                      b: e.t(t.text),
                      c: a,
                      d: e.n("insight--" + t.type),
                    })),
                    J: h.value,
                  },
                  h.value ? { K: e.o(w, "ec") } : {},
                ),
          )
      );
    },
  }),
  o = e._export_sfc(a, [["__scopeId", "data-v-72813ef9"]]);
wx.createPage(o);
