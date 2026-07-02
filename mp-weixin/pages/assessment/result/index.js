"use strict";
const e = require("../../../common/vendor.js"),
  n = require("../../../stores/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  s = e.defineComponent({
    __name: "index",
    setup(t) {
      const s = n.useAssessmentStore(),
        o = e.computed(() => !s.currentResult);
      function i() {
        e.index.navigateBack({ delta: 1 });
      }
      function r() {
        e.index.switchTab({ url: "/pages/index/index" });
      }
      function a() {
        const result = e.unref(s).currentResult;
        if (result && result.id) {
          e.index.setStorageSync("pending_appointment_assessment", {
            type: "ess",
            id: result.id,
            label: `ESS嗜睡量表 ${e.unref(s).totalScore}分`
          });
        }
        e.index.navigateTo({ url: "/pages/appointment/store-select" });
      }
      function u() {
        (s.reset(),
          e.index.redirectTo({ url: "/pages/assessment/questionnaire/index" }));
      }
      return (
        e.onMounted(async () => {
          const pages = getCurrentPages();
          const curPage = pages[pages.length - 1] || {};
          const options = curPage.options || (curPage.$page && curPage.$page.options) || {};
          const id = options.id;
          if (id) {
            try {
              if (s.questions.length === 0) {
                await s.fetchQuestions();
              }
              const api = require("../../../api/index.js");
              const res = await api.getSnoreAnalysis(id);
              if (res && res.code === 0 && res.data) {
                s.currentResult = res.data;
                s.answers = res.data.essAnswers || [];
                s.submitted = !0;
              }
            } catch (err) {
              console.error("加载结果详情失败", err);
            }
          } else {
            o.value && s.fetchAssessments();
          }
        }),
        (n, t) =>
          e.e(
            {
              a: e.o(i, "22"),
              b: e.p({ title: "评估结果", showBack: !0 }),
              c: o.value,
            },
            o.value
              ? { d: e.o(u, "81") }
              : {
                  e: e.t(e.unref(s).totalScore),
                  f: e.t(e.unref(s).levelInfo.level),
                  g: e.unref(s).levelInfo.color,
                  h: e.t(e.unref(s).levelInfo.desc),
                  i: e.f(e.unref(s).questions, (n, t, o) => {
                    const score = e.unref(s).answers[t];
                    const color = score === 0 ? "#10B981"
                                : score === 1 ? "#F59E0B"
                                : score === 2 ? "#F97316"
                                : score === 3 ? "#EF4444"
                                : "#94A3B8";
                    return {
                      a: e.t(t + 1),
                      b: e.t(n.situation),
                      c: e.t(["从不", "轻度", "中度", "高度"][score] || "未答"),
                      color: color,
                      d: n.id,
                    };
                  }),
                  j: e.t(e.unref(s).levelInfo.advice),
                  adviceBg: e.unref(s).levelInfo.adviceBg,
                  adviceBorder: e.unref(s).levelInfo.adviceBorder,
                  adviceTitleColor: e.unref(s).levelInfo.adviceTitleColor,
                  adviceTextColor: e.unref(s).levelInfo.adviceTextColor,
                  adviceIcon: e.unref(s).levelInfo.adviceIcon,
                  k: e.o(a, "1e"),
                  l: e.o(r, "50"),
                  m: e.o(u, "73"),
                },
          )
      );
    },
  }),
  o = e._export_sfc(s, [["__scopeId", "data-v-1973d3c1"]]);
wx.createPage(o);
