const api = require('../../api/index');
const appointmentDraftStore = require('../../stores/appointment-draft-store');
const subscribe = require('../../common/utils/subscribe');
const sessionStore = require('../../stores/session-store');

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};

function bookingSlotKey(draft) {
  if (!draft || !draft.timeSlot || draft.creationUnconfirmed) return null;
  return JSON.stringify([
    draft.storeId, draft.doctorId, draft.scheduleId, draft.appointmentDate, draft.timeSlot.label,
  ].map(String));
}

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
    loading: true,
    hasLoaded: false,
    loadError: '',
    canRetryLoad: false,
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
    subscribe.refreshSubscribeSettings();
    this.loadPage({ silent: this.data.hasLoaded });
  },

  onUnload() {
    this._unloaded = true;
    this.loadRequestId = (this.loadRequestId || 0) + 1;
  },

  async loadPage(options = {}) {
    const requestId = this.loadRequestId = (this.loadRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && requestId === this.loadRequestId && generation === sessionStore.getLoginGeneration();
    const showSignedOut = () => {
      if (this._unloaded || requestId !== this.loadRequestId || sessionStore.isLoggedIn()) return;
      this.pendingAssessment = null;
      this.setData({ loading: false, hasLoaded: false, draft: null, memberList: [], memberOptions: [],
        memberIndex: 0, selectedMemberName: '', symptomDesc: '', assessmentLabel: '',
        loadError: '登录已失效，请重新登录后预约' });
    };
    // Clear the previous account before any request or early return. A token
    // renewal keeps this generation and therefore preserves the chosen family.
    if (this.confirmOwnerGeneration !== generation) {
      this.confirmOwnerGeneration = generation;
      this.createdAppointmentId = '';
      this.pendingAssessment = null;
      if (this.pendingPatientGeneration !== generation) {
        this.pendingPatientId = '';
        this.pendingPatientGeneration = undefined;
      }
      this.setData({
        loading: true, hasLoaded: false, loadError: '', draft: null,
        memberList: [], memberOptions: [], memberIndex: 0,
        selectedMemberName: '请选择就诊人', symptomDesc: '', assessmentLabel: '',
        storeName: '', doctorName: '', consultFeeAmount: 0, consultFeeLabel: '¥0.00',
        showConsultFee: false, requireDeposit: false, depositAmountYuan: '¥0.00',
        subscribeTemplateIds: [], buttonText: '确认预约', isSubmitting: false,
      });
    }
    if (this.createdAppointmentId) return;
    this.setData({ canRetryLoad: false });
    if (!sessionStore.isLoggedIn()) { showSignedOut(); return; }
    const draft = appointmentDraftStore.getDraft();
    if (draft && draft.creationUnconfirmed) {
      this.setData({ loading: false, draft: null, loadError: '预约结果待确认，请先在预约记录中核对' });
      return;
    }
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
      if (!isCurrent() || !sessionStore.isLoggedIn()) { showSignedOut(); return; }
      if (this.createdAppointmentId) return;

      const stores = unwrapList(storesResponse);
      const doctors = unwrapList(doctorsResponse);
      const membersPayload = unwrapList(membersResponse);
      const bookingSettings = unwrapObject(bookingSettingsResponse);
      const store = stores.find((item) => String(item.id) === String(draft.storeId)) || null;
      const doctor = doctors.find((item) => String(item.id) === String(draft.doctorId)) || null;
      if (!doctor) {
        this.setData({ loading: false, hasLoaded: false, draft: null, canRetryLoad: true,
          loadError: '未获取到所选医生的信息，请重试' });
        return;
      }
      const consultFeeAmount = Number(doctor.consultFee || 0);
      const requireDeposit = Boolean(bookingSettings.requireDeposit);
      const depositAmount = Number(bookingSettings.depositAmount || 0);
      const memberOptions = membersPayload.map((member) => {
        const relationLabel = RELATION_LABEL_MAP[member.relation] || member.relation || '其他';
        return (member.name || relationLabel) + ' (' + relationLabel + ')';
      });
      const selfIndex = Math.max(0, membersPayload.findIndex((member) => member.relation === 'self'));
      const pendingPatientId = this.pendingPatientGeneration === generation
        ? String(this.pendingPatientId || '') : '';
      const pendingMemberIndex = pendingPatientId ? membersPayload.findIndex((member) => String(member.id || '') === pendingPatientId) : -1;
      const currentMember = this.memberOwnerGeneration === generation && this.data.memberList[this.data.memberIndex];
      const retainedIndex = currentMember ? membersPayload.findIndex((member) => String(member.id) === String(currentMember.id)) : -1;
      const memberIndex = pendingMemberIndex >= 0 ? pendingMemberIndex : retainedIndex >= 0 ? retainedIndex : selfIndex;
      this.memberOwnerGeneration = generation;
      this.pendingPatientId = '';
      this.pendingPatientGeneration = undefined;
      const totalAmountYuan = (
        consultFeeAmount / 100 + (requireDeposit ? depositAmount / 100 : 0)
      ).toFixed(2);
      const buttonText = requireDeposit
        ? '立即支付 · ¥' + totalAmountYuan
        : consultFeeAmount > 0
          ? '确认预约 · ¥' + (consultFeeAmount / 100).toFixed(2)
          : '确认预约';

      this.setData({
        hasLoaded: true,
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
      if (!isCurrent() || !sessionStore.isLoggedIn()) { showSignedOut(); return; }
      if (this.createdAppointmentId) return;
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          canRetryLoad: true,
          loadError: (error && error.message) || '加载预约确认信息失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载预约确认信息失败', icon: 'none' });
    }
  },

  retryLoad() {
    if (!this.data.canRetryLoad || this.data.loading) return;
    this.setData({ loading: true, loadError: '' });
    return this.loadPage();
  },

  handleMemberChange(event) {
    if (this.data.isSubmitting) return;
    const selection = this.memberSelection = {};
    const nextIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[nextIndex];
    if (!selectedMember) {
      return;
    }

    if (selectedMember.age !== null && selectedMember.age !== undefined && Number(selectedMember.age) < 18) {
      const generation = sessionStore.getLoginGeneration();
      wx.showModal({
        title: '儿童就诊提示',
        content: '本门诊定制式下颌前移防鼾器（牙套）仅适用于18岁以上发育成熟的成人。18岁以下儿童打鼾通常由扁桃体或腺样体肥大引起，建议优先预约小儿耳鼻喉科进行排查诊治。是否继续？',
        confirmText: '继续预约',
        cancelText: '取消',
        success: (result) => {
          if (!result.confirm || this._unloaded || this.data.isSubmitting ||
              this.memberSelection !== selection || generation !== sessionStore.getLoginGeneration()) return;
          const currentIndex = this.data.memberList.findIndex(member => String(member.id) === String(selectedMember.id));
          if (currentIndex < 0) {
            wx.showToast({ title: '该就诊人已不可选，请重新选择', icon: 'none' });
            return;
          }
          this.setData({
            memberIndex: currentIndex,
            selectedMemberName: this.data.memberOptions[currentIndex] || '本人',
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

  goAddMember() {
    const draft = this.data.draft || {};
    const query = [
      'source=appointment',
      draft.storeId ? 'storeId=' + encodeURIComponent(String(draft.storeId)) : '',
      this.data.storeName ? 'storeName=' + encodeURIComponent(this.data.storeName) : '',
    ].filter(Boolean).join('&');
    wx.navigateTo({
      url: '/pages/profile/family-members/add-member/index' + (query ? '?' + query : ''),
    });
  },

  selectCreatedPatient(id) {
    this.pendingPatientId = String(id);
    this.pendingPatientGeneration = sessionStore.getLoginGeneration();
  },

  async submitAppointment() {
    if (this._unloaded || this.createdAppointmentId || this.data.isSubmitting || !this.data.draft) {
      return;
    }

    if (this.memberOwnerGeneration !== undefined &&
        this.memberOwnerGeneration !== sessionStore.getLoginGeneration()) {
      wx.showToast({ title: '登录状态已变更，请重新加载预约信息', icon: 'none' });
      return;
    }

    const selectedMember = this.data.memberList[this.data.memberIndex];
    if (!selectedMember) {
      wx.showToast({ title: '请先选择就诊人', icon: 'none' });
      return;
    }

    const draft = this.data.draft;
    if (draft.creationUnconfirmed || this.creationUnconfirmedDraft === draft) return;
    const slotKey = bookingSlotKey(draft);
    const symptomDesc = this.data.symptomDesc;
    const assessment = this.pendingAssessment;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    this.setData({ isSubmitting: true });

    let creating = false;
    try {
      await subscribe.requestSubscribe({ force: true, scene: 'appointment' });
      if (!isCurrent()) return;
      const currentMember = this.data.memberList[this.data.memberIndex];
      if (!slotKey || slotKey !== bookingSlotKey(this.data.draft) ||
          String(currentMember?.id) !== String(selectedMember.id)) {
        wx.showToast({ title: '预约信息已变更，请核对后重新提交', icon: 'none' });
        return;
      }
      creating = true;
      const createResponse = await api.createAppointment({
        patientId: selectedMember.id,
        storeId: this.data.draft.storeId,
        doctorId: this.data.draft.doctorId,
        scheduleId: this.data.draft.scheduleId,
        appointmentDate: this.data.draft.appointmentDate,
        appointmentTime: this.data.draft.timeSlot.label,
        type: 'first',
        symptomDesc: symptomDesc || undefined,
        essAssessmentId: assessment?.type === 'ess' ? assessment.id : undefined,
        snoreAssessmentId: assessment?.type === 'snore' ? assessment.id : undefined,
      });

      if (!isCurrent()) return;
      const appointment = unwrapObject(createResponse);
      const appointmentId = appointment.id;
      if (!appointmentId) throw new Error('未返回预约编号，请到预约记录核对结果');
      this.createdAppointmentId = appointmentId;
      creating = false;
      // Once created, never reuse this draft to create another appointment.
      appointmentDraftStore.clearDraft();
      this.setData({ draft: null });
      if (appointment.reused) {
        wx.showToast({ title: '该时段已有预约，请在预约记录中查看', icon: 'none' });
        wx.reLaunch({ url: '/pages/appointment/booking/index?tab=mine' });
        return;
      }
      const appointmentStatus = appointment.status;
      const appointmentRequireDeposit = appointment.requireDeposit !== undefined ? appointment.requireDeposit : appointment.require_deposit;
      const appointmentDepositAmount = appointment.depositAmount !== undefined ? appointment.depositAmount : appointment.deposit_amount;

      if (appointmentStatus === 'pending_payment') {
        const depositAmount = appointmentRequireDeposit ? Number(appointmentDepositAmount || 0) : 0;
        const consultFeeAmount = Number(appointment.consultFee ?? appointment.consult_fee ?? this.data.consultFeeAmount);
        let feeDescription = '';
        if (appointmentRequireDeposit && consultFeeAmount > 0) {
          feeDescription = '（含定金与挂号费）';
        } else if (appointmentRequireDeposit) {
          feeDescription = '（含预约定金）';
        } else if (consultFeeAmount > 0) {
          feeDescription = '（含挂号费）';
        }
        const totalPayYuan = ((depositAmount + consultFeeAmount) / 100).toFixed(2);

        wx.showModal({
          title: '确认支付',
          content: '预约就诊需要支付 ¥' + totalPayYuan + feeDescription + '，是否确认支付？',
          confirmText: '确认支付',
          cancelText: '取消',
          success: async (result) => {
            if (!isCurrent()) return;
            if (result.confirm) {
              wx.showLoading({ title: '发起支付...' });
              try {
                const payResponse = await api.payAppointmentDeposit(appointmentId);
                if (!isCurrent()) { wx.hideLoading(); return; }
                const payParams = unwrapObject(payResponse);
                wx.hideLoading();
                await requestWxPay(payParams);
                if (!isCurrent()) return;
                wx.showLoading({ title: '同步预约状态...' });
                await syncPaidAppointment(appointmentId);
                wx.hideLoading();
                if (!isCurrent()) return;
                wx.showToast({ title: '支付已提交', icon: 'success' });
                appointmentDraftStore.clearDraft();
                wx.removeStorageSync('pending_appointment_assessment');
                wx.reLaunch({ url: '/pages/appointment/success?id=' + appointmentId });
                } catch (error) {
                  wx.hideLoading();
                  if (!isCurrent()) return;
                  wx.showToast({
                    title: getPaymentErrorMessage(error, '支付未完成'),
                    icon: 'none',
                  });
                setTimeout(() => {
                  if (!isCurrent()) return;
                  wx.reLaunch({ url: '/pages/appointment/booking/index?tab=mine' });
                }, 1000);
              }
            } else {
              try {
                await api.cancelAppointment(appointmentId, '支付窗口取消');
                if (!isCurrent()) return;
                wx.showToast({ title: '已取消预约', icon: 'none' });
              } catch (error) {
                if (!isCurrent()) return;
                console.error('取消未支付预约失败', error);
                wx.showToast({ title: '取消未成功，请在预约记录中确认', icon: 'none' });
              }
              setTimeout(() => {
                if (!isCurrent()) return;
                wx.reLaunch({ url: '/pages/appointment/booking/index?tab=mine' });
              }, 1000);
            }
          },
          fail: () => {
            if (!isCurrent()) return;
            wx.showToast({ title: '预约已创建，请在预约记录中继续处理', icon: 'none' });
            wx.reLaunch({ url: '/pages/appointment/booking/index?tab=mine' });
          },
        });
        return;
      }

      appointmentDraftStore.clearDraft();
      wx.removeStorageSync('pending_appointment_assessment');
      wx.reLaunch({ url: '/pages/appointment/success?id=' + appointmentId });
    } catch (error) {
      if (!isCurrent()) return;
      const status = Number(error && error.statusCode);
      if (creating && (status === 408 || status >= 500 ||
          (error && !status && ('statusCode' in Object(error) || /超时|timeout|未返回预约编号/i.test(error.message || ''))))) {
        this.creationUnconfirmedDraft = draft;
        this.setData({ draft: null, loadError: '预约结果待确认，请先在预约记录中核对' });
        try {
          appointmentDraftStore.setDraft({ ...draft, creationUnconfirmed: true });
        } catch (storageError) {
          console.error('保存待确认预约草稿失败', storageError);
        }
        wx.showToast({ title: '预约结果待确认，请核对预约记录', icon: 'none' });
        wx.reLaunch({ url: '/pages/appointment/booking/index?tab=mine' });
        return;
      }
      wx.showToast({
        title: (error && error.message) || '预约失败，请重试',
        icon: 'none',
      });
    } finally {
      if (isCurrent() && !this.createdAppointmentId && this.data.isSubmitting) {
        this.setData({ isSubmitting: false });
      }
    }
  },
});
