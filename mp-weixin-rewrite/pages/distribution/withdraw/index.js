const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');

const emptyBankFields = { bankName: '', bankAccountName: '', bankAccountNo: '' };

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function formatYuan(amountInCents) {
  return '¥' + (Number(amountInCents || 0) / 100).toFixed(2);
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    availableCommissionCents: 0,
    availableCommissionLabel: '¥0.00',
    totalCommissionLabel: '¥0.00',
    withdrawnAmountLabel: '¥0.00',
    withdrawAmountInput: '',
    amountError: '',
    withdrawMethod: 'bank',
    wechatEnabled: false,
    wechatMinYuan: 0.1,
    wechatMaxYuan: 0,
    wechatAuthorized: false,
    checkingAuthorization: false,
    needsWechatName: false,
    wechatRealName: '',
    isSubmitting: false,
    ...emptyBankFields,
    bankCards: [],
    selectedCardId: '',
    editingCard: null,
    isUpdatingCards: false,
    minWithdrawAmount: null,
    withdrawFeeRate: null,
    withdrawFeeRatePercentLabel: '--',
    serviceFeeLabel: '¥0.00',
    actualAmountLabel: '¥0.00',
    isSubmitEnabled: false,
  },

  async onShow() {
    if ((this.data.isSubmitting || this.data.isUpdatingCards || this.data.checkingAuthorization)
      && this._sessionGeneration === sessionStore.getLoginGeneration()) return;
    await this.loadPage();
  },

  onUnload() {
    this._unloaded = true;
    this._loadRequestId = (this._loadRequestId || 0) + 1;
  },

  isCurrentSession(generation) {
    return !this._unloaded && generation === sessionStore.getLoginGeneration();
  },

  async loadPage({ selectLatest = false } = {}) {
    const requestId = this._loadRequestId = (this._loadRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    if (this._sessionGeneration !== generation) {
      this._sessionGeneration = generation;
      this._wechatRequest = null;
      this.setData({
        ...emptyBankFields,
        bankCards: [],
        selectedCardId: '',
        editingCard: null,
        withdrawAmountInput: '',
        withdrawMethod: 'bank',
        wechatEnabled: false,
        wechatAuthorized: false,
        checkingAuthorization: false,
        wechatRealName: '',
        hasLoaded: false,
        isSubmitting: false,
        isUpdatingCards: false,
      });
    }
    const { hasLoaded, selectedCardId } = this.data;
    this.setData({ isSubmitEnabled: false, loading: true, loadError: '' });
    try {
      const [infoResponse, cardResponse] = await Promise.all([
        api.getDistributorInfo(),
        api.getWithdrawBankCards().catch(error => {
          if (error?.statusCode === 404) return { list: [] };
          throw error;
        }),
      ]);
      if (requestId !== this._loadRequestId || !this.isCurrentSession(generation)) return;
      const info = unwrapObject(infoResponse);
      const { list: bankCards } = unwrapObject(cardResponse);
      if (!Array.isArray(bankCards)) throw new Error('加载历史银行卡失败');
      const keepSelection = hasLoaded && !selectLatest
        && (!selectedCardId || bankCards.some(card => card.id === selectedCardId));
      const rawRate = info.withdrawFeeRates && info.withdrawFeeRates.bank;
      const withdrawFeeRate = Number(rawRate);
      if (rawRate == null || !Number.isFinite(withdrawFeeRate) || withdrawFeeRate < 0 || withdrawFeeRate >= 1
        || info.minWithdrawAmount == null || !Number.isSafeInteger(Number(info.minWithdrawAmount))
        || Number(info.minWithdrawAmount) < 0 || !Number.isSafeInteger(Number(info.availableCommission))) {
        throw new Error('提现配置不完整，暂时无法申请');
      }

      this.setData({
        hasLoaded: true,
        loading: false,
        wechatEnabled: info.wechatWithdrawEnabled === true,
        wechatMinYuan: Math.max(Number(info.minWithdrawAmount), Number(info.wechatWithdrawMin) || 10) / 100,
        wechatMaxYuan: (Number(info.wechatWithdrawMax) || 0) / 100,
        withdrawMethod: info.wechatWithdrawEnabled === true ? this.data.withdrawMethod : 'bank',
        bankCards,
        selectedCardId: keepSelection ? selectedCardId : (bankCards[0]?.id || ''),
        availableCommissionCents: Number(info.availableCommission || 0),
        availableCommissionLabel: formatYuan(info.availableCommission),
        totalCommissionLabel: formatYuan(info.totalCommission),
        withdrawnAmountLabel: formatYuan(info.withdrawnAmount),
        minWithdrawAmount: Number(info.minWithdrawAmount) / 100,
        withdrawFeeRate,
        withdrawFeeRatePercentLabel: String(withdrawFeeRate * 100),
      });
      this.refreshAmountSummary();
    } catch (error) {
      if (requestId !== this._loadRequestId || !this.isCurrentSession(generation)) return;
      this.setData({
        hasLoaded: false,
        isSubmitEnabled: false,
        loading: false,
        loadError: (error && error.message) || '加载提现信息失败',
      });
    }
  },

  refreshAmountSummary() {
    const {
      withdrawAmountInput, minWithdrawAmount, bankName, bankAccountName, bankAccountNo,
      bankCards, selectedCardId, editingCard,
    } = this.data;
    const selectedCard = bankCards.find(card => card.id === selectedCardId);
    const numericAmount = Number(withdrawAmountInput);
    const validInput = /^\d+(\.\d{1,2})?$/.test(withdrawAmountInput)
      && Number.isSafeInteger(Math.round(numericAmount * 100));
    const withdrawAmount = validInput ? numericAmount : 0;
    const maxWithdrawAmount = Number(this.data.availableCommissionCents || 0) / 100;
    const needsBankInfo = this.data.withdrawMethod === 'bank';
    const needsWechatName = !needsBankInfo && withdrawAmount >= 2000;
    const minAmount = needsBankInfo ? minWithdrawAmount : this.data.wechatMinYuan;
    const serviceFee = withdrawAmount <= 0 || !needsBankInfo
      ? 0
      : Math.max(Math.round(Math.round(withdrawAmount * 100) * Number(this.data.withdrawFeeRate)), 100) / 100;
    const actualAmount = Math.max(withdrawAmount - serviceFee, 0);
    let amountError = '';
    if (!withdrawAmountInput) {
      amountError = '请输入提现金额';
    } else if (!validInput) {
      amountError = '请输入有效金额，最多保留两位小数';
    } else if (withdrawAmount < minAmount) {
      amountError = `最低提现金额为 ${minAmount} 元`;
    } else if (withdrawAmount > maxWithdrawAmount) {
      amountError = `可提现余额为 ${maxWithdrawAmount.toFixed(2)} 元，输入金额已超出`;
    } else if (!needsBankInfo && this.data.wechatMaxYuan && withdrawAmount > this.data.wechatMaxYuan) {
      amountError = `微信零钱单笔最高提现金额为 ${this.data.wechatMaxYuan.toFixed(2)} 元`;
    } else if (actualAmount <= 0) {
      amountError = needsBankInfo ? '扣除手续费后，到账金额须大于 0 元' : '提现金额须大于 0 元';
    }

    let submitError = amountError;
    if (!this.data.hasLoaded || this.data.loading || this.data.loadError) {
      submitError = this.data.loadError || '提现信息尚未加载完成';
    } else if (editingCard) {
      submitError = '请先保存或取消银行卡编辑';
    } else if (!submitError) {
      if (!needsBankInfo) {
        if (!this.data.wechatEnabled) submitError = '微信零钱提现暂不可用，请选择银行卡';
        else if (!this.data.wechatAuthorized) submitError = '请先完成微信零钱收款授权';
        else if (needsWechatName && !this.data.wechatRealName.trim()) submitError = '请填写微信支付实名姓名';
      } else if (selectedCardId) {
        if (!selectedCard) submitError = '请重新选择银行卡';
        else if (selectedCard.needsAccountNo) submitError = '请先编辑银行卡并补全卡号';
      } else if (!String(bankName || '').trim()) {
        submitError = '请输入开户银行';
      } else if (!String(bankAccountName || '').trim()) {
        submitError = '请输入开户姓名';
      } else if (!String(bankAccountNo || '').trim()) {
        submitError = '请输入银行卡号';
      }
    }

    this.setData({
      serviceFeeLabel: '¥' + serviceFee.toFixed(2),
      actualAmountLabel: '¥' + actualAmount.toFixed(2),
      amountError: withdrawAmountInput ? amountError : '',
      needsWechatName,
      isSubmitEnabled: !submitError && !this.data.isSubmitting && !this.data.isUpdatingCards && !this.data.checkingAuthorization,
    });
    return submitError;
  },

  handleAmountInput(event) {
    this.setData({ withdrawAmountInput: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  chooseMethod(event) {
    const { method } = event.currentTarget.dataset;
    if (this.data.isSubmitting || this.data.isUpdatingCards || this.data.editingCard || this.data.checkingAuthorization) return;
    if (method === 'wechat' && !this.data.wechatEnabled) return;
    this.setData({ withdrawMethod: method }, () => this.refreshAmountSummary());
    if (method === 'wechat') return this.checkWechatAuthorization(false);
  },

  authorizeWechat() {
    return this.checkWechatAuthorization(true);
  },

  async checkWechatAuthorization(prepare) {
    if (!this.data.wechatEnabled || this.data.checkingAuthorization || this.data.isSubmitting) return;
    const generation = sessionStore.getLoginGeneration();
    this.setData({ checkingAuthorization: true, isSubmitEnabled: false });
    try {
      let result = unwrapObject(await api.getWechatWithdrawAuthorization(prepare));
      if (!this.isCurrentSession(generation)) return;
      if (prepare && result.retry) result = unwrapObject(await api.getWechatWithdrawAuthorization(true));
      if (!this.isCurrentSession(generation)) return;
      if (prepare && result.enabled && !result.authorized) {
        if (typeof wx.requestMerchantTransfer !== 'function'
          || (typeof wx.canIUse === 'function' && !wx.canIUse('requestMerchantTransfer'))) {
          throw new Error('请在手机微信中打开小程序并完成授权');
        }
        if (!result.package) throw new Error('暂未获取到授权信息，请稍后重试');
        const { mchId, appId, package: authorizationPackage } = result;
        await new Promise(resolve => wx.requestMerchantTransfer({
          mchId, appId, package: authorizationPackage, complete: resolve,
        }));
        if (!this.isCurrentSession(generation)) return;
        result = unwrapObject(await api.getWechatWithdrawAuthorization());
        if (!this.isCurrentSession(generation)) return;
        if (result.enabled && !result.authorized) {
          wx.showToast({ title: '微信收款授权尚未确认，可再次授权', icon: 'none' });
        }
      }
      this.setData({
        wechatEnabled: result.enabled,
        wechatAuthorized: result.authorized,
        withdrawMethod: result.enabled ? 'wechat' : 'bank',
      });
    } catch (error) {
      if (this.isCurrentSession(generation)) {
        this.setData({ wechatAuthorized: false });
        wx.showToast({ title: error.message || '暂时无法查询收款授权', icon: 'none' });
      }
    } finally {
      if (this.isCurrentSession(generation)) {
        this.setData({ checkingAuthorization: false });
        this.refreshAmountSummary();
      }
    }
  },

  handleWechatNameInput(event) {
    this.setData({ wechatRealName: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  handleBankInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  selectSavedCard(event) {
    if (this.data.isSubmitting || this.data.isUpdatingCards) return;
    const { id } = event.currentTarget.dataset;
    if (!this.data.bankCards.some(card => card.id === id)) return;
    this.setData({ ...emptyBankFields, selectedCardId: id, editingCard: null }, () => this.refreshAmountSummary());
  },

  enterNewCard() {
    if (this.data.isSubmitting || this.data.isUpdatingCards) return;
    this.setData({ ...emptyBankFields, selectedCardId: '', editingCard: null }, () => this.refreshAmountSummary());
  },

  editSavedCard(event) {
    if (this.data.isSubmitting || this.data.isUpdatingCards) return;
    const card = this.data.bankCards.find(item => item.id === event.currentTarget.dataset.id);
    if (!card) return;
    this.setData({
      editingCard: card,
      bankName: card.bankName,
      bankAccountName: card.accountName,
      bankAccountNo: '',
    }, () => this.refreshAmountSummary());
  },

  cancelCardEdit() {
    if (this.data.isUpdatingCards) return;
    this.setData({ ...emptyBankFields, editingCard: null }, () => this.refreshAmountSummary());
  },

  readBankFields() {
    return {
      bankName: this.data.bankName.trim(),
      accountName: this.data.bankAccountName.trim(),
      accountNo: this.data.bankAccountNo.trim(),
    };
  },

  async saveCardEdit() {
    const { editingCard, isUpdatingCards, isSubmitting } = this.data;
    if (!editingCard || isUpdatingCards || isSubmitting) return;
    const bankInfo = this.readBankFields();
    let errorMessage = '';
    if (!bankInfo.bankName) errorMessage = '请输入开户银行';
    else if (!bankInfo.accountName) errorMessage = '请输入开户姓名';
    else if (editingCard.needsAccountNo && !bankInfo.accountNo) errorMessage = '请输入银行卡号';
    else if (bankInfo.accountNo && !/^\d{8,34}$/.test(bankInfo.accountNo)) errorMessage = '请输入 8 至 34 位银行卡号';
    if (errorMessage) {
      wx.showToast({ title: errorMessage, icon: 'none' });
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    this.setData({ isUpdatingCards: true, isSubmitEnabled: false });
    try {
      const card = unwrapObject(await api.updateWithdrawBankCard(editingCard.id, bankInfo));
      if (!this.isCurrentSession(generation)) return;
      this.setData({
        ...emptyBankFields,
        bankCards: this.data.bankCards.map(item => item.id === card.id ? card : item),
        editingCard: null,
      });
      wx.showToast({ title: '银行卡已保存', icon: 'success' });
    } catch (error) {
      if (this.isCurrentSession(generation)) {
        wx.showToast({ title: error.message || '保存银行卡失败', icon: 'none' });
      }
    } finally {
      if (this.isCurrentSession(generation)) {
        this.setData({ isUpdatingCards: false });
        this.refreshAmountSummary();
      }
    }
  },

  confirmDeleteCard(event) {
    if (this.data.isSubmitting || this.data.isUpdatingCards || this.data.editingCard) return;
    const { id } = event.currentTarget.dataset;
    const generation = sessionStore.getLoginGeneration();
    wx.showModal({
      title: '删除银行卡',
      content: '删除后，下次提现需重新填写这张卡的信息。',
      confirmText: '删除',
      confirmColor: '#b91c1c',
      success: ({ confirm }) => {
        if (confirm && this.isCurrentSession(generation)) this.deleteSavedCard(id);
      },
    });
  },

  async deleteSavedCard(id) {
    if (this.data.isSubmitting || this.data.isUpdatingCards || this.data.editingCard) return;
    const generation = sessionStore.getLoginGeneration();
    this.setData({ isUpdatingCards: true, isSubmitEnabled: false });
    try {
      await api.deleteWithdrawBankCard(id);
      if (!this.isCurrentSession(generation)) return;
      const bankCards = this.data.bankCards.filter(card => card.id !== id);
      const { selectedCardId } = this.data;
      this.setData({
        bankCards,
        selectedCardId: selectedCardId === id ? (bankCards[0]?.id || '') : selectedCardId,
      });
      wx.showToast({ title: '银行卡已删除', icon: 'success' });
    } catch (error) {
      if (this.isCurrentSession(generation)) {
        wx.showToast({ title: error.message || '删除银行卡失败', icon: 'none' });
      }
    } finally {
      if (this.isCurrentSession(generation)) {
        this.setData({ isUpdatingCards: false });
        this.refreshAmountSummary();
      }
    }
  },

  async submitWithdraw() {
    if (this.data.isSubmitting || this.data.isUpdatingCards || this.data.checkingAuthorization) return;
    const submitError = this.refreshAmountSummary();
    if (submitError) {
      wx.showToast({ title: submitError, icon: 'none' });
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    const { withdrawAmountInput, withdrawMethod, selectedCardId } = this.data;
    this.setData({ isSubmitting: true, isSubmitEnabled: false });
    try {
      const amount = Math.round(Number(withdrawAmountInput) * 100);
      if (withdrawMethod === 'wechat') {
        if (this._wechatRequest?.amount !== amount) {
          this._wechatRequest = { amount, id: Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) };
        }
        await api.applyWithdraw(amount, 'wechat', undefined, undefined, {
          requestId: this._wechatRequest.id,
          realName: this.data.needsWechatName ? this.data.wechatRealName.trim() : undefined,
        });
      } else {
        await api.applyWithdraw(
          amount, withdrawMethod, selectedCardId ? null : this.readBankFields(), selectedCardId || undefined,
        );
      }
      if (!this.isCurrentSession(generation)) return;
      wx.showToast({ title: '提现申请已提交', icon: 'success' });
      this._wechatRequest = null;
      this.setData({ ...emptyBankFields, withdrawAmountInput: '', wechatRealName: '' });
      await this.loadPage({ selectLatest: true });
    } catch (error) {
      if (this.isCurrentSession(generation)) {
        if (withdrawMethod === 'wechat' && error?.statusCode === 409 && error.message === '请先完成微信零钱收款授权') {
          this.setData({ wechatAuthorized: false });
        }
        wx.showToast({ title: (error && error.message) || '提现失败', icon: 'none' });
      }
    } finally {
      if (this.isCurrentSession(generation)) {
        this.setData({ isSubmitting: false });
        this.refreshAmountSummary();
      }
    }
  },

  openWithdrawRecords() {
    wx.navigateTo({ url: '/pages/distribution/withdraw-records/index' });
  },
});
