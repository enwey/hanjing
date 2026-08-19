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

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const context = await patientContextStore.refresh();
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };
      const response = await api.getTreatmentRecord(params);
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
        loading: false,
        hasRealTreatmentRecord,
        adviceSections,
        followupDate: recordDetail && recordDetail.followupDate ? recordDetail.followupDate : '',
      });
    } catch (error) {
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
