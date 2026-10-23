const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');

const ANSWER_OPTIONS = [
  { score: 0, label: '从不打瞌睡', emoji: '😀' },
  { score: 1, label: '轻度可能', emoji: '🙂' },
  { score: 2, label: '中度可能', emoji: '😐' },
  { score: 3, label: '高度可能', emoji: '😴' },
];

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

Page({
  data: {
    hasLoaded: false,
    isPageReady: false,
    isLoading: false,
    loadError: '',
    isSubmitting: false,
    questions: [],
    answers: [],
    currentQuestionIndex: 0,
    totalQuestions: 0,
    memberList: [],
    memberNames: [],
    memberIndex: 0,
    selectedMemberName: '本人',
    selectedMemberId: '',
    initialPatientId: '',
    answerOptions: ANSWER_OPTIONS,
  },

  onLoad(options) {
    this._unloaded = false;
    this.setData({ initialPatientId: options && options.patientId ? String(options.patientId) : '' });
  },

  onUnload() {
    this._unloaded = true;
  },

  async onShow() {
    const generation = sessionStore.getLoginGeneration();
    if (this._generation !== generation || !sessionStore.isLoggedIn()) {
      if (this._generation !== undefined) this.setData({ initialPatientId: '' });
      this._generation = generation;
      this._savedResult = null;
      this.resetState();
      this.setData({ hasLoaded: false, memberList: [], memberNames: [], selectedMemberId: '', selectedMemberName: '本人', memberIndex: 0 });
    }
    if (!sessionStore.isLoggedIn()) return;
    if (this.data.hasLoaded) {
      return;
    }
    await this.loadPage();
  },

  async loadPage() {
    if (this._unloaded || !sessionStore.isLoggedIn()) return;
    const generation = sessionStore.getLoginGeneration();
    this._generation = generation;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const current = () => !this._unloaded && requestId === this._requestId && sessionStore.isLoggedIn() && generation === sessionStore.getLoginGeneration();
    this.resetState();
    this.setData({ isLoading: true });
    try {
      const [membersResponse, questionsResponse] = await Promise.all([
        api.getFamilyMembers(),
        api.getESSQuestions(),
      ]);
      if (!current()) return;
      const memberList = unwrapList(membersResponse);
      const questions = unwrapList(questionsResponse);
      if (questions.length !== 8) throw new Error('量表题目不完整');
      const memberNames = memberList.map((member) => (member.name || '') + '（' + (RELATION_LABEL_MAP[member.relation] || member.relation || '成员') + '）');
      const initialPatientId = this.data.initialPatientId;
      const initialIndex = initialPatientId ? memberList.findIndex((member) => String(member.id || '') === initialPatientId) : -1;
      const selfIndex = memberList.findIndex((member) => member.relation === 'self');
      const memberIndex = initialIndex >= 0 ? initialIndex : (selfIndex >= 0 ? selfIndex : 0);
      const selectedMember = memberList[memberIndex] || null;

      this.setData({
        hasLoaded: true,
        isLoading: false,
        isPageReady: true,
        questions,
        answers: new Array(questions.length).fill(-1),
        totalQuestions: questions.length,
        memberList,
        memberNames,
        memberIndex,
        selectedMemberName: selectedMember ? selectedMember.name || '本人' : '本人',
        selectedMemberId: selectedMember ? String(selectedMember.id || '') : '',
      });
    } catch (error) {
      if (!current()) return;
      this.setData({ isLoading: false, loadError: '加载量表失败，请检查网络后重试' });
      wx.showToast({ title: '加载量表失败', icon: 'none' });
    }
  },

  resetState() {
    this.setData({
      isLoading: false,
      loadError: '',
      isPageReady: false,
      isSubmitting: false,
      questions: [],
      answers: [],
      currentQuestionIndex: 0,
      totalQuestions: 0,
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  async retryLoad() {
    if (this._unloaded || this.data.isLoading || this.data.isSubmitting) return;
    if (!sessionStore.isLoggedIn()) {
      this.setData({ loadError: '登录已失效，请返回登录后重试' });
      return;
    }
    await this.loadPage();
  },

  onMemberChange(event) {
    if (this.data.isSubmitting) return;
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[memberIndex];
    if (!selectedMember) return;
    if (String(selectedMember.id || '') === this.data.selectedMemberId) return;
    this._savedResult = null;
    this.setData({
      answers: new Array(this.data.questions.length).fill(-1),
      currentQuestionIndex: 0,
      memberIndex,
      selectedMemberName: selectedMember.name || '本人',
      selectedMemberId: String(selectedMember.id || ''),
    });
  },

  selectAnswer(event) {
    if (this.data.isSubmitting) return;
    const score = Number(event.currentTarget.dataset.score);
    const answers = this.data.answers.slice();
    answers[this.data.currentQuestionIndex] = score;
    this.setData({ answers });
  },

  prevQuestion() {
    if (this.data.isSubmitting) return;
    if (this.data.currentQuestionIndex <= 0) return;
    this.setData({ currentQuestionIndex: this.data.currentQuestionIndex - 1 });
  },

  nextQuestion() {
    if (this.data.isSubmitting) return;
    if (this.data.answers[this.data.currentQuestionIndex] < 0) {
      wx.showToast({ title: '请选择一个选项后再进行下一题', icon: 'none' });
      return;
    }
    if (this.data.currentQuestionIndex < this.data.totalQuestions - 1) {
      this.setData({ currentQuestionIndex: this.data.currentQuestionIndex + 1 });
    }
  },

  handleDotClick(event) {
    if (this.data.isSubmitting) return;
    const targetIndex = Number(event.currentTarget.dataset.index || 0);
    if (targetIndex > this.data.currentQuestionIndex && this.data.answers[this.data.currentQuestionIndex] < 0) {
      wx.showToast({ title: '请选择一个选项后再进行下一题', icon: 'none' });
      return;
    }
    for (let index = this.data.currentQuestionIndex; index < targetIndex; index += 1) {
      if (this.data.answers[index] < 0) {
        wx.showToast({ title: '请按顺序回答所有题目', icon: 'none' });
        return;
      }
    }
    this.setData({ currentQuestionIndex: targetIndex });
  },

  async submitQuestionnaire() {
    if (this._unloaded) return;
    if (!sessionStore.isLoggedIn() || this._generation !== sessionStore.getLoginGeneration()) {
      await this.onShow();
      return;
    }
    if (this._unloaded || this.data.isSubmitting) {
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    const submissionKey = JSON.stringify([this.data.selectedMemberId, this.data.answers]);
    if (this._savedResult && this._savedGeneration === generation && this._savedSubmissionKey === submissionKey) {
      this.setData({ isSubmitting: true });
      this.openSavedResult();
      return;
    }
    if (this.data.answers[this.data.currentQuestionIndex] < 0) {
      wx.showToast({ title: '请选择一个选项后再提交评估', icon: 'none' });
      return;
    }
    if (this.data.answers.indexOf(-1) !== -1) {
      wx.showToast({ title: '请先完成所有题目', icon: 'none' });
      return;
    }
    try {
      this.setData({ isSubmitting: true });
      const response = await api.submitESS({
        patientId: this.data.selectedMemberId,
        answers: this.data.answers,
      });
      const result = (response && response.data) || response || {};
      if (this._unloaded || generation !== sessionStore.getLoginGeneration() || !sessionStore.isLoggedIn()) return;
      if (!result.id) throw new Error('评估保存结果未确认');
      this._savedResult = result;
      this._savedGeneration = generation;
      this._savedSubmissionKey = submissionKey;
      // A cache failure must not turn an already saved report into another POST.
      try { wx.setStorageSync('last_ess_assessment_result', result); } catch (error) { /* ID remains available in memory. */ }
      this.openSavedResult();
    } catch (error) {
      if (this._unloaded || !sessionStore.isLoggedIn() || generation !== sessionStore.getLoginGeneration()) return;
      this.setData({ isSubmitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  openSavedResult() {
    const result = this._savedResult;
    const generation = this._savedGeneration;
    const fail = () => {
      if (this._unloaded || !sessionStore.isLoggedIn() || generation !== sessionStore.getLoginGeneration() || result !== this._savedResult) return;
      this.setData({ isSubmitting: false });
      wx.showToast({ title: '报告已保存，打开失败，请再次点击提交查看', icon: 'none' });
    };
    try {
      wx.redirectTo({ url: '/pages/assessment/result/index?id=' + encodeURIComponent(this._savedResult.id), fail });
    } catch (error) {
      fail();
    }
  },
});
