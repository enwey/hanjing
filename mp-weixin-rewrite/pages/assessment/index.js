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
    assessmentCards: [
      {
        key: 'ess',
        title: 'ESS 嗜睡量表',
        description: '8 道情境题，评估白天嗜睡倾向与睡眠风险。',
        tag: '约 3 分钟',
        icon: '/static/icons/assessment.svg',
        url: '/pages/assessment/questionnaire/index',
      },
      {
        key: 'snore',
        title: 'AI 鼾声分析',
        description: '录制夜间鼾声，生成风险等级与报告建议。',
        tag: '录音分析',
        icon: '/static/icons/microphone.svg',
        url: '/pages/assessment/recording/index',
      },
    ],
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

    if (!isLoggedIn) {
      return;
    }

    try {
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

  openAssessment(event) {
    const url = String(event.currentTarget.dataset.url || '');
    if (!url) {
      return;
    }
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage(url);
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
