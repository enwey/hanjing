const api = require('../../api/index');

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

Page({
  data: {
    loading: true,
    loadError: '',
    appointmentId: '',
    appointment: null,
    appointmentNo: '',
    storeName: '',
    doctorName: '',
    appointmentDate: '',
    appointmentTime: '',
    patientName: '本人',
    symptomDesc: '无',
    consultFeeLabel: '¥0.00',
    requireDeposit: false,
    depositAmountLabel: '¥0.00',
    cancelLimitText: '就诊前 2 小时',
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const appointmentId = String((this.options && this.options.id) || '');
    this.setData({
      loading: true,
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
      const bookingSettings = unwrapObject(bookingSettingsResponse);

      this.setData({
        loading: false,
        appointment,
        appointmentNo: appointment.appointmentNo || appointment.appointment_no || '',
        storeName: appointment.storeName || appointment.store_name || '',
        doctorName: appointment.doctorName || appointment.doctor_name || '',
        appointmentDate: appointment.appointmentDate || appointment.appointment_date || '',
        appointmentTime: appointment.appointmentTime || appointment.appointment_time || '',
        patientName: appointment.patientName || appointment.patient_name || '本人',
        symptomDesc: appointment.symptomDesc || appointment.symptom_desc || '无',
        consultFeeLabel: toYuanLabel(appointment.consultFee || appointment.consult_fee || 0),
        requireDeposit: Boolean(appointment.requireDeposit || appointment.require_deposit),
        depositAmountLabel: toYuanLabel(appointment.depositAmount || appointment.deposit_amount || 0),
        cancelLimitText: bookingSettings.cancelLimit || bookingSettings.cancelLimitText || '就诊前 2 小时',
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载预约结果失败',
      });
    }
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
