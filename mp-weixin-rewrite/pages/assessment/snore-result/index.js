const api = require('../../../api/index');

function getSnoreRiskInfo(riskLevel) {
  let key = riskLevel;
  if (riskLevel === 'normal' || riskLevel === 'low') key = 'low';
  else if (riskLevel === 'mild' || riskLevel === 'medium' || riskLevel === 'moderate') key = 'medium';
  else if (riskLevel === 'severe' || riskLevel === 'high') key = 'high';
  const levels = {
    low: {
      title: '低关注',
      color: '#1A9D5C',
      bgColor: '#D3F5E3',
      desc: '本次鼾声表现相对平稳，可继续关注近期睡眠状态。',
      advice: '建议保持规律作息，定期关注睡眠质量。如家人仍反馈鼾声明显，可在后续再次测试。',
      tips: ['保持规律作息', '避免睡前饮酒', '侧卧睡眠', '控制体重'],
    },
    medium: {
      title: '中度关注',
      color: '#F59E0B',
      bgColor: '#FFFBEB',
      desc: '本次鼾声表现有一定波动，建议继续观察近期夜间睡眠情况。',
      advice: '建议继续观察夜间睡眠状况，并结合后续记录了解是否存在持续波动。',
      tips: ['监测睡眠姿势', '减少酒精和安眠药', '记录夜间醒来次数', '保持规律作息'],
    },
    high: {
      title: '重点关注',
      color: '#EF4444',
      bgColor: '#FEF2F2',
      desc: '本次鼾声表现波动较明显，建议重点关注近期夜间与白天状态变化。',
      advice: '建议尽快减少影响睡眠的因素，并持续记录夜间与白天状态，方便后续对比变化。',
      tips: ['避免长途驾驶', '告知家属观察', '记录日间嗜睡情况', '减少睡前饮酒'],
    },
  };
  return levels[key] || levels.low;
}

Page({
  data: {
    isLoading: true,
    hasLoaded: false,
    reportDetail: null,
    riskInfo: null,
    statCards: [],
    riskScore: 0,
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ isLoading: true });
    }
    try {
      const assessmentId = (this.options && this.options.id) || '';
      let reportDetail = null;
      if (assessmentId === 'local') {
        reportDetail = wx.getStorageSync('last_local_snore_result');
      } else if (assessmentId) {
        try {
          const response = await api.getAssessmentDetail(assessmentId);
          reportDetail = (response && response.data) || response || null;
        } catch (error) {
          reportDetail = wx.getStorageSync('last_local_snore_result');
        }
      }
      const analysis = reportDetail && reportDetail.snoreAnalysis;
      const riskInfo = analysis ? getSnoreRiskInfo(analysis.riskLevel) : null;
      const statCards = analysis ? [
        { iconPath: '/static/icons/microphone.svg', value: analysis.avgDecibel + ' dB', label: '平均分贝' },
        { iconPath: '/static/icons/trend.svg', value: analysis.peakDecibel + ' dB', label: '峰值分贝' },
        { iconPath: '/static/icons/moon.svg', value: analysis.snoreRate + '%', label: '鼾声占比' },
        { iconPath: '/static/icons/warning.svg', value: analysis.apneaEvents + ' 次', label: '停顿次数' },
      ] : [];
      const riskScore = analysis ? Math.min(100, Math.round((analysis.avgDecibel / 80) * 30 + (analysis.snoreRate / 100) * 30 + (analysis.apneaEvents / 20) * 40)) : 0;
      this.setData({ hasLoaded: true, isLoading: false, reportDetail, riskInfo, statCards, riskScore });
    } catch (error) {
      console.error('[SnoreResult] 加载失败', error);
      this.setData({ isLoading: false });
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  goSleepRecord() {
    wx.switchTab({ url: '/pages/treatment/index' });
  },

  goHome() {
    this.handleBack();
  },

  restartRecording() {
    wx.redirectTo({ url: '/pages/assessment/recording/index' });
  },
});
