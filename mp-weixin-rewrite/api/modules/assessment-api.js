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

async function syncPendingSnoreRecordings() {
  const pending = wx.getStorageSync('pending_snore_uploads') || [];
  if (!Array.isArray(pending) || pending.length === 0) {
    return;
  }

  const sessionStore = require('../../stores/session-store');
  const profile = await sessionStore.fetchProfile();
  if (!profile || !profile.id) return;
  const token = sessionStore.getAccessToken();
  const remaining = [];
  for (const item of pending) {
    if (sessionStore.getAccessToken() !== token) return;
    if (!item.ownerUserId || String(item.ownerUserId) !== String(profile.id)) continue;
    try {
      await submitSnoreRecording(item);
    } catch (error) {
      remaining.push(item);
    }
  }

  if (sessionStore.getAccessToken() !== token) throw new Error('账号已切换，请重新同步');
  wx.setStorageSync('pending_snore_uploads', remaining);
  if (remaining.length) throw new Error('仍有' + remaining.length + '份报告未同步成功，请稍后重试');
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
