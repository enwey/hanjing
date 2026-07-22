const patientContextService = require('../services/patient-context-service');

const STORAGE_KEY = 'rewrite_current_patient_id';

const patientContextStore = {
  state: {
    currentPatientId: wx.getStorageSync(STORAGE_KEY) || '',
    members: [],
    currentMember: null,
  },

  async refresh() {
    const context = await patientContextService.loadPatientContext(this.state.currentPatientId);
    this.state.members = context.members;
    this.state.currentMember = context.currentMember;
    this.setCurrentPatientId(context.currentPatientId);
    return context;
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
