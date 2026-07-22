const api = require('../../../api/index');

function getEssLevelInfo(score) {
  if (score <= 5) {
    return {
      level: '正常（低嗜睡倾向）',
      color: 'linear-gradient(135deg, #10B981, #059669)',
      desc: '您的日间嗜睡程度在正常范围内，白天精神状态良好。',
      advice: '保持现有作息规律，定期关注睡眠质量变化。如仍存在打鼾问题，建议进行睡眠评估。',
      adviceBg: '#f0fdf4',
      adviceBorder: '#bbf7d0',
      adviceTitleColor: '#166534',
      adviceTextColor: '#15803d',
      adviceIcon: '/static/icons/heart.svg',
    };
  }
  if (score <= 10) {
    return {
      level: '正常偏高',
      color: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
      desc: '您的日间嗜睡程度略高于正常范围，可能存在轻度睡眠质量下降。',
      advice: '注意保持规律作息，避免熬夜。建议使用 APP 内的 AI 鼾声分析功能，了解夜间睡眠状况。',
      adviceBg: '#eff6ff',
      adviceBorder: '#bfdbfe',
      adviceTitleColor: '#1e40af',
      adviceTextColor: '#1d4ed8',
      adviceIcon: '/static/icons/info.svg',
    };
  }
  if (score <= 12) {
    return {
      level: '轻度嗜睡',
      color: 'linear-gradient(135deg, #F59E0B, #D97706)',
      desc: '您存在轻度日间过度嗜睡，可能影响日常工作和生活质量。',
      advice: '建议在线预约睡眠呼吸门诊，进行专业的睡眠评估。及早干预可有效改善睡眠质量。',
      adviceBg: '#fffbeb',
      adviceBorder: '#fde68a',
      adviceTitleColor: '#92400e',
      adviceTextColor: '#b45309',
      adviceIcon: '/static/icons/alert.svg',
    };
  }
  if (score <= 15) {
    return {
      level: '中度嗜睡',
      color: 'linear-gradient(135deg, #F97316, #C2410C)',
      desc: '您存在中度日间嗜睡，日常活动受到明显影响，需引起重视。',
      advice: '强烈建议尽快预约专业门诊。可能需要进行睡眠监测，评估是否存在睡眠呼吸暂停。',
      adviceBg: '#fff7ed',
      adviceBorder: '#ffedd5',
      adviceTitleColor: '#9a3412',
      adviceTextColor: '#c2410c',
      adviceIcon: '/static/icons/alert.svg',
    };
  }
  return {
    level: '重度嗜睡',
    color: 'linear-gradient(135deg, #EF4444, #B91C1C)',
    desc: '您存在重度日间嗜睡，可能对健康和安全造成严重影响。',
    advice: '请立即预约鼾静健康门诊进行专业诊断。建议避免长途驾驶，尽快进行多导睡眠监测。',
    adviceBg: '#fef2f2',
    adviceBorder: '#fee2e2',
    adviceTitleColor: '#991b1b',
    adviceTextColor: '#b91c1c',
    adviceIcon: '/static/icons/alert.svg',
  };
}

function getAnswerPresentation(score) {
  if (score === 0) return { label: '从不', color: '#10B981', background: '#ECFDF5', borderColor: '#A7F3D0' };
  if (score === 1) return { label: '轻度', color: '#D97706', background: '#FFFBEB', borderColor: '#FDE68A' };
  if (score === 2) return { label: '中度', color: '#C2410C', background: '#FFF7ED', borderColor: '#FDBA74' };
  if (score === 3) return { label: '高度', color: '#B91C1C', background: '#FEF2F2', borderColor: '#FCA5A5' };
  return { label: '未答', color: '#64748B', background: '#F8FAFC', borderColor: '#E2E8F0' };
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || [];
  return Array.isArray(payload) ? payload : [];
}

Page({
  data: {
    isLoading: true,
    hasLoaded: false,
    resultDetail: null,
    questionList: [],
    score: 0,
    levelInfo: null,
    answerReviewList: [],
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
      const questionsResponse = await api.getESSQuestions();
      const questionList = unwrapList(questionsResponse);
      let resultDetail = null;
      if (assessmentId) {
        const detailResponse = await api.getAssessmentDetail(assessmentId);
        const payload = (detailResponse && detailResponse.data) || detailResponse || null;
        if (payload && payload.type === 'ess') {
          resultDetail = payload;
        }
      } else {
        resultDetail = wx.getStorageSync('last_ess_assessment_result') || null;
      }
      const score = Number((resultDetail && resultDetail.essScore) || 0);
      const levelInfo = resultDetail ? getEssLevelInfo(score) : null;
      const answerReviewList = questionList.map((questionItem, questionIndex) => {
        const answerScore = (resultDetail && resultDetail.essAnswers && resultDetail.essAnswers[questionIndex]) ?? -1;
        const presentation = getAnswerPresentation(answerScore);
        return {
          questionId: questionItem.id,
          index: questionIndex + 1,
          situation: questionItem.situation || '',
          label: presentation.label,
          style: 'color:' + presentation.color + ';background:' + presentation.background + ';border-color:' + presentation.borderColor,
        };
      });
      this.setData({
        questionList,
        resultDetail,
        score,
        levelInfo,
        answerReviewList,
        isLoading: false,
        hasLoaded: true,
      });
    } catch (error) {
      console.error('加载结果详情失败', error);
      this.setData({ isLoading: false, hasLoaded: true });
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

  goHome() {
    this.handleBack();
  },

  goAppointment() {
    const result = this.data.resultDetail;
    const score = Number((result && result.essScore) || 0);
    if (result && result.id) {
      wx.setStorageSync('pending_appointment_assessment', {
        type: 'ess',
        id: result.id,
        label: 'ESS嗜睡量表 ' + score + '分',
      });
    }
    wx.navigateTo({ url: '/pages/appointment/store-select' });
  },

  restartAssessment() {
    wx.redirectTo({ url: '/pages/assessment/questionnaire/index' });
  },
});
