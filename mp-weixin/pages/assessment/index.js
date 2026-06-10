"use strict";
const e = require("../../common/vendor.js");
Math || t();
const t = () => "../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(t) {
      const a = e.ref([
        {
          id: "ar-001",
          type: "ess",
          typeLabel: "ESS嗜睡量表",
          score: 14,
          level: "中度嗜睡",
          levelColor: "#F59E0B",
          date: "2026-06-02",
          desc: "得分14分，建议就医评估并考虑治疗方案",
        },
        {
          id: "ar-002",
          type: "snore",
          typeLabel: "AI鼾声分析",
          score: 0,
          level: "中风险",
          levelColor: "#EF4444",
          date: "2026-06-01",
          desc: "检测到频繁呼吸暂停特征，建议尽快就医",
        },
        {
          id: "ar-003",
          type: "ess",
          typeLabel: "ESS嗜睡量表",
          score: 11,
          level: "轻度嗜睡",
          levelColor: "#3B6BF5",
          date: "2026-05-20",
          desc: "得分11分，处于轻度嗜睡范围，需持续关注",
        },
      ]);
      function s() {
        e.index.navigateTo({ url: "/pages/assessment/questionnaire/index" });
      }
      function o() {
        e.index.navigateTo({ url: "/pages/assessment/recording/index" });
      }
      return (t, n) =>
        e.e(
          {
            a: e.p({ title: "睡眠评估" }),
            b: e.o(s, "47"),
            c: e.o(o, "5f"),
            d: a.value.length,
          },
          a.value.length
            ? {
                e: e.f(a.value, (t, a, s) => ({
                  a: t.levelColor,
                  b: e.t(t.typeLabel),
                  c: e.t(t.desc),
                  d: e.t(t.date),
                  e: e.t(t.level),
                  f: t.levelColor,
                  g: t.id,
                  h: e.o((a) => {
                    return (
                      (s = t),
                      void e.index.navigateTo({
                        url: `/pages/treatment/sleep-report/index?from=assessment&id=${s.id}`,
                      })
                    );
                    var s;
                  }, t.id),
                })),
              }
            : {},
        );
    },
  }),
  s = e._export_sfc(a, [["__scopeId", "data-v-35dabd14"]]);
wx.createPage(s);
