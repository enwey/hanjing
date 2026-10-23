const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');

function getSnoreRiskInfo(riskLevel) {
  let key = riskLevel;
  if (riskLevel === 'normal' || riskLevel === 'low') key = 'low';
  else if (riskLevel === 'mild') key = 'mild';
  else if (riskLevel === 'medium' || riskLevel === 'moderate') key = 'medium';
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
    mild: {
      title: '轻度风险',
      color: '#2563EB',
      bgColor: '#EFF6FF',
      desc: '检测到一定鼾声特征，暂未达到明显中高风险，但建议继续观察夜间睡眠表现。',
      advice: '建议连续监测 2-3 晚，并关注白天嗜睡、晨起口干、夜间憋醒等情况。',
      tips: ['连续复测', '侧卧睡眠', '避免睡前饮酒', '记录家属反馈'],
    },
    medium: {
      title: '中风险',
      color: '#F59E0B',
      bgColor: '#FFFBEB',
      desc: '检测到中度鼾声和少量呼吸暂停事件，建议引起关注并及时进行专业评估。',
      advice: '建议预约兴康明门诊进行面诊和睡眠监测，早期干预效果最佳。',
      tips: ['尽快预约门诊', '监测睡眠姿势', '减少酒精和安眠药', '记录夜间醒来次数'],
    },
    high: {
      title: '高风险',
      color: '#EF4444',
      bgColor: '#FEF2F2',
      desc: '检测到重度鼾声和较多呼吸暂停事件，可能存在中度至重度睡眠呼吸暂停综合征。',
      advice: '请尽快到兴康明门诊进行多导睡眠监测和上气道评估，及早治疗可避免并发症风险。',
      tips: ['立即预约门诊', '避免长途驾驶', '告知家属观察', '记录日间嗜睡情况'],
    },
  };
  return levels[key] || null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateRiskScore(analysis) {
  if (!analysis) return 0;
  if (analysis.riskScore !== undefined && analysis.riskScore !== null) {
    const ranges = { normal: [0, 29], low: [0, 29], mild: [30, 49], moderate: [50, 69], medium: [50, 69], severe: [70, 100], high: [70, 100] };
    const range = ranges[analysis.riskLevel];
    if (!Number.isInteger(analysis.riskScore) || !range || analysis.riskScore < range[0] || analysis.riskScore > range[1]) {
      throw new Error('报告风险分数无效或与评级不一致，请重新加载');
    }
    return analysis.riskScore;
  }
  const duration = Math.max(Number(analysis.duration || 0), 1);
  const apneaHourly = Number(analysis.apneaEvents || 0) / Math.max(duration / 3600, 0.1);
  const avgScore = clampNumber((Number(analysis.avgDecibel || 0) - 38) * 1.4, 0, 26);
  const peakScore = clampNumber((Number(analysis.peakDecibel || 0) - 55) * 0.8, 0, 18);
  const rateScore = clampNumber(Number(analysis.snoreRate || 0) * 0.4, 0, 38);
  const apneaScore = clampNumber(apneaHourly * 1.4, 0, 18);
  const score = Math.round(clampNumber(avgScore + peakScore + rateScore + apneaScore, 0, 100));
  const levelRanges = {
    normal: [0, 29],
    low: [0, 29],
    mild: [30, 49],
    moderate: [50, 69],
    medium: [50, 69],
    severe: [70, 100],
    high: [70, 100],
  };
  const range = levelRanges[analysis.riskLevel];
  return range ? clampNumber(Math.max(score, range[0]), range[0], range[1]) : score;
}

Page({
  data: {
    isLoading: true,
    loadError: '',
    hasLoaded: false,
    reportDetail: null,
    riskInfo: null,
    statCards: [],
    riskScore: 0,
  },

  onLoad(options) {
    this._unloaded = false;
    this.options = options || {};
  },

  onUnload() {
    this._unloaded = true;
    this._requestId = (this._requestId || 0) + 1;
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const clear = () => this.setData({ reportDetail: null, riskInfo: null, statCards: [], riskScore: 0 });
    const current = () => {
      if (this._unloaded || requestId !== this._requestId) return false;
      if (!sessionStore.isLoggedIn() || generation !== sessionStore.getLoginGeneration()) {
        clear();
        this.setData({ isLoading: false, loadError: '登录状态已变化，请重新加载' });
        return false;
      }
      return true;
    };
    clear();
    if (!current()) return;
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ isLoading: true });
    }
    try {
      const assessmentId = (this.options && this.options.id) || '';
      let reportDetail = null;
      if (assessmentId === 'local') {
        const profile = await sessionStore.fetchProfile();
        reportDetail = wx.getStorageSync('last_local_snore_result');
        if (!reportDetail || !profile || !profile.id || !reportDetail.ownerUserId
          || String(reportDetail.ownerUserId) !== String(profile.id)
          || !this.options.patientId || String(reportDetail.patientId) !== String(this.options.patientId)) {
          throw new Error('本地报告与当前账号或就诊人不匹配，请重新录制');
        }
      } else if (assessmentId) {
        const response = await api.getAssessmentDetail(assessmentId);
        reportDetail = (response && response.data) || response || null;
      }
      if (!current()) return;
      const analysis = reportDetail && reportDetail.snoreAnalysis;
      const riskInfo = analysis ? getSnoreRiskInfo(analysis.riskLevel) : null;
      if (!analysis || !riskInfo) throw new Error('报告数据不完整，请重新加载');
      const { avgDecibel, peakDecibel, snoreRate, apneaEvents } = analysis;
      if (![avgDecibel, peakDecibel, snoreRate, apneaEvents].every(Number.isFinite) ||
          avgDecibel < 0 || peakDecibel < avgDecibel || peakDecibel > 160 ||
          snoreRate < 0 || snoreRate > 100 || !Number.isInteger(apneaEvents) || apneaEvents < 0) {
        throw new Error('报告测量数据不完整或无效，请重新加载');
      }
      const statCards = analysis ? [
        { iconPath: '/static/icons/microphone.svg', value: analysis.avgDecibel + ' dB', label: '平均分贝' },
        { iconPath: '/static/icons/trend.svg', value: analysis.peakDecibel + ' dB', label: '峰值分贝' },
        { iconPath: '/static/icons/moon.svg', value: analysis.snoreRate + '%', label: '鼾声占比' },
        { iconPath: '/static/icons/warning.svg', value: analysis.apneaEvents + ' 次', label: '呼吸暂停' },
      ] : [];
      const riskScore = calculateRiskScore(analysis);
      riskInfo.desc = `本次录音分析提示${riskInfo.title}，记录到 ${apneaEvents} 次疑似呼吸暂停事件。结果仅供筛查参考。`;
      this.setData({ hasLoaded: true, isLoading: false, loadError: '', reportDetail, riskInfo, statCards, riskScore });
    } catch (error) {
      if (!current()) return;
      console.error('[SnoreResult] 加载失败', error);
      this.setData({ isLoading: false, reportDetail: null, riskInfo: null, statCards: [], riskScore: 0,
        loadError: (error && error.message) || '加载报告失败' });
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  goAppointment() {
    try {
    if (this.data.reportDetail && this.data.reportDetail.id && this.data.reportDetail.id !== 'local') {
      wx.setStorageSync('pending_appointment_assessment', {
        type: 'snore',
        id: this.data.reportDetail.id,
        label: 'AI鼾声分析',
      });
    } else {
      // A local report has no server ID and must not inherit an earlier link.
      wx.setStorageSync('pending_appointment_assessment', null);
    }
    } catch (error) {
      wx.showToast({ title: '预约报告信息保存失败，请重试', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/appointment/store-select' });
  },

  goHome() {
    this.handleBack();
  },

  restartRecording() {
    const patientId = this.data.reportDetail && this.data.reportDetail.patientId;
    const query = patientId ? '?patientId=' + encodeURIComponent(String(patientId)) : '';
    wx.redirectTo({ url: '/pages/assessment/recording/index' + query });
  },
});
