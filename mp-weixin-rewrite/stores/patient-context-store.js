const patientContextService = require('../services/patient-context-service');

const STORAGE_KEY = 'rewrite_current_patient_id';
let contextGeneration = 0;

const patientContextStore = {
  state: {
    currentPatientId: wx.getStorageSync(STORAGE_KEY) || '',
    members: [],
    currentMember: null,
  },

  async refresh() {
    const generation = contextGeneration;
    const context = await patientContextService.loadPatientContext(this.state.currentPatientId);
    if (generation !== contextGeneration) throw new Error('账号已切换，请重新加载成员');
    this.state.members = context.members;
    this.state.currentMember = context.currentMember;
    this.setCurrentPatientId(context.currentPatientId);
    return context;
  },

  reset() {
    contextGeneration += 1;
    this.state.currentPatientId = wx.getStorageSync(STORAGE_KEY) || '';
    this.state.members = [];
    this.state.currentMember = null;
  },

  setCurrentPatientId(patientId) {
    this.state.currentPatientId = patientId || '';
    if (this.state.currentPatientId) {
      wx.setStorageSync(STORAGE_KEY, this.state.currentPatientId);
    } else {
      wx.removeStorageSync(STORAGE_KEY);
    }
  },

  selectMemberByIndex(memberIndex) {
    const member = this.state.members[memberIndex];
    if (!member) {
      return null;
    }

    this.state.currentMember = member;
    this.setCurrentPatientId(String(member.id));
    return member;
  },
};

module.exports = patientContextStore;
