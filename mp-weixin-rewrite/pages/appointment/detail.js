const paymentReceipt = require('../../common/utils/appointment-payment-receipt');
const { parseAppointmentTimestamp, RESCHEDULE_LIMIT_HOURS, getCancelLimitHours } = require('../../common/utils/appointment-time');

const chargeStatusLabels = {
  pending: '待支付', paid: '已支付', refund_waived:'无需退款', refund_pending: '退款待处理',
  refunding: '退款中', refunded: '已退款', cancelled: '已取消',
};
function chargeDisplay(charge) {
  if (!charge || !chargeStatusLabels[charge.status]) return null;
  return {
    chargeNo: charge.chargeNo || '',
    amount: '¥' + (Number(charge.amount || 0) / 100).toFixed(2),
    refundedAmount: Number(charge.refundedAmount) > 0
      ? '¥' + (Number(charge.refundedAmount) / 100).toFixed(2) : '',
    status: ['abnormal', 'closed'].includes(charge.refundStatus) ? '退款待门店核实' : chargeStatusLabels[charge.status],
  };
}

const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');
const subscribe = require('../../common/utils/subscribe');
const { getStoreCoverUrl, normalizeImageUrl } = require('../../common/utils/image-url');

const APPOINTMENT_STATUS_MAP = {
  pending_payment: '待支付',
  pending: '已预约',
  confirmed: '候诊中',
  reminded: '候诊中',
  checked_in: '就诊中',
  completed: '已完成',
  arrived: '已到店',
  cancelled: '已取消',
  refunded: '已退款',
  no_show: '未到诊',
};

const APPOINTMENT_TYPE_MAP = {
  first: '初诊',
  followup: '复诊',
  adjust: '调整',
};

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
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

function requestWxPay(payParams, onPaid) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: () => resolve(onPaid()),
      fail: reject,
    });
  });
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

Page({
  data: {
    appointmentLoaded: false,
    loadError: '',
    canRetryLoad: false,
    appointmentId: '',
    doctorId: '',
    storeId: '',
    statusKey: '',
    statusLabel: '',
    appointmentNo: '',
    doctorAvatar: '医',
    doctorAvatarUrl: '',
    doctorAvatarLoaded: false,
    doctorName: '',
    doctorTitle: '',
    doctorDept: '',
    doctorExpertise: [],
    appointmentDate: '',
    appointmentTime: '',
    patientName: '',
    storeName: '',
    storeAddress: '',
    storeCoverUrl: '',
    storeCoverLoaded: false,
    appointmentTypeLabel: '',
    symptomDesc: '',
    cancelReason: '',
    requireDeposit: false,
    depositAmountLabel: '',
    consultFeeLabel: '',
    canCancel: false,
    canReschedule: false,
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
    evaluationSubmitting: false,
    ratingStars: [1, 2, 3, 4, 5],
    medicalRecord: null,
    treatmentRecord: null,
    canRequestVisitReminderOnPayment: false,
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoadedOnce = false;
    this.loadPage({ silent: false });
  },

  async onShow() {
    subscribe.refreshSubscribeSettings();
    if (!this.hasLoadedOnce) {
      return;
    }
    await this.loadPage({ silent: true });
  },

  onUnload() {
    this._unloaded = true;
    this.detailRequestId = (this.detailRequestId || 0) + 1;
  },

  retryLoad() {
    if (!this.data.canRetryLoad) return;
    this.setData({ canRetryLoad: false, loadError: '' });
    return this.loadPage();
  },

  clearPrivateDetail() {
    this.setData({ appointmentLoaded: false, canRetryLoad: false, patientName: '', assessmentInfo: null,
      preExam: null, medicalRecord: null, treatmentRecord: null, evaluation: null, canRequestVisitReminderOnPayment: false });
  },

  async loadPage(options) {
    const requestId = this.detailRequestId = (this.detailRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && requestId === this.detailRequestId &&
      generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    const hideSignedOutDetail = () => {
      if (!this._unloaded && requestId === this.detailRequestId && !sessionStore.isLoggedIn()) {
        this.clearPrivateDetail();
        this.setData({ loadError: '请先登录后查看预约详情' });
      }
    };
    const silent = Boolean(options && options.silent);
    if (this.detailOwnerGeneration !== generation || !sessionStore.isLoggedIn()) {
      this.submittedEvaluation = null;
      this.cancelLimitHours = undefined;
      this.clearPrivateDetail();
    }
    this.detailOwnerGeneration = generation;
    if (!sessionStore.isLoggedIn()) {
      this.setData({ loadError: '请先登录后查看预约详情' });
      return;
    }
    const appointmentId = String((this.options && this.options.id) || this.data.appointmentId || '');
    if (!appointmentId) {
      this.setData({
        appointmentLoaded: false,
        loadError: '缺少预约编号',
      });
      return;
    }

    this.setData({ canRetryLoad: false });
    try {
      const [detailResponse, bookingSettingsResponse] = await Promise.all([
        api.getAppointmentDetail(appointmentId),
        api.getBookingSettings().catch(() => null),
      ]);
      if (!isCurrent()) { hideSignedOutDetail(); return; }
      const detail = unwrapObject(detailResponse);
      const submitted = this.submittedEvaluation;
      const evaluation = detail.evaluation ||
        (submitted?.appointmentId === appointmentId ? submitted.evaluation : null);
      const appointment = detail.appointment || {};
      const store = detail.store || {};
      const doctor = detail.doctor || {};
      const bookingSettings = unwrapObject(bookingSettingsResponse) || {};
      const cancelLimitHours = bookingSettingsResponse === null
        ? this.cancelLimitHours || 2
        : getCancelLimitHours(bookingSettings);
      this.cancelLimitHours = cancelLimitHours > 0 ? cancelLimitHours : 2;
      const cancelLimitText = bookingSettings.cancelLimit || '就诊前' + this.cancelLimitHours + '小时';
      const appointmentTimestamp = parseAppointmentTimestamp(appointment.appointmentDate, appointment.appointmentTime);
      const isFinishedStatus = ['arrived', 'cancelled', 'no_show', 'completed'].includes(appointment.status);
      const canCancelOrReschedule =
        appointment.status === 'pending_payment' ||
        (appointmentTimestamp !== null && appointmentTimestamp - Date.now() >= (cancelLimitHours > 0 ? cancelLimitHours : 2) * 60 * 60 * 1000);

      const canReschedule = ['pending', 'confirmed'].includes(appointment.status) && appointmentTimestamp !== null &&
        appointmentTimestamp - Date.now() >= RESCHEDULE_LIMIT_HOURS * 60 * 60 * 1000;
      const canCancel = ['pending_payment', 'pending', 'confirmed'].includes(appointment.status);
      const showCancel = canCancel && canCancelOrReschedule;

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

      const nextDoctorAvatarUrl = normalizeImageUrl(
        doctor.avatarUrl || doctor.avatar || doctor.avatar_url || appointment.doctorAvatar || appointment.doctor_avatar
      );
      const nextStoreCoverUrl = getStoreCoverUrl(store || appointment);

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
        doctorAvatarUrl: nextDoctorAvatarUrl,
        doctorAvatarLoaded: silent && nextDoctorAvatarUrl === this.data.doctorAvatarUrl ? this.data.doctorAvatarLoaded : false,
        doctorName: doctor.name || '',
        doctorTitle: doctor.title || '',
        doctorDept,
        doctorExpertise,
        appointmentDate: appointment.appointmentDate || '',
        appointmentTime: appointment.appointmentTime || '',
        patientName: appointment.patientName || '--',
        storeName: store.name || '',
        storeAddress: store.address || '',
        storeCoverUrl: nextStoreCoverUrl,
        storeCoverLoaded: silent && nextStoreCoverUrl === this.data.storeCoverUrl ? this.data.storeCoverLoaded : false,
        appointmentTypeLabel: APPOINTMENT_TYPE_MAP[String(appointment.type || '').trim()] || '门诊预约',
        symptomDesc: appointment.symptomDesc || '',
        cancelReason: appointment.cancelReason || '',
        requireDeposit: Boolean(appointment.requireDeposit),
        depositAmountLabel: appointment.requireDeposit ? '¥' + (Number(appointment.depositAmount || 0) / 100).toFixed(2) : '',
        consultFeeLabel: appointment.consultFee ? '¥' + (Number(appointment.consultFee || 0) / 100).toFixed(2) : '',
        canCancel,
        appointmentCharge: chargeDisplay(appointment.appointmentCharge),
        canPay: appointment.status === 'pending_payment' && appointment.appointmentCharge?.canPay !== false,
        canRequestVisitReminderOnPayment: appointment.canSubscribeVisitReminder === true,
        canCancelOrReschedule,
        canReschedule,
        showLimitNotice:
          !isFinishedStatus &&
          !['confirmed', 'reminded', 'checked_in', 'refunded'].includes(appointment.status) &&
          !canCancelOrReschedule,
        showRescheduleCancelFooter: showCancel || canReschedule,
        showRebookFooter: isFinishedStatus,
        cancelLimitText,
        latitude: store.latitude || '',
        longitude: store.longitude || '',
        assessmentInfo: detail.assessments || null,
        preExam: detail.preExam || null,
        hasPreExam: hasPreExamData(detail.preExam),
        evaluation,
        evalRating: evaluation?.rating ? Number(evaluation.rating) : 5,
        evalContent: evaluation?.content || '',
        medicalRecord: detail.medicalRecord || null,
        treatmentRecord: detail.treatmentRecord || null,
      });
      this.hasLoadedOnce = true;
    } catch (error) {
      if (!isCurrent()) { hideSignedOutDetail(); return; }
      const keepDetail = silent && this.data.appointmentLoaded;
      if (keepDetail) wx.showToast({ title: '预约详情刷新失败', icon: 'none' });
      this.setData({
        appointmentLoaded: keepDetail,
        canRetryLoad: !keepDetail,
        loadError: (error && error.message) || '加载预约详情失败',
      });
    }
  },

  handleDoctorAvatarLoad() {
    if (this.data.doctorAvatarUrl) {
      this.setData({ doctorAvatarLoaded: true });
    }
  },

  handleDoctorAvatarError() {
    this.setData({ doctorAvatarLoaded: false });
  },

  handleStoreCoverLoad() {
    if (this.data.storeCoverUrl) {
      this.setData({ storeCoverLoaded: true });
    }
  },

  handleStoreCoverError() {
    this.setData({ storeCoverLoaded: false });
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
    if (!this.data.canPay) return;
    const generation = sessionStore.getLoginGeneration();
    if (this.paymentFlight && this.paymentFlight.generation === generation) return;
    const releasePayment = paymentReceipt.acquire(this.data.appointmentId);
    if (!releasePayment) return;
    const flight = { generation };
    this.paymentFlight = flight;
    this.appointmentPaymentInProgress = true;
    const appointmentId = this.data.appointmentId;
    const isCurrent = () => !this._unloaded && this.paymentFlight === flight &&
      generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    try {
      if (!isCurrent()) return;
      if (isCurrent()) await this.payAppointmentDeposit({ appointmentId, isCurrent });
    } finally {
      releasePayment();
      if (this.paymentFlight === flight) {
        this.paymentFlight = null;
        this.appointmentPaymentInProgress = false;
      }
    }
  },

  async payAppointmentDeposit(options = {}) {
    if (!this.data.canPay) return;
    const generation = sessionStore.getLoginGeneration();
    const appointmentId = options.appointmentId || this.data.appointmentId;
    const isCurrent = options.isCurrent || (() => !this._unloaded &&
      generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn());
    if (!isCurrent()) return;
    wx.showLoading({ title: '发起支付...' });
    try {
      let alreadyPaid = false;
      let acceptedTemplateId;
      if (!paymentReceipt.hasSubmitted(appointmentId)) {
        const payResponse = await paymentReceipt.preparePayment(api, appointmentId, isCurrent);
        if (!isCurrent()) return;
        const payParams = unwrapObject(payResponse);
        wx.hideLoading();
        alreadyPaid = payParams.alreadyPaid === true;
        if (!alreadyPaid) {
          acceptedTemplateId = await requestWxPay(payParams, () => {
            paymentReceipt.markSubmitted(appointmentId);
            if (wx.requestSubscribeMessage && isCurrent() && this.data.canRequestVisitReminderOnPayment) {
              return subscribe.requestVisitReminderAuthorization();
            }
          });
        }
      }
      if (!isCurrent()) return;
      wx.showLoading({ title: '同步预约状态...' });

      if (!alreadyPaid) await syncPaidAppointment(appointmentId);
      if (!isCurrent()) return;
      wx.hideLoading();
      if (acceptedTemplateId) await subscribe.recordAcceptedVisitReminder(appointmentId, acceptedTemplateId, isCurrent);
      if (!isCurrent()) return;
      wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      if (!isCurrent()) return;
      wx.showToast({
        title: getPaymentErrorMessage(error, '支付未完成'),
        icon: 'none',
      });
    } finally {
      // A replacement payment owns its own loading state.
      if (!this.paymentFlight || this.paymentFlight.generation === generation) wx.hideLoading();
    }
  },

  async cancelAppointment() {
    const generation = sessionStore.getLoginGeneration();
    const appointmentId = this.data.appointmentId;
    const isCurrent = () => !this._unloaded && generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    if (!appointmentId || !isCurrent() || this.cancelFlight?.generation === generation) return;
    const canCancelNow = () => {
      if (this.data.appointmentId !== appointmentId || !this.data.canCancel) {
        wx.showToast({ title: '当前预约状态不支持取消', icon: 'none' });
        return false;
      }
      const appointmentTimestamp = parseAppointmentTimestamp(this.data.appointmentDate, this.data.appointmentTime);
      if (appointmentTimestamp !== null && this.data.statusKey !== 'pending_payment' &&
          appointmentTimestamp - Date.now() < this.cancelLimitHours * 60 * 60 * 1000) {
        wx.showToast({
          title: '已超过取消截止时间（' + this.data.cancelLimitText + '）',
          icon: 'none',
        });
        return false;
      }
      return true;
    };
    if (!canCancelNow()) return;

    const flight = { generation };
    this.cancelFlight = flight;
    try {
      const result = await new Promise((resolve) => {
        wx.showModal({
          title: '取消预约',
          content: '确定要取消这次预约吗？',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        });
      });
      if (!result.confirm || !isCurrent() || !canCancelNow()) return;
      await api.cancelAppointment(appointmentId, '用户主动取消');
      if (!isCurrent()) return;
      wx.showToast({ title: '已取消', icon: 'success' });
      await this.loadPage();
    } catch (error) {
      if (!isCurrent()) return;
      wx.showToast({ title: (error && error.message) || '取消失败', icon: 'none' });
    } finally {
      if (this.cancelFlight === flight) this.cancelFlight = null;
    }
  },

  openReschedule() {
    if (['arrived', 'cancelled', 'no_show', 'completed'].includes(this.data.statusKey)) {
      navigation.openPage('/pages/appointment/store-select');
      return;
    }

    if (!['pending', 'confirmed'].includes(this.data.statusKey)) return;
    const appointmentTimestamp = parseAppointmentTimestamp(this.data.appointmentDate, this.data.appointmentTime);
    if (appointmentTimestamp === null || appointmentTimestamp - Date.now() < RESCHEDULE_LIMIT_HOURS * 60 * 60 * 1000) {
      wx.showToast({
        title: '已超过改约截止时间（就诊前' + RESCHEDULE_LIMIT_HOURS + '小时）',
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
        encodeURIComponent(this.data.storeAddress) +
        '&coverUrl=' +
        encodeURIComponent(this.data.storeCoverUrl || '')
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
    const { appointmentId, evalRating, evalContent, evaluation, evaluationSubmitting } = this.data;
    if (!appointmentId || evaluation || evaluationSubmitting || !sessionStore.isLoggedIn()) {
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && generation === sessionStore.getLoginGeneration() &&
      appointmentId === this.data.appointmentId && sessionStore.isLoggedIn();
    this.setData({ evaluationSubmitting: true });
    try {
      await api.submitAppointmentEvaluation(appointmentId, { rating: evalRating, content: evalContent });
      if (!isCurrent()) return;
      const submitted = { rating: evalRating, content: evalContent.trim() };
      this.submittedEvaluation = { appointmentId, evaluation: submitted };
      this.setData({ evaluation: submitted });
      wx.showToast({ title: '评价已提交', icon: 'success' });
      await this.loadPage({ silent: true });
    } catch (error) {
      if (!isCurrent()) return;
      wx.showToast({
        title: (error && error.message) || '评价失败',
        icon: 'none',
      });
    } finally {
      if (!this._unloaded) this.setData({ evaluationSubmitting: false });
    }
  },
});
