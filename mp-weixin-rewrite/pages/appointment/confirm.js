const api = require('../../api/index');
const appointmentDraftStore = require('../../stores/appointment-draft-store');

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  other: '其他',
};

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
    loading: true,
    loadError: '',
    draft: null,
    storeName: '',
    doctorName: '',
    consultFeeAmount: 0,
    consultFeeLabel: '¥0.00',
    showConsultFee: false,
    requireDeposit: false,
    depositAmountYuan: '¥0.00',
    cancelLimitText: '就诊前2小时',
    subscribeTemplateIds: [],
    assessmentLabel: '',
    buttonText: '确认预约',
    memberOptions: [],
    memberIndex: 0,
    memberList: [],
    selectedMemberName: '本人',
    symptomDesc: '',
    isSubmitting: false,
  },

  onShow() {
    this.loadPage();
  },

  async loadPage() {
    const draft = appointmentDraftStore.getDraft();
    if (!draft || !draft.doctorId || !draft.storeId || !draft.scheduleId || !draft.timeSlot) {
      this.setData({
        loading: false,
        loadError: '预约草稿已失效，请重新选择时段',
      });
      return;
    }

    const pendingAssessment = wx.getStorageSync('pending_appointment_assessment') || null;
    this.pendingAssessment = pendingAssessment;

    try {
      const [storesResponse, doctorsResponse, membersResponse, bookingSettingsResponse] = await Promise.all([
        api.getStores(),
        api.getDoctors({ id: draft.doctorId }),
        api.getFamilyMembers(),
        api.getBookingSettings(),
      ]);

      const stores = unwrapList(storesResponse);
      const doctors = unwrapList(doctorsResponse);
      const membersPayload = unwrapList(membersResponse);
      const bookingSettings = unwrapObject(bookingSettingsResponse);
      const store = stores.find((item) => String(item.id) === String(draft.storeId)) || null;
      const doctor = doctors.find((item) => String(item.id) === String(draft.doctorId)) || null;
      const consultFeeAmount = Number((doctor && doctor.consultFee) || 0);
      const requireDeposit = Boolean(bookingSettings.requireDeposit);
      const depositAmount = Number(bookingSettings.depositAmount || 0);
      const memberOptions = membersPayload.map((member) => {
        const relationLabel = RELATION_LABEL_MAP[member.relation] || member.relation || '其他';
        return (member.name || relationLabel) + ' (' + relationLabel + ')';
      });
      const selfIndex = Math.max(0, membersPayload.findIndex((member) => member.relation === 'self'));
      const memberIndex = selfIndex >= 0 ? selfIndex : 0;
      const totalAmountYuan = (
        consultFeeAmount / 100 + (requireDeposit ? depositAmount / 100 : 0)
      ).toFixed(2);
      const buttonText = requireDeposit
        ? '立即支付 · ¥' + totalAmountYuan
        : consultFeeAmount > 0
          ? '确认预约 · ¥' + (consultFeeAmount / 100).toFixed(2)
          : '确认预约';

      this.setData({
        loading: false,
        loadError: '',
        draft,
        storeName: store ? store.name || store.storeName || '' : '',
        doctorName: doctor ? doctor.name || draft.doctorName || '' : draft.doctorName || '',
        consultFeeAmount,
        consultFeeLabel: '¥' + (consultFeeAmount / 100).toFixed(2),
        showConsultFee: consultFeeAmount > 0,
        requireDeposit,
        depositAmountYuan: '¥' + (depositAmount / 100).toFixed(2),
        cancelLimitText: bookingSettings.cancelLimit || '就诊前2小时',
        subscribeTemplateIds: bookingSettings.subscribeTemplateIds || [],
        assessmentLabel: pendingAssessment ? pendingAssessment.label || '' : '',
        buttonText,
        memberOptions,
        memberIndex,
        memberList: membersPayload,
        selectedMemberName: memberOptions[memberIndex] || '本人',
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载预约确认信息失败',
      });
    }
  },

  handleMemberChange(event) {
    const nextIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[nextIndex];
    if (!selectedMember) {
      return;
    }

    if (selectedMember.age !== null && selectedMember.age !== undefined && Number(selectedMember.age) < 18) {
      wx.showModal({
        title: '儿童就诊提示',
        content: '本门诊定制式下颌前移防鼾器（牙套）仅适用于18岁以上发育成熟的成人。18岁以下儿童打鼾通常由扁桃体或腺样体肥大引起，建议优先预约小儿耳鼻喉科进行排查诊治。是否继续？',
        confirmText: '继续预约',
        cancelText: '取消',
        success: (result) => {
          if (!result.confirm) {
            return;
          }
          this.setData({
            memberIndex: nextIndex,
            selectedMemberName: this.data.memberOptions[nextIndex] || '本人',
          });
        },
      });
      return;
    }

    this.setData({
      memberIndex: nextIndex,
      selectedMemberName: this.data.memberOptions[nextIndex] || '本人',
    });
  },

  handleSymptomInput(event) {
    this.setData({
      symptomDesc: event.detail.value || '',
    });
  },

  requestSubscribe(callback) {
    const templateIds = this.data.subscribeTemplateIds || [];
    if (wx.requestSubscribeMessage && templateIds.length > 0) {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        complete: () => {
          callback();
        },
      });
      return;
    }
    callback();
  },

  async submitAppointment() {
    if (this.data.isSubmitting || !this.data.draft) {
      return;
    }

    const selectedMember = this.data.memberList[this.data.memberIndex];
    if (!selectedMember) {
      wx.showToast({ title: '请先选择就诊人', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const createResponse = await api.createAppointment({
        patientId: selectedMember.id,
        storeId: this.data.draft.storeId,
        doctorId: this.data.draft.doctorId,
        scheduleId: this.data.draft.scheduleId,
        appointmentDate: this.data.draft.appointmentDate,
        appointmentTime: this.data.draft.timeSlot.label,
        type: 'first',
        symptomDesc: this.data.symptomDesc || undefined,
        essAssessmentId: this.pendingAssessment && this.pendingAssessment.type === 'ess' ? this.pendingAssessment.id : undefined,
        snoreAssessmentId: this.pendingAssessment && this.pendingAssessment.type === 'snore' ? this.pendingAssessment.id : undefined,
      });

      const appointment = unwrapObject(createResponse);
      const appointmentId = appointment.id;
      const appointmentStatus = appointment.status;
      const appointmentRequireDeposit = appointment.requireDeposit !== undefined ? appointment.requireDeposit : appointment.require_deposit;
      const appointmentDepositAmount = appointment.depositAmount !== undefined ? appointment.depositAmount : appointment.deposit_amount;

      if (appointmentStatus === 'pending_payment') {
        const depositAmount = appointmentRequireDeposit ? Number(appointmentDepositAmount || 0) : 0;
        let feeDescription = '';
        if (appointmentRequireDeposit && this.data.consultFeeAmount > 0) {
          feeDescription = '（含定金与挂号费）';
        } else if (appointmentRequireDeposit) {
          feeDescription = '（含预约定金）';
        } else if (this.data.consultFeeAmount > 0) {
          feeDescription = '（含挂号费）';
        }
        const totalPayYuan = ((depositAmount + this.data.consultFeeAmount) / 100).toFixed(2);

        wx.showModal({
          title: '确认支付',
          content: '预约就诊需要支付 ¥' + totalPayYuan + feeDescription + '，是否确认支付？',
          confirmText: '确认支付',
          cancelText: '取消',
          success: async (result) => {
            if (result.confirm) {
              wx.showLoading({ title: '发起支付...' });
              try {
                const payResponse = await api.payAppointmentDeposit(appointmentId);
                const payParams = unwrapObject(payResponse);
                wx.hideLoading();
                if (payParams.mockPayment) {
                  wx.showLoading({ title: '开发环境模拟支付...' });
                  await api.confirmAppointmentPayment(appointmentId);
                  wx.hideLoading();
                } else {
                  await requestWxPay(payParams);
                }
                wx.showToast({ title: '支付已提交', icon: 'success' });
                appointmentDraftStore.clearDraft();
                wx.removeStorageSync('pending_appointment_assessment');
                setTimeout(() => {
                  this.requestSubscribe(() => {
                    wx.reLaunch({ url: '/pages/appointment/success?id=' + appointmentId });
                  });
                }, 1000);
              } catch (error) {
                wx.hideLoading();
                wx.showToast({
                  title: error && error.errMsg ? '支付未完成，可稍后继续支付' : '发起支付失败，请稍后重试',
                  icon: 'none',
                });
                setTimeout(() => {
                  wx.reLaunch({ url: '/pages/appointment/index?tab=mine' });
                }, 1000);
              } finally {
                this.setData({ isSubmitting: false });
              }
            } else {
              try {
                await api.cancelAppointment(appointmentId, '支付窗口取消');
              } catch (error) {
                console.error('取消未支付预约失败', error);
              }
              wx.showToast({ title: '已取消预约', icon: 'none' });
              setTimeout(() => {
                wx.reLaunch({ url: '/pages/appointment/index?tab=mine' });
              }, 1000);
              this.setData({ isSubmitting: false });
            }
          },
        });
        return;
      }

      appointmentDraftStore.clearDraft();
      wx.removeStorageSync('pending_appointment_assessment');
      this.requestSubscribe(() => {
        wx.reLaunch({ url: '/pages/appointment/success?id=' + appointmentId });
      });
    } catch (error) {
      wx.showToast({
        title: '预约失败，请重试',
        icon: 'none',
      });
    } finally {
      if (this.data.isSubmitting) {
        this.setData({ isSubmitting: false });
      }
    }
  },
});
