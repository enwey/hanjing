const api = require('../../../api/index');

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    qualificationText: '',
    commissionRules: [],
    promotionWays: [],
    withdrawRules: [],
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const response = await api.getDistributionRules();
      const payload = (response && response.data) || response || {};
      this.setData({
        hasLoaded: true,
        loading: false,
        qualificationText: payload.qualificationText || '',
        commissionRules: payload.commissionRules || [],
        promotionWays: payload.promotionWays || [],
        withdrawRules: payload.withdrawRules || [],
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载分销规则失败',
        });
      } else {
        this.setData({ loading: false });
      }
      wx.showToast({ title: '加载分销规则失败', icon: 'none' });
    }
  },
});
