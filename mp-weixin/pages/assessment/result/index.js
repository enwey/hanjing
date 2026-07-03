"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
Math || t();

function getESSLevelInfo(score) {
  return score <= 5
    ? {
        level: "正常（低嗜睡倾向）",
        color: "linear-gradient(135deg, #10B981, #059669)",
        desc: "您的日间嗜睡程度在正常范围内，白天精神状态良好。",
        advice:
          "保持现有作息规律，定期关注睡眠质量变化。如仍存在打鼾问题，建议进行睡眠评估。",
        adviceBg: "#f0fdf4",
        adviceBorder: "#bbf7d0",
        adviceTitleColor: "#166534",
        adviceTextColor: "#15803d",
        adviceIcon: "/static/icons/heart.svg",
      }
    : score <= 10
      ? {
          level: "正常偏高",
          color: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
          desc: "您的日间嗜睡程度略高于正常范围，可能存在轻度睡眠质量下降。",
          advice:
            "注意保持规律作息，避免熬夜。建议使用APP内的AI鼾声分析功能，了解夜间睡眠状况。",
          adviceBg: "#eff6ff",
          adviceBorder: "#bfdbfe",
          adviceTitleColor: "#1e40af",
          adviceTextColor: "#1d4ed8",
          adviceIcon: "/static/icons/info.svg",
        }
      : score <= 12
        ? {
            level: "轻度嗜睡",
            color: "linear-gradient(135deg, #F59E0B, #D97706)",
            desc: "您存在轻度日间过度嗜睡，可能影响日常工作和生活质量。",
            advice:
              "建议在线预约睡眠呼吸门诊，进行专业的睡眠评估。及早干预可有效改善睡眠质量。",
            adviceBg: "#fffbeb",
            adviceBorder: "#fde68a",
            adviceTitleColor: "#92400e",
            adviceTextColor: "#b45309",
            adviceIcon: "/static/icons/alert.svg",
          }
        : score <= 15
          ? {
              level: "中度嗜睡",
              color: "linear-gradient(135deg, #F97316, #C2410C)",
              desc: "您存在中度日间嗜睡，日常活动受到明显影响，需引起重视。",
              advice:
                "强烈建议尽快预约专业门诊。可能需要进行睡眠监测，评估是否存在睡眠呼吸暂停。",
              adviceBg: "#fff7ed",
              adviceBorder: "#ffedd5",
              adviceTitleColor: "#9a3412",
              adviceTextColor: "#c2410c",
              adviceIcon: "/static/icons/alert.svg",
            }
          : {
              level: "重度嗜睡",
              color: "linear-gradient(135deg, #EF4444, #B91C1C)",
              desc: "您存在重度日间嗜睡，可能对健康和安全造成严重影响（如驾驶风险）。",
              advice:
                "请立即预约鼾静健康门诊进行专业诊断。建议避免长途驾驶，尽快进行多导睡眠监测（PSG）。",
              adviceBg: "#fef2f2",
              adviceBorder: "#fee2e2",
              adviceTitleColor: "#991b1b",
              adviceTextColor: "#b91c1c",
              adviceIcon: "/static/icons/alert.svg",
            };
}

function getAnswerPresentation(answerScore) {
  if (answerScore === 0) {
    return { label: "从不", color: "#10B981", background: "#ECFDF5", borderColor: "#A7F3D0" };
  }
  if (answerScore === 1) {
    return { label: "轻度", color: "#D97706", background: "#FFFBEB", borderColor: "#FDE68A" };
  }
  if (answerScore === 2) {
    return { label: "中度", color: "#C2410C", background: "#FFF7ED", borderColor: "#FDBA74" };
  }
  if (answerScore === 3) {
    return { label: "高度", color: "#B91C1C", background: "#FEF2F2", borderColor: "#FCA5A5" };
  }
  return { label: "未答", color: "#64748B", background: "#F8FAFC", borderColor: "#E2E8F0" };
}

const t = () => "../../../components/base/hj-navbar.js",
  s = e.defineComponent({
    __name: "index",
    setup(t) {
      const questionList = e.ref([]);
      const resultDetail = e.ref(null);
      const isLoading = e.ref(!0);
      const hasLoaded = e.ref(!1);
      const shouldShowResult = e.computed(() => !!resultDetail.value);
      const isEmpty = e.computed(() => hasLoaded.value && !resultDetail.value);
      const score = e.computed(() => {
        var e;
        return (null == (e = resultDetail.value) ? void 0 : e.essScore) || 0;
      });
      const levelInfo = e.computed(() => getESSLevelInfo(score.value));
      const answerReviewList = e.computed(() =>
        questionList.value.map((questionItem, questionIndex) => {
          const answerScore = (resultDetail.value && resultDetail.value.essAnswers && resultDetail.value.essAnswers[questionIndex]) ?? -1;
          const answerPresentation = getAnswerPresentation(answerScore);
          return {
            questionId: questionItem.id,
            index: questionIndex + 1,
            situation: questionItem.situation,
            label: answerPresentation.label,
            style:
              "color:" +
              answerPresentation.color +
              ";background:" +
              answerPresentation.background +
              ";border-color:" +
              answerPresentation.borderColor,
          };
        }),
      );
      function handleBack() {
        e.index.navigateBack({
          delta: 1,
          fail() {
            e.index.navigateTo({ url: "/pages/assessment/index" });
          },
        });
      }
      function goHome() {
        e.index.switchTab({ url: "/pages/index/index" });
      }
      function goAppointment() {
        const result = resultDetail.value;
        if (result && result.id) {
          e.index.setStorageSync("pending_appointment_assessment", {
            type: "ess",
            id: result.id,
            label: `ESS嗜睡量表 ${score.value}分`
          });
        }
        e.index.navigateTo({ url: "/pages/appointment/store-select" });
      }
      function restartAssessment() {
        e.index.redirectTo({ url: "/pages/assessment/questionnaire/index" });
      }
      async function loadQuestionList() {
        if (questionList.value.length > 0) {
          return;
        }
        const response = await api.getESSQuestions();
        questionList.value = Array.isArray(response.data) ? response.data : [];
      }
      function readCachedResult() {
        const cachedResult = e.index.getStorageSync("last_ess_assessment_result");
        if (cachedResult && cachedResult.id) {
          resultDetail.value = cachedResult;
        }
      }
      async function loadAssessmentDetail(assessmentId) {
        const response = await api.getAssessmentDetail(assessmentId);
        if (response && response.code === 0 && response.data && response.data.type === "ess") {
          resultDetail.value = response.data;
        }
      }
      return (
        e.onMounted(async () => {
          try {
            const pages = getCurrentPages();
            const currentPage = pages[pages.length - 1] || {};
            const options = currentPage.options || (currentPage.$page && currentPage.$page.options) || {};
            const assessmentId = options.id;
            await loadQuestionList();
            if (assessmentId) {
              await loadAssessmentDetail(assessmentId);
            } else {
              readCachedResult();
            }
          } catch (err) {
            console.error("加载结果详情失败", err);
          } finally {
            isLoading.value = !1;
            hasLoaded.value = !0;
          }
        }),
        (n, t) =>
          e.e(
            {
              a: e.o(handleBack, "22"),
              b: e.p({ title: "评估结果", showBack: !0, customBack: !0 }),
              c: isLoading.value,
            },
            isLoading.value
              ? {}
              : {
                  d: isEmpty.value,
                },
            !isLoading.value
              ? isEmpty.value
                ? { e: e.o(restartAssessment, "81") }
                : shouldShowResult.value
                  ? {
                      f: e.t(score.value),
                      g: e.t(levelInfo.value.level),
                      h: levelInfo.value.color,
                      i: e.t(levelInfo.value.desc),
                      j: e.f(answerReviewList.value, (n, t, o) => {
                        return {
                          a: e.t(n.index),
                          b: e.t(n.situation),
                          c: e.t(n.label),
                          d: n.style,
                          e: n.questionId,
                        };
                      }),
                      k: e.t(levelInfo.value.advice),
                      adviceBg: levelInfo.value.adviceBg,
                      adviceBorder: levelInfo.value.adviceBorder,
                      adviceTitleColor: levelInfo.value.adviceTitleColor,
                      adviceTextColor: levelInfo.value.adviceTextColor,
                      adviceIcon: levelInfo.value.adviceIcon,
                      l: e.o(goAppointment, "1e"),
                      m: e.o(goHome, "50"),
                      n: e.o(restartAssessment, "73"),
                    }
                  : {}
              : {},
          )
      );
    },
  }),
  o = e._export_sfc(s, [["__scopeId", "data-v-1973d3c1"]]);
wx.createPage(o);
