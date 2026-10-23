const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');
const { formatChinaDateTime } = require('../../common/utils/date-time');

const ESS_LEVEL_LABEL_MAP = {
  normal: '正常',
  mild: '轻度嗜睡',
  moderate: '中度嗜睡',
  severe: '重度嗜睡',
};

const SNORE_LEVEL_LABEL_MAP = {
  high: '重度风险',
  medium: '中度风险',
  normal: '正常',
  low: '低风险',
  mild: '轻度风险',
  moderate: '中度风险',
  severe: '重度风险',
};

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
  if (level === 'severe' || level === 'high') return '#ef4444';
  if (level === 'moderate' || level === 'medium') return '#f59e0b';
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
    dateLabel: formatChinaDateTime(record.createdAt || '', false),
    summary: isEss
      ? '总分 ' + Number(record.essScore || 0) + ' 分'
      : '录音 ' + Number(snoreAnalysis.duration || 0) + ' 秒，鼾声占比 ' + Number(snoreAnalysis.snoreRate || 0) + '%',
    recommendation: record.recommendation || snoreAnalysis.recommendation || '',
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    isLoggedIn: false,
    records: [],
    pendingCount: 0,
    memberList: [],
    memberNames: [],
    memberIndex: 0,
    selectedMemberName: '本人',
    selectedMemberId: '',
  },

  async onShow() {
    this._unloaded = false;
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  onUnload() {
    this._unloaded = true;
    this._requestId = (this._requestId || 0) + 1;
  },

  clearAccountData() {
    this.setData({ records: [], memberList: [], memberNames: [], memberIndex: 0,
      selectedMemberName: '本人', selectedMemberId: '', pendingCount: 0,
      hasLoaded: false, loading: false, loadError: '', isLoggedIn: sessionStore.isLoggedIn() });
  },

  requestIsCurrent(requestId, generation) {
    if (this._unloaded || requestId !== this._requestId) return false;
    if (!sessionStore.isLoggedIn() || generation !== sessionStore.getLoginGeneration()) {
      this.clearAccountData();
      return false;
    }
    return true;
  },

  async loadPage(options = {}) {
    if (this._unloaded) return;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    if (this._generation !== generation || !sessionStore.isLoggedIn()) this.clearAccountData();
    this._generation = generation;
    const silent = !!options.silent;
    const isLoggedIn = sessionStore.isLoggedIn();
    this.setData({
      loading: silent ? false : isLoggedIn,
      isLoggedIn,
      loadError: silent ? this.data.loadError : '',
      records: silent && isLoggedIn ? this.data.records : [],
    });

    this.checkPendingCount();

    if (!isLoggedIn) {
      return;
    }

    try {
      // Offline upload failures must not hide existing online history.
      try {
        await api.syncPendingSnoreRecordings();
      } catch (error) {
        if (this.requestIsCurrent(requestId, generation)) {
          wx.showToast({ title: (error && error.message) || '离线记录同步失败', icon: 'none' });
        }
      }
      if (!this.requestIsCurrent(requestId, generation)) return;
      this.checkPendingCount();
      await this.ensureFamilyMembers(requestId, generation);
      if (!this.requestIsCurrent(requestId, generation)) return;
      const assessmentsResponse = await api.getAssessments(this.data.selectedMemberId ? { patientId: this.data.selectedMemberId } : {});
      if (!this.requestIsCurrent(requestId, generation)) return;
      const records = unwrapList(assessmentsResponse).map(normalizeAssessmentRecord);
      this.setData({
        hasLoaded: true,
        loading: false,
        loadError: '',
        records,
      });
    } catch (error) {
      if (!this.requestIsCurrent(requestId, generation)) return;
      if (error && (error.statusCode === 401 || error.statusCode === 403)) {
        this.clearAccountData();
        return;
      }
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载评估记录失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载评估记录失败', icon: 'none' });
    }
  },

  async ensureFamilyMembers(requestId, generation) {
    if (this.data.memberList.length) return;
    const membersResponse = await api.getFamilyMembers();
    if (!this.requestIsCurrent(requestId, generation)) return;
    const memberList = unwrapList(membersResponse);
    const memberNames = memberList.map((member) => (member.name || '') + '（' + (RELATION_LABEL_MAP[member.relation] || member.relation || '成员') + '）');
    const selfIndex = memberList.findIndex((member) => member.relation === 'self');
    const memberIndex = selfIndex >= 0 ? selfIndex : 0;
    const selectedMember = memberList[memberIndex] || null;
    this.setData({
      memberList,
      memberNames,
      memberIndex,
      selectedMemberName: selectedMember ? selectedMember.name || '本人' : '本人',
      selectedMemberId: selectedMember ? String(selectedMember.id || '') : '',
    });
  },

  async onMemberChange(event) {
    if (this._unloaded || !sessionStore.isLoggedIn()) return;
    const generation = sessionStore.getLoginGeneration();
    if (this._generation !== undefined && this._generation !== generation) {
      return this.loadPage();
    }
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[memberIndex];
    if (!selectedMember) return;
    this.setData({
      memberIndex,
      selectedMemberName: selectedMember.name || '本人',
      selectedMemberId: String(selectedMember.id || ''),
      loading: true,
      loadError: '',
      records: [],
    });
    try {
      const assessmentsResponse = await api.getAssessments(this.data.selectedMemberId ? { patientId: this.data.selectedMemberId } : {});
      if (!this.requestIsCurrent(requestId, generation)) return;
      const records = unwrapList(assessmentsResponse).map(normalizeAssessmentRecord);
      this.setData({ loading: false, loadError: '', records });
    } catch (error) {
      if (!this.requestIsCurrent(requestId, generation)) return;
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载评估记录失败',
      });
    }
  },

  checkPendingCount() {
    if (!sessionStore.isLoggedIn()) {
      this.setData({ pendingCount: 0 });
      return;
    }
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
      this.checkPendingCount();
      wx.showToast({ title: (error && error.message) || '同步失败，请检查网络', icon: 'none' });
    }
  },

  startEssAssessment() {
    if (!this.data.isLoggedIn) {
      navigation.openLogin('/pages/assessment/index');
      return;
    }
    const query = this.data.selectedMemberId ? '?patientId=' + this.data.selectedMemberId : '';
    navigation.openPage('/pages/assessment/questionnaire/index' + query);
  },

  startSnoreAssessment() {
    if (!this.data.isLoggedIn) {
      navigation.openLogin('/pages/assessment/index');
      return;
    }
    const query = this.data.selectedMemberId ? '?patientId=' + this.data.selectedMemberId : '';
    navigation.openPage('/pages/assessment/recording/index' + query);
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
    navigation.openLogin('/pages/assessment/index');
  },
});
