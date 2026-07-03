"use strict";
const e = require("../../common/vendor.js"),
  api = require("../../api/index.js");
Math || t();
const t = () => "../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(t) {
      const a = e.ref([]);
      
      function mapRecord(item) {
        const isEss = item.type === 'ess';
        let typeLabel = isEss ? 'ESS嗜睡量表' : 'AI鼾声分析';
        let date = item.createdAt ? item.createdAt.split('T')[0] : '';
        
        let scoreStr = '';
        let level = '';
        let levelColor = '#3B6BF5';
        
        if (isEss) {
          scoreStr = `得分${item.essScore}分`;
          level = {
            normal: '正常',
            mild: '轻度嗜睡',
            moderate: '中度嗜睡',
            severe: '重度嗜睡'
          }[item.essLevel] || '正常';
          
          levelColor = {
            normal: '#22C55E',
            mild: '#3B6BF5',
            moderate: '#F59E0B',
            severe: '#EF4444'
          }[item.essLevel] || '#22C55E';
        } else {
          scoreStr = `时长${item.snoreAnalysis.duration}秒`;
          level = {
            normal: '正常',
            low: '低风险',
            mild: '轻度风险',
            moderate: '中度风险',
            severe: '重度风险'
          }[item.snoreAnalysis.riskLevel] || '正常';
          
          levelColor = {
            normal: '#22C55E',
            low: '#22C55E',
            mild: '#3B6BF5',
            moderate: '#F59E0B',
            severe: '#EF4444'
          }[item.snoreAnalysis.riskLevel] || '#22C55E';
        }
        
        return {
          id: item.id,
          type: item.type,
          typeLabel: typeLabel,
          score: isEss ? item.essScore : 0,
          level: level,
          levelColor: levelColor,
          date: date,
          desc: `${scoreStr}，${item.recommendation || ''}`
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
          const res = await api.getAssessments();
          if (res && res.code === 0 && Array.isArray(res.data)) {
            a.value = res.data.map(mapRecord);
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
          a.value = [];
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
          const res = await api.getAssessments();
          if (res && res.code === 0 && Array.isArray(res.data)) {
            a.value = res.data.map(mapRecord);
          } else {
            a.value = [];
          }
        } catch (err) {
          console.error("加载评估记录失败", err);
          a.value = [];
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
            d: a.value.length,
            pendingCount: pendingCount.value,
            handleForceSync: e.o(handleForceSync, "sync"),
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
                    const token = e.index.getStorageSync("access_token");
                    if (!token) {
                      e.index.navigateTo({ url: "/pages/auth/login" });
                      return;
                    }
                    if (t.type === 'ess') {
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
  s = e._export_sfc(a, [["__scopeId", "data-v-35dabd14"]]);
wx.createPage(s);
