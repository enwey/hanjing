const api = require('../../../api/index');

Page({
  data: {
    loading: true,
    loadError: '',
    availableCommissionLabel: '¥0.00',
    totalCommissionLabel: '¥0.00',
    withdrawnAmountLabel: '¥0.00',
    withdrawAmountInput: '',
    withdrawMethod: 'wechat',
    bankName: '',
    bankAccountName: '',
    bankAccountNo: '',
    minWithdrawAmount: 50,
    withdrawFeeRate: 0.01,
    serviceFeeLabel: '¥0.00',
    actualAmountLabel: '¥0.00',
    isSubmitEnabled: false,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getDistributorInfo();
      const info = (response && response.data) || response || {};
      this.setData({
        loading: false,
        availableCommissionCents: Number(info.availableCommission || 0),
        availableCommissionLabel: '¥' + (Number(info.availableCommission || 0) / 100).toFixed(2),
        totalCommissionLabel: '¥' + (Number(info.totalCommission || 0) / 100).toFixed(2),
        withdrawnAmountLabel: '¥' + (Number(info.withdrawnAmount || 0) / 100).toFixed(2),
        minWithdrawAmount: Number(info.minWithdrawAmount || 5000) / 100,
        withdrawFeeRate: Number((info.withdrawFeeRates && info.withdrawFeeRates.bank) || 0.01),
      });
      this.refreshAmountSummary();
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载提现信息失败',
      });
    }
  },

  refreshAmountSummary() {
    const withdrawAmount = parseFloat(this.data.withdrawAmountInput || '0') || 0;
    const maxWithdrawAmount = Number(this.data.availableCommissionCents || 0) / 100;
    const needsBankInfo = this.data.withdrawMethod === 'bank';
    const serviceFee = withdrawAmount <= 0 || !needsBankInfo
      ? 0
      : Math.max(withdrawAmount * Number(this.data.withdrawFeeRate || 0), 1);
    const actualAmount = Math.max(withdrawAmount - serviceFee, 0);
    const hasBankInfo = !needsBankInfo || (
      String(this.data.bankName || '').trim() &&
      String(this.data.bankAccountName || '').trim() &&
      String(this.data.bankAccountNo || '').trim()
    );
    const isSubmitEnabled = withdrawAmount >= Number(this.data.minWithdrawAmount || 0)
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
    this.setData({ withdrawMethod: event.currentTarget.dataset.method }, () => this.refreshAmountSummary());
  },

  handleBankInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value || '' }, () => this.refreshAmountSummary());
  },

  async submitWithdraw() {
    if (!this.data.isSubmitEnabled) {
      wx.showToast({ title: '请先完善提现信息', icon: 'none' });
      return;
    }
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
    }
  },

  openWithdrawRecords() {
    wx.navigateTo({ url: '/pages/distribution/withdraw-records/index' });
  },
});
