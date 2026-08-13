const api = require('../../api/index');
const { getStoreCoverUrl } = require('../../common/utils/image-url');

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function toYuanLabel(amount) {
  const numberValue = Number(amount || 0);
  if (!Number.isFinite(numberValue)) {
    return '¥0.00';
  }
  return '¥' + (numberValue / 100).toFixed(2);
}

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
    appointmentId: '',
    appointment: null,
    appointmentNo: '',
    storeCoverUrl: '',
    storeCoverLoaded: false,
    storeName: '',
    doctorName: '',
    appointmentDate: '',
    appointmentTime: '',
    patientName: '本人',
    symptomDesc: '无',
    consultFeeLabel: '¥0.00',
    requireDeposit: false,
    depositAmountLabel: '¥0.00',
    cancelLimitText: '到店前 2 小时',
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoaded = false;
    this.loadPage({ silent: false });
  },

  async onShow() {
    if (!this.hasLoaded) {
      return;
    }
    await this.loadPage({ silent: true });
  },

  async loadPage(options = {}) {
    const silent = Boolean(options.silent);
    const appointmentId = String((this.options && this.options.id) || '');
    this.setData({
      loading: silent ? this.data.loading : true,
      loadError: '',
      appointmentId,
    });

    if (!appointmentId) {
      this.setData({
        loading: false,
        loadError: '缺少预约编号',
      });
      return;
    }

    try {
      const [detailResponse, bookingSettingsResponse] = await Promise.all([
        api.getAppointmentDetail(appointmentId),
        api.getBookingSettings(),
      ]);
      const detailSource = unwrapObject(detailResponse);
      const appointment = detailSource.appointment || detailSource || {};
      const storesResponse = await api.getStores();
      const stores = unwrapList(storesResponse);
      const store = detailSource.store || stores.find((item) => String(item.id) === String(appointment.storeId || appointment.store_id)) || {};
      const bookingSettings = unwrapObject(bookingSettingsResponse);
      const nextStoreCoverUrl = getStoreCoverUrl(store || appointment);

      this.setData({
        loading: false,
        appointment,
        appointmentNo: appointment.appointmentNo || appointment.appointment_no || '',
        storeCoverUrl: nextStoreCoverUrl,
        storeCoverLoaded: silent && nextStoreCoverUrl === this.data.storeCoverUrl ? this.data.storeCoverLoaded : false,
        storeName: appointment.storeName || appointment.store_name || store.name || store.storeName || '',
        doctorName: appointment.doctorName || appointment.doctor_name || '',
        appointmentDate: appointment.appointmentDate || appointment.appointment_date || '',
        appointmentTime: appointment.appointmentTime || appointment.appointment_time || '',
        patientName: appointment.patientName || appointment.patient_name || '本人',
        symptomDesc: appointment.symptomDesc || appointment.symptom_desc || '无',
        consultFeeLabel: toYuanLabel(appointment.consultFee || appointment.consult_fee || 0),
        requireDeposit: Boolean(appointment.requireDeposit || appointment.require_deposit),
        depositAmountLabel: toYuanLabel(appointment.depositAmount || appointment.deposit_amount || 0),
        cancelLimitText: bookingSettings.cancelLimit || bookingSettings.cancelLimitText || '到店前 2 小时',
      });
      this.hasLoaded = true;
    } catch (error) {
      this.setData({
        loading: silent ? this.data.loading : false,
        loadError: (error && error.message) || '加载预约结果失败',
      });
    }
  },

  handleStoreCoverLoad() {
    if (this.data.storeCoverUrl) {
      this.setData({ storeCoverLoaded: true });
    }
  },

  handleStoreCoverError() {
    this.setData({ storeCoverLoaded: false });
  },

  openAppointmentDetail() {
    if (!this.data.appointmentId) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    wx.redirectTo({
      url: '/pages/appointment/detail?id=' + this.data.appointmentId,
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
