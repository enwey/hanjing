"use strict";
const e = require("../../../common/vendor.js"),
  l = require("../../../api/index.js");
Math || a();

function getSnoreRiskInfo(riskLevel) {
  let key = riskLevel;
  if (riskLevel === 'normal' || riskLevel === 'low') {
    key = 'low';
  } else if (riskLevel === 'mild' || riskLevel === 'medium' || riskLevel === 'moderate') {
    key = 'medium';
  } else if (riskLevel === 'severe' || riskLevel === 'high') {
    key = 'high';
  }
  const levels = {
    low: {
      title: "低风险",
      color: "#1A9D5C",
      bgColor: "#D3F5E3",
      desc: "您的鼾声测试结果良好，未检测到明显的睡眠呼吸暂停风险。",
      advice:
        "建议保持健康生活习惯，定期关注睡眠质量。如家人反馈仍有明显鼾声，可3个月后复测。",
      tips: ["保持规律作息", "避免睡前饮酒", "侧卧睡眠", "控制体重"],
    },
    medium: {
      title: "中风险",
      color: "#F59E0B",
      bgColor: "#FFFBEB",
      desc: "检测到中度鼾声和少量呼吸暂停事件，建议引起关注并及时进行专业评估。",
      advice: "建议预约鼾静健康门诊进行面诊和睡眠监测，早期干预效果最佳。",
      tips: ["尽快预约门诊", "监测睡眠姿势", "减少酒精和安眠药", "记录夜间醒来次数"],
    },
    high: {
      title: "高风险",
      color: "#EF4444",
      bgColor: "#FEF2F2",
      desc: "检测到重度鼾声和较多呼吸暂停事件，可能存在中度至重度睡眠呼吸暂停综合征。",
      advice:
        "请尽快到鼾静健康门诊进行多导睡眠监测（PSG）和上气道评估，及早治疗可避免心脑血管并发症风险。",
      tips: ["立即预约门诊", "避免长途驾驶", "告知家属观察", "记录日间嗜睡情况"],
    },
  };
  return levels[key] || levels.low;
}

const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref(null),
        u = e.ref(!0),
        i = e.computed(() => {
          var e;
          return (null == (e = o.value) ? void 0 : e.snoreAnalysis)
            ? getSnoreRiskInfo(o.value.snoreAnalysis.riskLevel)
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
        if (o.value && o.value.id && o.value.id !== "local") {
          e.index.setStorageSync("pending_appointment_assessment", {
            type: "snore",
            id: o.value.id,
            label: "AI鼾声分析"
          });
        }
        e.index.navigateTo({ url: "/pages/appointment/store-select" });
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
              idVal = null == (e = null == a ? void 0 : a.options) ? void 0 : e.id;
            if (idVal) {
              if (idVal === 'local') {
                o.value = wx.getStorageSync('last_local_snore_result');
              } else {
                try {
                  const res = await l.getSnoreAnalysis(idVal);
                  o.value = res.data;
                } catch (apiErr) {
                  console.warn("[SnoreResult] API load failed, trying local stash fallback:", apiErr);
                  o.value = wx.getStorageSync('last_local_snore_result');
                }
              }
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
