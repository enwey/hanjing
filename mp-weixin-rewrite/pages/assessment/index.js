const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');

const ESS_LEVEL_LABEL_MAP = {
  normal: '正常',
  mild: '轻度嗜睡',
  moderate: '中度嗜睡',
  severe: '重度嗜睡',
};

const SNORE_LEVEL_LABEL_MAP = {
  normal: '正常',
  low: '低风险',
  mild: '轻度风险',
  moderate: '中度风险',
  severe: '高度风险',
};

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function getRiskColor(level) {
  if (level === 'severe') return '#ef4444';
  if (level === 'moderate') return '#f59e0b';
  if (level === 'mild') return '#2457e6';
  return '#22c55e';
}

function normalizeAssessmentRecord(record) {
  const type = record.type || '';
  const isEss = type === 'ess';
  const snoreAnalysis = record.snoreAnalysis || record.analysis || {};
  const level = isEss ? record.essLevel || 'normal' : snoreAnalysis.riskLevel || 'normal';

  return {
    id: String(record.id || ''),
    type,
    typeLabel: isEss ? 'ESS 嗜睡量表' : 'AI 鼾声分析',
    levelLabel: isEss ? (ESS_LEVEL_LABEL_MAP[level] || '正常') : (SNORE_LEVEL_LABEL_MAP[level] || '正常'),
    levelColor: getRiskColor(level),
    dateLabel: String(record.createdAt || '').replace('T', ' ').slice(0, 16),
    summary: isEss
      ? '总分 ' + Number(record.essScore || 0) + ' 分'
      : '录音 ' + Number(snoreAnalysis.duration || 0) + ' 秒，鼾声占比 ' + Number(snoreAnalysis.snoreRate || 0) + '%',
    recommendation: record.recommendation || snoreAnalysis.recommendation || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    isLoggedIn: false,
    records: [],
    pendingCount: 0,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const isLoggedIn = sessionStore.isLoggedIn();
    this.setData({
      loading: isLoggedIn,
      isLoggedIn,
      loadError: '',
      records: [],
    });

    this.checkPendingCount();

    if (!isLoggedIn) {
      return;
    }

    try {
      await api.syncPendingSnoreRecordings();
      this.checkPendingCount();
      const assessmentsResponse = await api.getAssessments();
      const records = unwrapList(assessmentsResponse).map(normalizeAssessmentRecord);
      this.setData({
        loading: false,
        records,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载评估记录失败',
      });
    }
  },

  checkPendingCount() {
    const pending = wx.getStorageSync('pending_snore_uploads') || [];
    this.setData({ pendingCount: Array.isArray(pending) ? pending.length : 0 });
  },

  async handleForceSync() {
    wx.showLoading({ title: '同步中...' });
    try {
      await api.syncPendingSnoreRecordings();
      wx.hideLoading();
      wx.showToast({ title: '同步成功', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '同步失败，请检查网络', icon: 'none' });
    }
  },

  startEssAssessment() {
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage('/pages/assessment/questionnaire/index');
  },

  startSnoreAssessment() {
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage('/pages/assessment/recording/index');
  },

  openRecord(event) {
    const recordId = String(event.currentTarget.dataset.recordId || '');
    const type = String(event.currentTarget.dataset.type || '');
    if (!recordId) {
      return;
    }
    if (type === 'ess') {
      navigation.openPage('/pages/assessment/result/index?id=' + recordId);
      return;
    }
    navigation.openPage('/pages/assessment/snore-result/index?id=' + recordId);
  },

  goLogin() {
    navigation.openPage('/pages/auth/login');
  },
});
