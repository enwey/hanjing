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
    loadError: '',
    hasRealTreatmentRecord: false,
    recordDetail: null,
    adjustmentHistory: [],
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };
      const [recordResponse, historyResponse] = await Promise.all([
        api.getTreatmentRecord(params),
        api.getDeviceAdjustments(params),
      ]);
      const recordDetail = (recordResponse && recordResponse.data) || recordResponse || null;
      const adjustmentHistory = unwrapList(historyResponse).map((item) => ({
        id: String(item.id || ''),
        date: item.date || item.createdAt || '',
        value: item.value || item.adjustmentValue || '',
        note: item.note || item.description || '',
        doctor: item.doctor || item.doctorName || '',
        comfort: Number(item.comfort || 0),
      }));
      this.setData({
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
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载设备调整失败',
      });
    }
  },

  goAppointment() {
    wx.switchTab({ url: '/pages/appointment/index' });
  },
});
