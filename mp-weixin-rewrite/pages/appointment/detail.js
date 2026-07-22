const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');

const APPOINTMENT_STATUS_MAP = {
  pending_payment: '待支付',
  pending: '已预约',
  confirmed: '候诊中',
  reminded: '候诊中',
  checked_in: '就诊中',
  completed: '已完成',
  arrived: '已到店',
  cancelled: '已取消',
  no_show: '未到诊',
};

const APPOINTMENT_TYPE_MAP = {
  first: '初诊',
  first_visit: '初诊',
  follow_up: '复诊',
  review: '复查',
  consultation: '问诊',
  treatment: '治疗',
};

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function parseAppointmentTimestamp(dateText, timeText) {
  try {
    if (!dateText || !timeText) {
      return null;
    }
    const [year, month, day] = String(dateText).split('-').map(Number);
    const [hour, minute] = String(timeText).split('-')[0].trim().split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute || 0, 0).getTime();
  } catch (error) {
    return null;
  }
}

function hasPreExamData(preExam) {
  if (!preExam) {
    return false;
  }
  return ['height', 'weight', 'systolicBp', 'diastolicBp', 'neckCircumference', 'bmi'].some((key) => {
    const value = preExam[key];
    return value !== null && value !== undefined && value !== '';
  });
}

function requestWxPay(payParams) {
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
}

Page({
  data: {
    appointmentLoaded: false,
    loadError: '',
    appointmentId: '',
    doctorId: '',
    storeId: '',
    statusKey: '',
    statusLabel: '',
    appointmentNo: '',
    doctorAvatar: '医',
    doctorName: '',
    doctorTitle: '',
    doctorDept: '',
    doctorExpertise: [],
    appointmentDate: '',
    appointmentTime: '',
    patientName: '',
    storeName: '',
    storeAddress: '',
    appointmentTypeLabel: '',
    symptomDesc: '',
    cancelReason: '',
    requireDeposit: false,
    depositAmountLabel: '',
    consultFeeLabel: '',
    canCancel: false,
    canPay: false,
    canCancelOrReschedule: false,
    showLimitNotice: false,
    showRescheduleCancelFooter: false,
    showRebookFooter: false,
    cancelLimitText: '就诊前2小时',
    latitude: '',
    longitude: '',
    assessmentInfo: null,
    preExam: null,
    hasPreExam: false,
    evaluation: null,
    evalRating: 5,
    evalContent: '',
    ratingStars: [1, 2, 3, 4, 5],
    medicalRecord: null,
    treatmentRecord: null,
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const appointmentId = String((this.options && this.options.id) || this.data.appointmentId || '');
    if (!appointmentId) {
      this.setData({
        appointmentLoaded: false,
        loadError: '缺少预约编号',
      });
      return;
    }

    try {
      const [detailResponse, bookingSettingsResponse] = await Promise.all([
        api.getAppointmentDetail(appointmentId),
        api.getBookingSettings(),
      ]);
      const detail = unwrapObject(detailResponse);
      const appointment = detail.appointment || {};
      const store = detail.store || {};
      const doctor = detail.doctor || {};
      const bookingSettings = unwrapObject(bookingSettingsResponse) || {};
      const cancelLimitText = bookingSettings.cancelLimit || '就诊前2小时';
      const cancelLimitHours = Number(bookingSettings.cancelLimitHours || bookingSettings.cancel_limit_hours || 2);
      const appointmentTimestamp = parseAppointmentTimestamp(appointment.appointmentDate, appointment.appointmentTime);
      const isFinishedStatus = ['arrived', 'cancelled', 'no_show', 'completed'].includes(appointment.status);
      const canCancelOrReschedule =
        appointment.status === 'pending_payment' ||
        (appointmentTimestamp !== null && appointmentTimestamp - Date.now() >= (cancelLimitHours > 0 ? cancelLimitHours : 2) * 60 * 60 * 1000);

      this.cancelLimitHours = cancelLimitHours > 0 ? cancelLimitHours : 2;

      const doctorExperience = doctor.experienceYears || doctor.experience || 0;
      const doctorDept = doctor
        ? (doctor.specialty || '') + (doctorExperience ? ' · ' + doctorExperience + '年经验' : '')
        : '';
      const doctorExpertise = Array.isArray(doctor.expertise)
        ? doctor.expertise
        : String(doctor.expertise || doctor.specialty || '')
            .split(/[、,，]/)
            .map((item) => item.trim())
            .filter(Boolean);

      this.setData({
        appointmentLoaded: true,
        loadError: '',
        appointmentId,
        doctorId: appointment.doctorId || appointment.doctor_id || '',
        storeId: appointment.storeId || appointment.store_id || '',
        statusKey: appointment.status || '',
        statusLabel: APPOINTMENT_STATUS_MAP[appointment.status] || '预约详情',
        appointmentNo: appointment.appointmentNo || '',
        doctorAvatar: doctor.name ? doctor.name.slice(0, 1) : '医',
        doctorName: doctor.name || '',
        doctorTitle: doctor.title || '',
        doctorDept,
        doctorExpertise,
        appointmentDate: appointment.appointmentDate || '',
        appointmentTime: appointment.appointmentTime || '',
        patientName: appointment.patientName || '--',
        storeName: store.name || '',
        storeAddress: store.address || '',
        appointmentTypeLabel: APPOINTMENT_TYPE_MAP[appointment.type] || appointment.type || '',
        symptomDesc: appointment.symptomDesc || '',
        cancelReason: appointment.cancelReason || '',
        requireDeposit: Boolean(appointment.requireDeposit),
        depositAmountLabel: appointment.requireDeposit ? '¥' + (Number(appointment.depositAmount || 0) / 100).toFixed(2) : '',
        consultFeeLabel: appointment.consultFee ? '¥' + (Number(appointment.consultFee || 0) / 100).toFixed(2) : '',
        canCancel: ['pending_payment', 'pending', 'confirmed', 'reminded'].includes(appointment.status),
        canPay: appointment.status === 'pending_payment',
        canCancelOrReschedule,
        showLimitNotice:
          !isFinishedStatus &&
          !['confirmed', 'reminded', 'checked_in'].includes(appointment.status) &&
          !canCancelOrReschedule,
        showRescheduleCancelFooter:
          !['pending_payment', 'arrived', 'cancelled', 'no_show', 'completed'].includes(appointment.status) &&
          canCancelOrReschedule,
        showRebookFooter: isFinishedStatus,
        cancelLimitText,
        latitude: store.latitude || '',
        longitude: store.longitude || '',
        assessmentInfo: detail.assessments || null,
        preExam: detail.preExam || null,
        hasPreExam: hasPreExamData(detail.preExam),
        evaluation: detail.evaluation || null,
        evalRating: detail.evaluation && detail.evaluation.rating ? Number(detail.evaluation.rating) : 5,
        evalContent: detail.evaluation && detail.evaluation.content ? detail.evaluation.content : '',
        medicalRecord: detail.medicalRecord || null,
        treatmentRecord: detail.treatmentRecord || null,
      });
    } catch (error) {
      this.setData({
        appointmentLoaded: false,
        loadError: (error && error.message) || '加载预约详情失败',
      });
    }
  },

  copyAppointmentNo() {
    if (!this.data.appointmentNo) {
      return;
    }
    wx.setClipboardData({
      data: this.data.appointmentNo,
      success: () => {
        wx.showToast({ title: '复制成功', icon: 'success' });
      },
    });
  },

  async payDeposit() {
    wx.showLoading({ title: '发起支付...' });
    try {
      const payResponse = await api.payAppointmentDeposit(this.data.appointmentId);
      const payParams = unwrapObject(payResponse);
      wx.hideLoading();
      if (payParams.mockPayment) {
        wx.showLoading({ title: '开发环境模拟支付...' });
        await api.confirmAppointmentPayment(this.data.appointmentId);
        wx.hideLoading();
      } else {
        await requestWxPay(payParams);
      }
      wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: error && error.errMsg ? '支付未完成，可稍后继续支付' : '发起支付失败，请稍后重试',
        icon: 'none',
      });
    }
  },

  async cancelAppointment() {
    const appointmentTimestamp = parseAppointmentTimestamp(this.data.appointmentDate, this.data.appointmentTime);
    if (appointmentTimestamp && this.data.statusKey !== 'pending_payment') {
      const diff = appointmentTimestamp - Date.now();
      if (diff < this.cancelLimitHours * 60 * 60 * 1000) {
        wx.showToast({
          title: '已超过取消截止时间（' + this.data.cancelLimitText + '）',
          icon: 'none',
        });
        return;
      }
    }

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '取消预约',
        content: '确定要取消这次预约吗？',
        success: resolve,
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!result.confirm) {
      return;
    }

    try {
      await api.cancelAppointment(this.data.appointmentId, '用户主动取消');
      wx.showToast({ title: '已取消', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      wx.showToast({ title: '取消失败', icon: 'none' });
    }
  },

  openReschedule() {
    if (['arrived', 'cancelled', 'no_show', 'completed'].includes(this.data.statusKey)) {
      navigation.openPage('/pages/appointment/store-select');
      return;
    }

    const appointmentTimestamp = parseAppointmentTimestamp(this.data.appointmentDate, this.data.appointmentTime);
    if (appointmentTimestamp && appointmentTimestamp - Date.now() < this.cancelLimitHours * 60 * 60 * 1000) {
      wx.showToast({
        title: '已超过改约截止时间（' + this.data.cancelLimitText + '）',
        icon: 'none',
      });
      return;
    }

    navigation.openPage(
      '/pages/appointment/reschedule?id=' +
        this.data.appointmentId +
        '&doctorId=' +
        encodeURIComponent(this.data.doctorId || '') +
        '&storeId=' +
        encodeURIComponent(this.data.storeId || '')
    );
  },

  openMap() {
    if (!this.data.latitude || !this.data.longitude) {
      wx.showToast({ title: '未配置位置信息', icon: 'none' });
      return;
    }
    navigation.openPage(
      '/pages/appointment/map?latitude=' +
        encodeURIComponent(this.data.latitude) +
        '&longitude=' +
        encodeURIComponent(this.data.longitude) +
        '&name=' +
        encodeURIComponent(this.data.storeName) +
        '&address=' +
        encodeURIComponent(this.data.storeAddress)
    );
  },

  onEvalRatingChange(event) {
    this.setData({
      evalRating: Number(event.currentTarget.dataset.rating || 5),
    });
  },

  onEvalContentInput(event) {
    this.setData({
      evalContent: event.detail.value || '',
    });
  },

  async submitEvaluation() {
    if (!this.data.appointmentId) {
      return;
    }
    try {
      await api.submitAppointmentEvaluation(this.data.appointmentId, {
        rating: this.data.evalRating,
        content: this.data.evalContent,
      });
      wx.showToast({ title: '评价已提交', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || '评价失败',
        icon: 'none',
      });
    }
  },
});
