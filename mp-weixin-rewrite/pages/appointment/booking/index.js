const paymentReceipt = require('../../../common/utils/appointment-payment-receipt');
const { parseAppointmentTimestamp, RESCHEDULE_LIMIT_HOURS, getCancelLimitHours } = require('../../../common/utils/appointment-time');

const api = require('../../../api/index');
const navigation = require('../../../common/utils/navigation');
const sessionStore = require('../../../stores/session-store');
const subscribe = require('../../../common/utils/subscribe');

const ACTIVE_STATUSES = ['pending_payment', 'pending', 'confirmed', 'reminded', 'checked_in'];

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

function readString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function getPaymentErrorMessage(error, canceledText) {
  if (error && error.errMsg) {
    return canceledText;
  }
  if (error && error.message) {
    return error.message;
  }
  return '发起支付失败';
}

async function syncPaidAppointment(appointmentId) {
  if (!appointmentId) return;
  await api.confirmAppointmentPayment(appointmentId);
}

function normalizeAppointment(appointment, stores, doctors) {
  const store = stores.find((item) => String(item.id) === String(appointment.storeId || appointment.store_id)) || null;
  const doctor = doctors.find((item) => String(item.id) === String(appointment.doctorId || appointment.doctor_id)) || null;
  return {
    ...appointment,
    id: readString(appointment.id),
    appointmentNo: appointment.appointmentNo || appointment.appointment_no || ('APT' + readString(appointment.id)),
    appointmentDate: appointment.appointmentDate || appointment.appointment_date || '',
    appointmentTime: appointment.appointmentTime || appointment.appointment_time || '',
    patientName: appointment.patientName || appointment.patient_name || '',
    storeId: appointment.storeId || appointment.store_id || '',
    doctorId: appointment.doctorId || appointment.doctor_id || '',
    storeName: appointment.storeName || appointment.store_name || (store ? store.name || store.storeName || '' : ''),
    doctorName: appointment.doctorName || appointment.doctor_name || (doctor ? doctor.name || '' : ''),
    symptomDesc: appointment.symptomDesc || appointment.symptom_desc || '',
    type: appointment.type || '',
    status: appointment.status || 'pending',
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    isLoggedIn: false,
    currentTab: 'upcoming',
    bookingNotice: '选择门店、医生和时段，轻松完成预约',
    cancelLimitHours: 2,
    upcomingAppointments: [],
    historyAppointments: [],
  },

  onLoad(options) {
    this.options = options || {};
    if (options && options.tab === 'history') {
      this.setData({ currentTab: 'history' });
      return;
    }
    if (options && options.tab === 'mine') {
      this.setData({ currentTab: 'upcoming' });
    }
  },

  onShow() {
    if (wx.requestSubscribeMessage) void subscribe.refreshSubscribeSettings();
    this.loadPage({ silent: this.data.hasLoaded });
  },

  onUnload() {
    this._unloaded = true;
    this.listRequestId = (this.listRequestId || 0) + 1;
  },

  async onPullDownRefresh() {
    try {
      await this.loadPage({ silent: this.data.hasLoaded });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadPage(options = {}) {
    const requestId = this.listRequestId = (this.listRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => requestId === this.listRequestId && generation === sessionStore.getLoginGeneration();
    const showSignedOut = () => {
      if (this._unloaded || requestId !== this.listRequestId || sessionStore.isLoggedIn()) return;
      this.setData({ isLoggedIn: false, loading: false, hasLoaded: true, loadError: '',
        upcomingAppointments: [], historyAppointments: [] });
    };
    const silent = !!options.silent;
    const isLoggedIn = sessionStore.isLoggedIn();
    const nextState = { isLoggedIn };
    if (!silent || !isLoggedIn || this.listOwnerGeneration !== generation) {
      nextState.loading = true;
      nextState.loadError = '';
      nextState.upcomingAppointments = [];
      nextState.historyAppointments = [];
      nextState.hasLoaded = false;
    }
    if (this.listOwnerGeneration !== generation) nextState.cancelLimitHours = 2;
    this.listOwnerGeneration = generation;
    this.setData(nextState);

    if (this.catalogOwner !== generation) {
      this.catalogOwner = generation;
      this.storeCatalog = [];
      this.doctorCatalog = [];
    }
    this.cancelSettingsReady = false;
    let appointments;
    const publishAppointments = () => {
      if (!appointments || !isCurrent() || !sessionStore.isLoggedIn()) return;
      const list = appointments.map((item) => normalizeAppointment(item, this.storeCatalog, this.doctorCatalog));
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: '',
        upcomingAppointments: list.filter((item) => ACTIVE_STATUSES.includes(item.status)),
        historyAppointments: list.filter((item) => !ACTIVE_STATUSES.includes(item.status)),
      });
    };
    const enrich = (request, apply) => Promise.resolve().then(request).then((response) => {
      if (!isCurrent()) return;
      apply(response);
    }).catch(() => {});
    enrich(() => api.getStores(), (response) => { this.storeCatalog = unwrapList(response); publishAppointments(); });
    enrich(() => api.getDoctors(), (response) => { this.doctorCatalog = unwrapList(response); publishAppointments(); });
    enrich(() => api.getBookingSettings(), (response) => {
      const settings = unwrapObject(response);
      this.cancelSettingsReady = true;
      this.setData({
        bookingNotice: settings.notice || settings.bookingNotice || '选择门店、医生和时段，轻松完成预约',
        cancelLimitHours: getCancelLimitHours(settings) || 2,
      });
    });

    if (!isLoggedIn) {
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: '',
        upcomingAppointments: [],
        historyAppointments: [],
      });
      return;
    }

    try {
      const appointmentsResponse = await api.getAppointments();
      if (!isCurrent() || !sessionStore.isLoggedIn()) { showSignedOut(); return; }
      appointments = unwrapList(appointmentsResponse);
      publishAppointments();
    } catch (error) {
      if (!isCurrent()) { showSignedOut(); return; }
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载预约失败',
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '预约列表刷新失败，请下拉重试', icon: 'none' });
      }
      console.error('加载预约失败', error);
    }
  },

  switchToUpcoming() {
    this.setData({ currentTab: 'upcoming' });
  },

  switchToHistory() {
    this.setData({ currentTab: 'history' });
  },

  startAppointment() {
    navigation.openPage('/pages/appointment/store-select');
  },

  goToLoginForAppointment() {
    navigation.openPage('/pages/appointment/store-select');
  },

  openDetail(event) {
    const detail = event.detail || {};
    const appointmentId = readString(detail.id || (event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.appointmentId));
    if (!appointmentId) {
      return;
    }
    navigation.openPage('/pages/appointment/detail?id=' + appointmentId);
  },

  async cancelAppointment(event) {
    const appointment = event.detail || {};
    if (!appointment.id) {
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    if (!isCurrent() || this.cancelFlight?.generation === generation) return;

    const canCancelNow = () => {
      const latest = this.data.upcomingAppointments.find((item) => item.id === String(appointment.id));
      if (!latest || !['pending_payment', 'pending', 'confirmed'].includes(latest.status)) {
        wx.showToast({ title: '当前预约状态不支持取消', icon: 'none' });
        return false;
      }
      if (latest.status !== 'pending_payment' && !this.cancelSettingsReady) {
        wx.showToast({ title: '取消规则暂未加载，请下拉刷新后重试', icon: 'none' });
        return false;
      }
      const appointmentTimestamp = parseAppointmentTimestamp(latest.appointmentDate, latest.appointmentTime);
      if (appointmentTimestamp !== null && latest.status !== 'pending_payment' &&
          appointmentTimestamp - Date.now() < this.data.cancelLimitHours * 60 * 60 * 1000) {
        wx.showToast({
          title: '距离预约时间已不足' + this.data.cancelLimitHours + '小时，不支持取消预约',
          icon: 'none',
        });
        return false;
      }
      return true;
    };
    if (!canCancelNow()) return;

    const flight = { generation };
    this.cancelFlight = flight;
    const release = () => {
      if (this.cancelFlight === flight) this.cancelFlight = null;
    };
    wx.showModal({
      title: '取消预约',
      content: '确定要取消这次预约吗？',
      success: async (result) => {
        if (this.cancelFlight !== flight || flight.handled) return;
        flight.handled = true;
        try {
          if (!result.confirm || !isCurrent() || !canCancelNow()) return;
          wx.showLoading({ title: '取消中...' });
          await api.cancelAppointment(appointment.id);
          wx.hideLoading();
          if (!isCurrent()) return;
          wx.showToast({ title: '已取消预约', icon: 'success' });
          await this.loadPage({ silent: false });
        } catch (error) {
          wx.hideLoading();
          if (!isCurrent()) return;
          wx.showToast({ title: (error && error.message) || '取消预约失败', icon: 'none' });
        } finally {
          release();
        }
      },
      fail: release,
    });
  },

  async handlePrimaryAction(event) {
    const appointment = event.detail || {};
    if (!appointment.id) {
      return;
    }

    if (appointment.status === 'pending_payment') {
      if (appointment.appointmentCharge?.canPay === false) {
        wx.showToast({ title: '当前收费单不可支付', icon: 'none' });
        return;
      }
      const generation = sessionStore.getLoginGeneration();
      if (this.paymentFlight && this.paymentFlight.generation === generation) return;
      const releasePayment = paymentReceipt.acquire(appointment.id);
      if (!releasePayment) return;
      const flight = { generation };
      this.paymentFlight = flight;
      this.appointmentPaymentInProgress = true;
      const isCurrent = () => !this._unloaded && this.paymentFlight === flight &&
        generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
      let feedback;
      try {
        if (!isCurrent()) return;
        wx.showLoading({ title: '拉起支付中...' });
        let alreadyPaid = false;
        let acceptedTemplateId;
        if (!paymentReceipt.hasSubmitted(appointment.id)) {
          const paymentResponse = await paymentReceipt.preparePayment(api, appointment.id, isCurrent);
          if (!isCurrent()) return;
          const paymentResult = unwrapObject(paymentResponse);
          wx.hideLoading();
          alreadyPaid = paymentResult.alreadyPaid === true;
          if (!alreadyPaid) {
            acceptedTemplateId = await paymentReceipt.requestPayment(api, appointment.id, paymentResult, () => {
              paymentReceipt.markSubmitted(appointment.id);
              if (wx.requestSubscribeMessage && isCurrent()) return subscribe.requestVisitReminderAuthorization();
            });
          }
        }
        if (!isCurrent()) return;
        wx.showLoading({ title: '确认支付中...' });

        if (!alreadyPaid) await syncPaidAppointment(appointment.id);
        if (!isCurrent()) return;
        wx.hideLoading();
        if (acceptedTemplateId) await subscribe.recordAcceptedVisitReminder(appointment.id, acceptedTemplateId, isCurrent);
        if (!isCurrent()) return;
        await this.loadPage({ silent: false });
        feedback = { title: '支付成功', icon: 'success', duration: 2000 };
      } catch (error) {
        feedback = { title: getPaymentErrorMessage(error, '支付未完成'), icon: 'none', duration: 3500 };
      } finally {
        releasePayment();
        if (this.paymentFlight === flight) {
          const canShowFeedback = isCurrent();
          wx.hideLoading();
          this.paymentFlight = null;
          this.appointmentPaymentInProgress = false;
          if (feedback && canShowFeedback) wx.showToast(feedback);
        }
      }
      return;
    }

    const appointmentTimestamp = parseAppointmentTimestamp(appointment.appointmentDate, appointment.appointmentTime);
    const cutoffHours = RESCHEDULE_LIMIT_HOURS;
    if (appointmentTimestamp !== null && appointmentTimestamp - Date.now() < cutoffHours * 60 * 60 * 1000) {
      wx.showToast({
        title: '距离预约时间已不足' + cutoffHours + '小时，不支持改约',
        icon: 'none',
      });
      return;
    }

    navigation.openPage('/pages/appointment/reschedule?id=' + appointment.id);
  },
});
