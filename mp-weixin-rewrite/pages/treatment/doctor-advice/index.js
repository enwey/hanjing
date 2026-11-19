const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    hasRealTreatmentRecord: false,
    adviceSections: [],
    followupDate: '',
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  clearPatientData(patientId) {
    if (this._loadedPatientId === patientId) return;
    this.setData({
      hasLoaded: false, loading: true, loadError: '',
      hasRealTreatmentRecord: false, adviceSections: [], followupDate: '',
    });
  },

  async loadPage(options = {}) {
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this.clearPatientData(patientContextStore.state.currentPatientId);
    const silent = !!options.silent && this.data.hasLoaded;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const context = await patientContextStore.refresh();
      if (version !== this._loadVersion) return;
      const patientId = context.currentPatientId;
      this.clearPatientData(patientId);
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };
      const response = await api.getTreatmentRecord(params);
      if (version !== this._loadVersion || patientId !== (patientContextStore.state.currentPatientId)) return;
      this._loadedPatientId = patientId;
      const recordDetail = (response && response.data) || response || null;
      const hasRealTreatmentRecord = Boolean(
        recordDetail &&
        (recordDetail.isRealTreatmentRecord ||
          recordDetail.diagnosis ||
          recordDetail.treatmentPlan ||
          recordDetail.doctorAdvice ||
          recordDetail.followupDate),
      );
      const adviceSections = [];
      if (hasRealTreatmentRecord) {
        if (recordDetail.diagnosis) {
          adviceSections.push({ key: 'diagnosis', title: '诊断结果', content: recordDetail.diagnosis, highlight: false });
        }
        if (recordDetail.treatmentPlan) {
          adviceSections.push({ key: 'plan', title: '治疗方案', content: recordDetail.treatmentPlan, highlight: false });
        }
        if (recordDetail.doctorAdvice) {
          adviceSections.push({ key: 'advice', title: '医生建议', content: recordDetail.doctorAdvice, highlight: true });
        }
      }

      this.setData({
        hasLoaded: true,
        loadError: '',
        loading: false,
        hasRealTreatmentRecord,
        adviceSections,
        followupDate: recordDetail && recordDetail.followupDate ? recordDetail.followupDate : '',
      });
    } catch (error) {
      if (version !== this._loadVersion) return;
      this.clearPatientData(patientContextStore.state.currentPatientId);
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载医嘱建议失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载医嘱建议失败', icon: 'none' });
    }
  },

  goAppointment() {
    wx.navigateTo({ url: '/pages/appointment/booking/index' });
  },
});
