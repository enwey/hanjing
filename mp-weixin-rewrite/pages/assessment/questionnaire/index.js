const api = require('../../../api/index');

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
    isPageReady: false,
    questions: [],
    answers: [],
    currentQuestionIndex: 0,
    totalQuestions: 0,
    memberList: [],
    memberNames: [],
    memberIndex: 0,
    selectedMemberName: '本人',
    selectedMemberId: '',
    answerOptions: ANSWER_OPTIONS,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.resetState();
    try {
      const [membersResponse, questionsResponse] = await Promise.all([
        api.getFamilyMembers(),
        api.getESSQuestions(),
      ]);
      const memberList = unwrapList(membersResponse);
      const questions = unwrapList(questionsResponse);
      const memberNames = memberList.map((member) => (member.name || '') + '（' + (RELATION_LABEL_MAP[member.relation] || member.relation || '成员') + '）');
      const selfIndex = memberList.findIndex((member) => member.relation === 'self');
      const memberIndex = selfIndex >= 0 ? selfIndex : 0;
      const selectedMember = memberList[memberIndex] || null;

      this.setData({
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
      wx.showToast({ title: '加载量表失败', icon: 'none' });
    }
  },

  resetState() {
    this.setData({
      isPageReady: false,
      questions: [],
      answers: [],
      currentQuestionIndex: 0,
      totalQuestions: 0,
    });
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[memberIndex];
    if (!selectedMember) return;
    this.setData({
      memberIndex,
      selectedMemberName: selectedMember.name || '本人',
      selectedMemberId: String(selectedMember.id || ''),
    });
  },

  selectAnswer(event) {
    const score = Number(event.currentTarget.dataset.score);
    const answers = this.data.answers.slice();
    answers[this.data.currentQuestionIndex] = score;
    this.setData({ answers });
  },

  prevQuestion() {
    if (this.data.currentQuestionIndex <= 0) return;
    this.setData({ currentQuestionIndex: this.data.currentQuestionIndex - 1 });
  },

  nextQuestion() {
    if (this.data.answers[this.data.currentQuestionIndex] < 0) {
      wx.showToast({ title: '请选择一个选项后再进行下一题', icon: 'none' });
      return;
    }
    if (this.data.currentQuestionIndex < this.data.totalQuestions - 1) {
      this.setData({ currentQuestionIndex: this.data.currentQuestionIndex + 1 });
    }
  },

  handleDotClick(event) {
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
    try {
      const response = await api.submitESS({
        patientId: this.data.selectedMemberId,
        answers: this.data.answers,
      });
      const result = (response && response.data) || response || {};
      wx.setStorageSync('last_ess_assessment_result', result);
      wx.redirectTo({ url: '/pages/assessment/result/index' });
    } catch (error) {
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },
});
