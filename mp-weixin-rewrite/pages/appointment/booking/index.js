const api = require('../../../api/index');
const navigation = require('../../../common/utils/navigation');
const sessionStore = require('../../../stores/session-store');

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

function parseAppointmentTimestamp(appointment) {
  try {
    const dateText = readString(appointment.appointmentDate);
    const timeText = readString(appointment.appointmentTime).split('-')[0].trim();
    if (!dateText || !timeText) {
      return null;
    }
    const [year, month, day] = dateText.split('-').map(Number);
    const [hours, minutes] = timeText.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes || 0, 0).getTime();
  } catch (error) {
    return null;
  }
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
    this.loadPage({ silent: this.data.hasLoaded });
  },

  async onPullDownRefresh() {
    await this.loadPage({ silent: false });
    wx.stopPullDownRefresh();
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    const isLoggedIn = sessionStore.isLoggedIn();
    const nextState = { isLoggedIn };
    if (!silent) {
      nextState.loading = true;
      nextState.loadError = '';
      nextState.upcomingAppointments = [];
      nextState.historyAppointments = [];
    }
    this.setData(nextState);

    const [storesResult, doctorsResult, settingsResult] = await Promise.allSettled([
      api.getStores(),
      api.getDoctors(),
      api.getBookingSettings(),
    ]);

    const stores = storesResult.status === 'fulfilled' ? unwrapList(storesResult.value) : [];
    const doctors = doctorsResult.status === 'fulfilled' ? unwrapList(doctorsResult.value) : [];
    const bookingSettings = settingsResult.status === 'fulfilled' ? unwrapObject(settingsResult.value) : {};
    const cancelLimitHours = Number(bookingSettings.cancelLimitHours || bookingSettings.cancel_limit_hours || 2);

    this.setData({
      bookingNotice: bookingSettings.notice || bookingSettings.bookingNotice || '选择门店、医生和时段，轻松完成预约',
      cancelLimitHours: cancelLimitHours > 0 ? cancelLimitHours : 2,
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
      const appointmentList = unwrapList(appointmentsResponse).map((appointment) => normalizeAppointment(appointment, stores, doctors));
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: '',
        upcomingAppointments: appointmentList.filter((appointment) => ACTIVE_STATUSES.includes(appointment.status)),
        historyAppointments: appointmentList.filter((appointment) => !ACTIVE_STATUSES.includes(appointment.status)),
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载预约失败',
        });
      } else {
        this.setData({ loading: false });
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

    const appointmentTimestamp = parseAppointmentTimestamp(appointment);
    if (appointmentTimestamp && appointment.status !== 'pending_payment') {
      const hoursGap = (appointmentTimestamp - Date.now()) / (60 * 60 * 1000);
      if (hoursGap < this.data.cancelLimitHours) {
        wx.showToast({
          title: '距离预约时间已不足' + this.data.cancelLimitHours + '小时，不支持取消预约',
          icon: 'none',
        });
        return;
      }
    }

    wx.showModal({
      title: '取消预约',
      content: '确定要取消这次预约吗？',
      success: async (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: '取消中...' });
        try {
          await api.cancelAppointment(appointment.id);
          wx.hideLoading();
          wx.showToast({ title: '已取消预约', icon: 'success' });
          await this.loadPage({ silent: false });
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: (error && error.message) || '取消预约失败', icon: 'none' });
        }
      },
    });
  },

  async handlePrimaryAction(event) {
    const appointment = event.detail || {};
    if (!appointment.id) {
      return;
    }

    if (appointment.status === 'pending_payment') {
      wx.showLoading({ title: '拉起支付中...' });
      try {
        const paymentResult = await api.payAppointment(appointment.id);
        wx.hideLoading();
        await wx.requestPayment({
          ...paymentResult,
          success: async () => {
            wx.showLoading({ title: '确认支付中...' });
            try {
              await syncPaidAppointment(appointment.id);
              wx.hideLoading();
              wx.showToast({ title: '支付成功', icon: 'success' });
              await this.loadPage({ silent: false });
            } catch (error) {
              wx.hideLoading();
              wx.showToast({ title: (error && error.message) || '同步支付结果失败', icon: 'none' });
            }
          },
          fail: (error) => {
            wx.showToast({ title: getPaymentErrorMessage(error, '支付未完成'), icon: 'none' });
          },
        });
      } catch (error) {
        wx.hideLoading();
        wx.showToast({ title: (error && error.message) || '发起支付失败', icon: 'none' });
      }
      return;
    }

    navigation.openPage('/pages/appointment/reschedule?id=' + appointment.id);
  },
});
