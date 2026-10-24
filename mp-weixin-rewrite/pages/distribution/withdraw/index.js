const api = require('../../../api/index');
const subscribe = require('../../../common/utils/subscribe');

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
    withdrawMethod: 'bank',
    isSubmitting: false,
    bankName: '',
    bankAccountName: '',
    bankAccountNo: '',
    minWithdrawAmount: null,
    withdrawFeeRate: null,
    withdrawFeeRatePercentLabel: '--',
    serviceFeeLabel: '¥0.00',
    actualAmountLabel: '¥0.00',
    isSubmitEnabled: false,
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    this.setData({ isSubmitEnabled: false, loading: true, loadError: '' });
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const response = await api.getDistributorInfo();
      const info = unwrapObject(response);
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
      this.setData({ hasLoaded: false, isSubmitEnabled: false });
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载提现信息失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载提现信息失败', icon: 'none' });
    }
  },

  refreshAmountSummary() {
    const validInput = /^\d+(\.\d{1,2})?$/.test(this.data.withdrawAmountInput);
    const withdrawAmount = validInput ? Number(this.data.withdrawAmountInput) : 0;
    const maxWithdrawAmount = Number(this.data.availableCommissionCents || 0) / 100;
    const needsBankInfo = this.data.withdrawMethod === 'bank';
    const serviceFee = withdrawAmount <= 0 || !needsBankInfo
      ? 0
      : Math.max(Math.round(Math.round(withdrawAmount * 100) * Number(this.data.withdrawFeeRate)), 100) / 100;
    const actualAmount = Math.max(withdrawAmount - serviceFee, 0);
    const hasBankInfo = !needsBankInfo || (
      String(this.data.bankName || '').trim()
      && String(this.data.bankAccountName || '').trim()
      && String(this.data.bankAccountNo || '').trim()
    );
    const isSubmitEnabled = this.data.hasLoaded && !this.data.loading && !this.data.loadError
      && !this.data.isSubmitting && needsBankInfo && validInput && actualAmount > 0
      && withdrawAmount >= Number(this.data.minWithdrawAmount)
      && withdrawAmount <= maxWithdrawAmount
      && hasBankInfo;

    this.setData({
      serviceFeeLabel: '¥' + serviceFee.toFixed(2),
      actualAmountLabel: '¥' + actualAmount.toFixed(2),
      isSubmitEnabled,
    });
  },

  handleAmountInput(event) {
    this.setData({ withdrawAmountInput: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  chooseMethod(event) {
    if (event.currentTarget.dataset.method !== 'bank') return;
    this.setData({ withdrawMethod: event.currentTarget.dataset.method }, () => this.refreshAmountSummary());
  },

  handleBankInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  async submitWithdraw() {
    if (this.data.isSubmitting) return;
    this.refreshAmountSummary();
    if (!this.data.isSubmitEnabled) {
      wx.showToast({ title: '请先完善提现信息', icon: 'none' });
      return;
    }
    this.setData({ isSubmitting: true, isSubmitEnabled: false });
    try {
      await api.applyWithdraw(
        Math.round((parseFloat(this.data.withdrawAmountInput || '0') || 0) * 100),
        this.data.withdrawMethod,
        this.data.withdrawMethod === 'bank'
          ? {
              bankName: this.data.bankName.trim(),
              accountName: this.data.bankAccountName.trim(),
              accountNo: this.data.bankAccountNo.trim(),
            }
          : null,
      );
      await subscribe.requestSubscribe({ force: true, scene: 'withdraw' });
      wx.showToast({ title: '提现申请已提交', icon: 'success' });
      this.setData({
        withdrawAmountInput: '',
        bankName: '',
        bankAccountName: '',
        bankAccountNo: '',
      });
      await this.loadPage();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '提现失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
      this.refreshAmountSummary();
    }
  },

  openWithdrawRecords() {
    wx.navigateTo({ url: '/pages/distribution/withdraw-records/index' });
  },
});
