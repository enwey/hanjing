const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    hasRealTreatmentRecord: false,
    recordDetail: null,
    adjustmentHistory: [],
  },

  onLoad(options) { this._notificationPatientId = options.patientId || ''; },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  clearPatientData(patientId) {
    if (this._loadedPatientId === patientId) return;
    this.setData({
      hasLoaded: false, loading: true, loadError: '',
      hasRealTreatmentRecord: false, recordDetail: null, adjustmentHistory: [],
    });
  },

  async loadPage(options = {}) {
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this.clearPatientData(this._notificationPatientId || patientContextStore.state.currentPatientId);
    const silent = !!options.silent && this.data.hasLoaded;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const context = await patientContextStore.refresh();
      if (version !== this._loadVersion) return;
      const patientId = this._notificationPatientId || context.currentPatientId;
      this.clearPatientData(patientId);
      const params = patientId ? { patientId: patientId, _t: Date.now() } : { _t: Date.now() };
      const [recordResponse, historyResponse] = await Promise.all([
        api.getTreatmentRecord(params),
        api.getDeviceAdjustments(params),
      ]);
      if (version !== this._loadVersion || patientId !== (this._notificationPatientId || patientContextStore.state.currentPatientId)) return;
      this._loadedPatientId = patientId;
      const recordDetail = (recordResponse && recordResponse.data) || recordResponse || null;
      const adjustmentHistory = unwrapList(historyResponse).map((item) => ({
        id: String(item.id || ''),
        date: item.date || item.createdAt || '',
        value: item.value === 0 || item.value ? item.value : (item.adjustmentValue ?? ''),
        note: item.note || item.description || '',
        doctor: item.doctor || item.doctorName || '',
        comfort: Number(item.comfort || 0),
      }));
      this.setData({
        hasLoaded: true,
        loadError: '',
        loading: false,
        hasRealTreatmentRecord: Boolean(
          recordDetail &&
          (recordDetail.isRealTreatmentRecord ||
            recordDetail.deviceModel ||
            recordDetail.adjustmentValue ||
            recordDetail.nextAdjustDate ||
            adjustmentHistory.length),
        ),
        recordDetail,
        adjustmentHistory,
      });
    } catch (error) {
      if (version !== this._loadVersion) return;
      this.clearPatientData(this._notificationPatientId || patientContextStore.state.currentPatientId);
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载设备调整失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载设备调整失败', icon: 'none' });
    }
  },

  goAppointment() {
    wx.navigateTo({ url: '/pages/appointment/booking/index' });
  },
});
