const { request } = require('../request');

function getAssessments(query) {
  return request({ url: '/assessments', method: 'GET', data: query || {}, failMessage: '加载评估记录失败' });
}

function getESSQuestions() {
  return request({ url: '/assessments/ess-questions', method: 'GET', failMessage: '加载量表题目失败' });
}

function submitESS(data) {
  return request({ url: '/assessments/ess', method: 'POST', data, failMessage: '提交 ESS 评估失败' });
}

function submitSnoreRecording(data) {
  return request({ url: '/assessments/snore', method: 'POST', data, failMessage: '提交鼾声录音失败' });
}

const pendingSyncFlights = new Map();
function syncPendingSnoreRecordings() {
  const sessionStore = require('../../stores/session-store');
  const generation = sessionStore.getLoginGeneration();
  if (pendingSyncFlights.has(generation)) return pendingSyncFlights.get(generation);
  const flight = performPendingSync(sessionStore, generation);
  pendingSyncFlights.set(generation, flight);
  return flight.finally(() => {
    if (pendingSyncFlights.get(generation) === flight) pendingSyncFlights.delete(generation);
  });
}

async function performPendingSync(sessionStore, generation) {
  const pending = wx.getStorageSync('pending_snore_uploads') || [];
  if (!Array.isArray(pending) || pending.length === 0) {
    return;
  }

  const snapshot = pending.slice();
  const profile = await sessionStore.fetchProfile();
  if (!profile || !profile.id) return;
  const current = () => sessionStore.getLoginGeneration() === generation && sessionStore.isLoggedIn();
  let failed = 0;
  for (const item of snapshot) {
    if (!current()) throw new Error('账号已切换，请重新同步');
    if (!item.ownerUserId || String(item.ownerUserId) !== String(profile.id)) continue;
    const fingerprint = JSON.stringify(item);
    try {
      const response = await submitSnoreRecording(item);
      const record = (response && response.data) || response || {};
      if (typeof record.id !== 'string' || !/^snore-[1-9]\d*$/.test(record.id)) {
        throw new Error('报告保存结果未确认');
      }
    } catch (error) {
      failed += 1;
      continue;
    }
    if (!current()) throw new Error('账号已切换，请重新同步');
    // Merge against the latest queue; never replace it with the old snapshot.
    const latest = wx.getStorageSync('pending_snore_uploads') || [];
    if (!Array.isArray(latest)) throw new Error('待同步记录格式异常');
    const index = latest.findIndex(record => JSON.stringify(record) === fingerprint);
    if (index >= 0) {
      const remaining = latest.slice();
      remaining.splice(index, 1);
      wx.setStorageSync('pending_snore_uploads', remaining);
    }
  }

  if (!current()) throw new Error('账号已切换，请重新同步');
  if (failed) throw new Error('仍有' + failed + '份报告未同步成功，请稍后重试');
}

function getSnoreAnalysis(assessmentId) {
  return request({ url: '/assessments/snore-analysis/' + assessmentId, method: 'GET', failMessage: '加载鼾声分析失败' });
}

function getAssessmentDetail(assessmentId) {
  return request({ url: '/assessments/snore-analysis/' + assessmentId, method: 'GET', failMessage: '加载评估详情失败' });
}

module.exports = {
  getAssessments,
  getESSQuestions,
  submitESS,
  submitSnoreRecording,
  syncPendingSnoreRecordings,
  getSnoreAnalysis,
  getAssessmentDetail
};
