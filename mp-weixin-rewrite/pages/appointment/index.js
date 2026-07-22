const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');

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
    isLoggedIn: false,
    currentTab: 'upcoming',
    bookingNotice: '选择门店、医生和时段，轻松完成预约',
    cancelLimitHours: 2,
    upcomingAppointments: [],
    historyAppointments: [],
  },

  onShow() {
    this.loadPage();
  },

  async onPullDownRefresh() {
    await this.loadPage();
    wx.stopPullDownRefresh();
  },

  async loadPage() {
    const isLoggedIn = sessionStore.isLoggedIn();
    this.setData({
      loading: true,
      isLoggedIn,
      upcomingAppointments: [],
      historyAppointments: [],
    });

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
      this.setData({ loading: false });
      return;
    }

    try {
      const appointmentsResponse = await api.getAppointments();
      const appointmentList = unwrapList(appointmentsResponse).map((appointment) => normalizeAppointment(appointment, stores, doctors));
      this.setData({
        loading: false,
        upcomingAppointments: appointmentList.filter((appointment) => ACTIVE_STATUSES.includes(appointment.status)),
        historyAppointments: appointmentList.filter((appointment) => !ACTIVE_STATUSES.includes(appointment.status)),
      });
    } catch (error) {
      this.setData({ loading: false });
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
        if (!result.confirm) {
          return;
        }
        try {
          await api.cancelAppointment(appointment.id, '用户主动取消');
          wx.showToast({ title: '已取消', icon: 'success' });
          await this.loadPage();
        } catch (error) {
          wx.showToast({ title: '取消失败', icon: 'error' });
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
      wx.showLoading({ title: '发起支付...' });
      try {
        const payResponse = await api.payAppointmentDeposit(appointment.id);
        const payParams = unwrapObject(payResponse);
        wx.hideLoading();
        if (payParams.mockPayment) {
          wx.showLoading({ title: '开发环境模拟支付...' });
          await api.confirmAppointmentPayment(appointment.id);
          wx.hideLoading();
        } else {
          await this.requestWxPay(payParams);
        }
        wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
        await this.loadPage();
      } catch (error) {
        wx.hideLoading();
        wx.showToast({ title: error && error.errMsg ? '已取消支付' : '发起支付失败，请稍后重试', icon: 'none' });
      }
      return;
    }

    const appointmentTimestamp = parseAppointmentTimestamp(appointment);
    if (appointmentTimestamp) {
      const hoursGap = (appointmentTimestamp - Date.now()) / (60 * 60 * 1000);
      if (hoursGap < this.data.cancelLimitHours) {
        wx.showToast({
          title: '距离预约时间已不足' + this.data.cancelLimitHours + '小时，不支持修改就诊时间',
          icon: 'none',
        });
        return;
      }
    }

    navigation.openPage('/pages/appointment/reschedule?id=' + appointment.id + '&doctorId=' + readString(appointment.doctorId) + '&storeId=' + readString(appointment.storeId));
  },

  requestWxPay(payParams) {
    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign,
        success: resolve,
        fail: reject,
      });
    });
  },

  async onGetPhoneNumber(event) {
    const detail = event.detail || {};
    if (!detail.code) {
      wx.showToast({ title: '授权已取消', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全登录中...' });
    try {
      await sessionStore.login(detail.code);
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.startAppointment();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      console.error(error);
    }
  },
});
