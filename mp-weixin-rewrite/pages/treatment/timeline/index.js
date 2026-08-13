const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');

const TIMELINE_TYPE_LABEL_MAP = {
  visit: '初诊',
  adjust: '调整',
  followup: '随访',
  advice: '医嘱',
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

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    hasRealTreatmentRecord: false,
    deviceModel: '',
    adjustmentValue: '',
    nextAdjustDate: '',
    timelineItems: [],
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
      const [timelineResponse, treatmentRecordResponse] = await Promise.all([
        api.getTimeline(params),
        api.getTreatmentRecord(params),
      ]);
      const timelineItems = unwrapList(timelineResponse).map((item, index, list) => ({
        id: String(item.id || index),
        dateLabel: String(item.date || '').slice(5),
        typeLabel: TIMELINE_TYPE_LABEL_MAP[item.type] || '',
        color: item.color || '#3b6bf5',
        title: item.title || '',
        description: item.description || '',
        doctorName: item.doctorName || '',
        showLine: index < list.length - 1,
      }));
      const treatmentRecord = unwrapObject(treatmentRecordResponse);

      this.setData({
        hasLoaded: true,
        loading: false,
        hasRealTreatmentRecord: Boolean(treatmentRecord && treatmentRecord.isRealTreatmentRecord),
        deviceModel: treatmentRecord ? treatmentRecord.deviceModel || '' : '',
        adjustmentValue: treatmentRecord ? treatmentRecord.adjustmentValue || '' : '',
        nextAdjustDate: treatmentRecord ? treatmentRecord.nextAdjustDate || '' : '',
        timelineItems,
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载服务时间线失败',
          timelineItems: [],
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载服务时间线失败', icon: 'none' });
    }
  },

  goAppointment() {
    wx.switchTab({ url: '/pages/appointment/index' });
  },
});
