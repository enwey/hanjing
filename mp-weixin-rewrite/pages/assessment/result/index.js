const api = require('../../../api/index');

function getEssLevelInfo(score) {
  if (score <= 5) {
    return {
      level: '状态平稳',
      color: 'linear-gradient(135deg, #10B981, #059669)',
      desc: '从本次结果看，您近期白天状态相对平稳。',
      advice: '保持现有作息规律，定期关注睡眠质量变化。如仍有困倦或打鼾感受，可过段时间再次自测。',
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
      desc: '从本次结果看，您近期白天状态略有波动。',
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
      level: '轻度关注',
      color: 'linear-gradient(135deg, #F59E0B, #D97706)',
      desc: '从本次结果看，近期作息或休息质量可能对日间状态产生了一定影响。',
      advice: '建议继续关注近期作息与睡眠状态，可结合鼾声分析与后续记录持续观察变化。',
      adviceBg: '#fffbeb',
      adviceBorder: '#fde68a',
      adviceTitleColor: '#92400e',
      adviceTextColor: '#b45309',
      adviceIcon: '/static/icons/alert.svg',
    };
  }
  if (score <= 15) {
    return {
      level: '中度关注',
      color: 'linear-gradient(135deg, #F97316, #C2410C)',
      desc: '从本次结果看，近期睡眠状态对日间精力影响较明显，建议持续观察。',
      advice: '建议优先调整作息、减少熬夜，并持续记录睡眠表现，方便后续对比变化。',
      adviceBg: '#fff7ed',
      adviceBorder: '#ffedd5',
      adviceTitleColor: '#9a3412',
      adviceTextColor: '#c2410c',
      adviceIcon: '/static/icons/alert.svg',
    };
  }
  return {
    level: '重点关注',
    color: 'linear-gradient(135deg, #EF4444, #B91C1C)',
    desc: '从本次结果看，近期白天困倦感较明显，建议重点关注作息与休息情况。',
    advice: '建议重点关注白天精神状态与夜间睡眠表现，避免疲劳驾驶，并持续记录相关变化。',
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
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ isLoading: true });
    }
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
    wx.navigateBack({ delta: 1 });
  },

  goHome() {
    this.handleBack();
  },

  goSleepRecord() {
    wx.switchTab({ url: '/pages/treatment/index' });
  },

  restartAssessment() {
    wx.redirectTo({ url: '/pages/assessment/questionnaire/index' });
  },
});
