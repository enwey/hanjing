const api = require('../../../api/index');

function getSnoreRiskInfo(riskLevel) {
  let key = riskLevel;
  if (riskLevel === 'normal' || riskLevel === 'low') key = 'low';
  else if (riskLevel === 'mild' || riskLevel === 'medium' || riskLevel === 'moderate') key = 'medium';
  else if (riskLevel === 'severe' || riskLevel === 'high') key = 'high';
  const levels = {
    low: {
      title: '低风险',
      color: '#1A9D5C',
      bgColor: '#D3F5E3',
      desc: '您的鼾声测试结果良好，未检测到明显的睡眠呼吸暂停风险。',
      advice: '建议保持健康生活习惯，定期关注睡眠质量。如家人反馈仍有明显鼾声，可 3 个月后复测。',
      tips: ['保持规律作息', '避免睡前饮酒', '侧卧睡眠', '控制体重'],
    },
    medium: {
      title: '中风险',
      color: '#F59E0B',
      bgColor: '#FFFBEB',
      desc: '检测到中度鼾声和少量呼吸暂停事件，建议引起关注并及时进行专业评估。',
      advice: '建议预约鼾静健康门诊进行面诊和睡眠监测，早期干预效果最佳。',
      tips: ['尽快预约门诊', '监测睡眠姿势', '减少酒精和安眠药', '记录夜间醒来次数'],
    },
    high: {
      title: '高风险',
      color: '#EF4444',
      bgColor: '#FEF2F2',
      desc: '检测到重度鼾声和较多呼吸暂停事件，可能存在中度至重度睡眠呼吸暂停综合征。',
      advice: '请尽快到鼾静健康门诊进行多导睡眠监测和上气道评估，及早治疗可避免并发症风险。',
      tips: ['立即预约门诊', '避免长途驾驶', '告知家属观察', '记录日间嗜睡情况'],
    },
  };
  return levels[key] || levels.low;
}

Page({
  data: {
    isLoading: true,
    reportDetail: null,
    riskInfo: null,
    statCards: [],
    riskScore: 0,
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ isLoading: true });
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
        { iconPath: '/static/icons/warning.svg', value: analysis.apneaEvents + ' 次', label: '呼吸暂停' },
      ] : [];
      const riskScore = analysis ? Math.min(100, Math.round((analysis.avgDecibel / 80) * 30 + (analysis.snoreRate / 100) * 30 + (analysis.apneaEvents / 20) * 40)) : 0;
      this.setData({ isLoading: false, reportDetail, riskInfo, statCards, riskScore });
    } catch (error) {
      console.error('[SnoreResult] 加载失败', error);
      this.setData({ isLoading: false });
    }
  },

  handleBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.navigateTo({ url: '/pages/assessment/index' });
      },
    });
  },

  goAppointment() {
    if (this.data.reportDetail && this.data.reportDetail.id && this.data.reportDetail.id !== 'local') {
      wx.setStorageSync('pending_appointment_assessment', {
        type: 'snore',
        id: this.data.reportDetail.id,
        label: 'AI鼾声分析',
      });
    }
    wx.navigateTo({ url: '/pages/appointment/store-select' });
  },

  goHome() {
    this.handleBack();
  },

  restartRecording() {
    wx.redirectTo({ url: '/pages/assessment/recording/index' });
  },
});
