"use strict";
const e = require("../../common/vendor.js"),
  api = require("../../api/index.js");
Math || t();
const loadNavbarComponent = () => "../../components/base/hj-navbar.js",
  pageComponent = e.defineComponent({
    __name: "index",
    setup() {
      const assessmentRecords = e.ref([]);
      
      function mapAssessmentRecord(assessmentItem) {
        const isEssAssessment = assessmentItem.type === "ess";
        let assessmentTypeLabel = isEssAssessment ? "ESS嗜睡量表" : "AI鼾声分析";
        let assessmentDate = assessmentItem.createdAt ? assessmentItem.createdAt.split("T")[0] : "";
        
        let summaryText = "";
        let riskLabel = "";
        let riskLabelColor = "#3B6BF5";
        
        if (isEssAssessment) {
          summaryText = `得分${assessmentItem.essScore}分`;
          riskLabel = {
            normal: "正常",
            mild: "轻度嗜睡",
            moderate: "中度嗜睡",
            severe: "重度嗜睡",
          }[assessmentItem.essLevel] || "正常";
          
          riskLabelColor = {
            normal: "#22C55E",
            mild: "#3B6BF5",
            moderate: "#F59E0B",
            severe: "#EF4444",
          }[assessmentItem.essLevel] || "#22C55E";
        } else {
          summaryText = `时长${assessmentItem.snoreAnalysis.duration}秒`;
          riskLabel = {
            normal: "正常",
            low: "低风险",
            mild: "轻度风险",
            moderate: "中度风险",
            severe: "重度风险",
          }[assessmentItem.snoreAnalysis.riskLevel] || "正常";
          
          riskLabelColor = {
            normal: "#22C55E",
            low: "#22C55E",
            mild: "#3B6BF5",
            moderate: "#F59E0B",
            severe: "#EF4444",
          }[assessmentItem.snoreAnalysis.riskLevel] || "#22C55E";
        }
        
        return {
          id: assessmentItem.id,
          type: assessmentItem.type,
          typeLabel: assessmentTypeLabel,
          score: isEssAssessment ? assessmentItem.essScore : 0,
          level: riskLabel,
          levelColor: riskLabelColor,
          date: assessmentDate,
          desc: `${summaryText}，${assessmentItem.recommendation || ""}`,
        };
      }

      const pendingCount = e.ref(0);
      const isSyncing = e.ref(false);

      function checkPendingCount() {
        const pending = e.index.getStorageSync("pending_snore_uploads") || [];
        pendingCount.value = pending.length;
      }

      async function handleForceSync() {
        if (isSyncing.value) return;
        isSyncing.value = true;
        e.index.showLoading({ title: "同步中..." });
        try {
          await api.syncPendingSnoreRecordings();
          checkPendingCount();
          e.index.hideLoading();
          e.index.showToast({ title: "同步成功", icon: "success" });
          const response = await api.getAssessments();
          if (response && response.code === 0 && Array.isArray(response.data)) {
            assessmentRecords.value = response.data.map(mapAssessmentRecord);
          }
        } catch (err) {
          e.index.hideLoading();
          e.index.showToast({ title: "同步失败，请检查网络", icon: "none" });
        } finally {
          isSyncing.value = false;
        }
      }

      e.onShow(async () => {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          assessmentRecords.value = [];
          return;
        }
        checkPendingCount();
        try {
          await api.syncPendingSnoreRecordings();
          checkPendingCount();
        } catch (syncErr) {
          console.error("Silent sync failed on index show:", syncErr);
        }
        try {
          const response = await api.getAssessments();
          if (response && response.code === 0 && Array.isArray(response.data)) {
            assessmentRecords.value = response.data.map(mapAssessmentRecord);
          } else {
            assessmentRecords.value = [];
          }
        } catch (err) {
          console.error("加载评估记录失败", err);
          assessmentRecords.value = [];
        }
      });
      function startEssAssessment() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        e.index.navigateTo({ url: "/pages/assessment/questionnaire/index" });
      }
      function startSnoreAssessment() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        e.index.navigateTo({ url: "/pages/assessment/recording/index" });
      }
      return (t, n) =>
        e.e(
          {
            a: e.p({ title: "睡眠评估", "show-back": !0 }),
            b: e.o(startEssAssessment, "47"),
            c: e.o(startSnoreAssessment, "5f"),
            d: assessmentRecords.value.length,
            pendingCount: pendingCount.value,
            handleForceSync: e.o(handleForceSync, "sync"),
          },
          assessmentRecords.value.length
            ? {
                e: e.f(assessmentRecords.value, (t, a, s) => ({
                  a: t.levelColor,
                  b: e.t(t.typeLabel),
                  c: e.t(t.desc),
                  d: e.t(t.date),
                  e: e.t(t.level),
                  f: t.levelColor,
                  g: t.id,
                  h: e.o((a) => {
                    const token = e.index.getStorageSync("access_token");
                    if (!token) {
                      e.index.navigateTo({ url: "/pages/auth/login" });
                      return;
                    }
                    if (t.type === "ess") {
                      e.index.navigateTo({
                        url: `/pages/assessment/result/index?id=${t.id}`
                      });
                    } else {
                      e.index.navigateTo({
                        url: `/pages/assessment/snore-result/index?id=${t.id}`
                      });
                    }
                  }, t.id),
                })),
              }
            : {},
        );
    },
  }),
  s = e._export_sfc(pageComponent, [["__scopeId", "data-v-35dabd14"]]);
wx.createPage(s);
