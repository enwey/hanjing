const api = require('../../../api/index');

Page({
  data: {
    loading: true,
    loadError: '',
    qualificationText: '',
    levels: [],
    commissionRules: [],
    promotionWays: [],
    withdrawRules: [],
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getDistributionRules();
      const payload = (response && response.data) || response || {};
      this.setData({
        loading: false,
        qualificationText: payload.qualificationText || '',
        levels: payload.levels || [],
        commissionRules: payload.commissionRules || [],
        promotionWays: payload.promotionWays || [],
        withdrawRules: payload.withdrawRules || [],
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载分销规则失败',
      });
    }
  },
});
