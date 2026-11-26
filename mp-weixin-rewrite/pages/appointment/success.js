const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
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
    canRetryLoad: false,
    resultTitle: '预约成功',
    resultDescription: '您的预约已提交，请按时就诊',
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
    cancelLimitText: '就诊前 2 小时',
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoaded = false;
    this.loadPage({ silent: false });
  },

  onReady() {
    if (this.options.paymentSubmitted === '1') {
      wx.showToast({ title: '支付已提交', icon: 'success', duration: 2000 });
    }
  },

  async onShow() {
    if (!this.hasLoaded) {
      return;
    }
    await this.loadPage({ silent: true });
  },

  onUnload() {
    this._unloaded = true;
  },

  retryLoad() {
    if (this.data.canRetryLoad && !this.data.loading) return this.loadPage();
  },

  async loadPage(options = {}) {
    const request = this.resultRequest = {};
    const generation = sessionStore.getLoginGeneration();
    if (this.resultOwner !== generation) {
      this.resultOwner = generation;
      this.setData({ loading: true, appointment: null, patientName: '', symptomDesc: '' });
    }
    const canUpdate = () => {
      if (this._unloaded || this.resultRequest !== request) return false;
      if (!sessionStore.isLoggedIn()) {
        this.setData({ loading: false, appointment: null, patientName: '', symptomDesc: '',
          loadError: '登录已失效，请重新登录后查看预约' });
        return false;
      }
      return generation === sessionStore.getLoginGeneration();
    };
    if (!canUpdate()) return;
    const silent = Boolean(options.silent);
    const appointmentId = String((this.options && this.options.id) || '');
    this.setData({
      loading: silent ? this.data.loading : true,
      loadError: '',
      canRetryLoad: false,
      appointmentId,
    });

    if (!appointmentId) {
      this.setData({
        loading: false,
        loadError: '缺少预约编号',
      });
      return;
    }

    let detailLoaded = false;
    try {
      let bookingSettings = {};
      let detailsReady = false;
      Promise.resolve().then(() => api.getBookingSettings()).then((response) => {
        bookingSettings = unwrapObject(response);
        if (detailsReady && canUpdate()) this.setData({
          cancelLimitText: bookingSettings.cancelLimit || bookingSettings.cancelLimitText || '就诊前 2 小时',
        });
      }).catch(() => {});
      const detailResponse = await api.getAppointmentDetail(appointmentId);
      if (!canUpdate()) return;
      detailLoaded = true;
      const detailSource = unwrapObject(detailResponse);
      const appointment = detailSource.appointment || detailSource || {};
      if (!['pending', 'confirmed', 'reminded', 'checked_in', 'arrived', 'completed'].includes(appointment.status)) {
        throw new Error(appointment.status === 'pending_payment'
          ? '预约尚未确认付款，请到预约记录核对状态，勿重复付款'
          : ({ cancelled: '该预约已取消', refunded: '该预约已退款' }[appointment.status] ||
            '预约状态待确认，请查看预约记录'));
      }
      const hasStore = detailSource.store && Object.keys(detailSource.store).length;
      const store = hasStore ? detailSource.store : {};
      detailsReady = true;
      const nextStoreCoverUrl = getStoreCoverUrl(hasStore ? store : appointment);

      this.setData({
        loading: false,
        appointment,
        resultTitle: appointment.status === 'reminded' ? '候诊中' : appointment.status === 'checked_in' ? '就诊中' : '预约成功',
        resultDescription: appointment.status === 'reminded' ? '请留意就诊叫号' :
          appointment.status === 'checked_in' ? '医生已叫号，就诊进行中' : '您的预约已提交，请按时就诊',
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
        cancelLimitText: bookingSettings.cancelLimit || bookingSettings.cancelLimitText || '就诊前 2 小时',
      });
      this.hasLoaded = true;
      const storeId = appointment.storeId || appointment.store_id;
      if (!hasStore && storeId) {
        Promise.resolve().then(() => api.getStores()).then((response) => {
          if (!canUpdate()) return;
          const match = unwrapList(response).find(item => String(item.id) === String(storeId));
          if (!match) return;
          const cover = getStoreCoverUrl(match) || this.data.storeCoverUrl;
          this.setData({
            storeName: this.data.storeName || match.name || match.storeName || '',
            storeCoverUrl: cover,
            storeCoverLoaded: cover === this.data.storeCoverUrl && this.data.storeCoverLoaded,
          });
        }).catch(() => {});
      }
    } catch (error) {
      if (!canUpdate()) return;
      this.setData({
        loading: false,
        appointment: null,
        canRetryLoad: !detailLoaded,
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
