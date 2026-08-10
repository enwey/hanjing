const api = require('../../../api/index');
const navigation = require('../../../common/utils/navigation');

const ORDER_STATUS_LABEL_MAP = {
  pending: '冻结中',
  settled: '已结算',
  refunded: '已撤销',
};

const ACTION_ENTRIES = [
  { icon: '/static/icons/fee.svg', label: '提现', url: '/pages/distribution/withdraw/index' },
  { icon: '/static/icons/price.svg', label: '佣金明细', url: '/pages/distribution/commission/index' },
  { icon: '/static/icons/community.svg', label: '团队成员', url: '/pages/distribution/team/index' },
  { icon: '/static/icons/paper-plane.svg', label: '邀请好友', url: '/pages/distribution/invite/index' },
];

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

function formatAmountYuan(amountInCents) {
  return '¥' + (Number(amountInCents || 0) / 100).toFixed(2);
}

function normalizeDistributionOrder(order) {
  const createdAt = String(order.createdAt || '');
  const buyerName = order.buyerName || '';
  const dateLabel = createdAt ? createdAt.slice(0, 10) : '';
  const image = order.productImage || '';
  return {
    id: String(order.id || ''),
    name: order.productName || '',
    buyerName,
    dateLabel,
    commissionText: (Number(order.commission || 0) / 100).toFixed(2),
    statusText: ORDER_STATUS_LABEL_MAP[order.status] || order.status || '',
    statusClass: order.status || '',
    image,
    hasImage: Boolean(image),
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    totalCommissionLabel: '¥0.00',
    availableCommissionLabel: '¥0.00',
    teamCountLabel: '0',
    actionEntries: ACTION_ENTRIES,
    recentOrders: [],
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
      const [distributorInfoResponse, distributionOrdersResponse, distributionRulesResponse] = await Promise.all([
        api.getDistributorInfo(),
        api.getDistributionOrders(),
        api.getDistributionRules(),
      ]);
      const distributorInfo = unwrapObject(distributorInfoResponse);
      const orderList = unwrapList(distributionOrdersResponse).slice(0, 5).map(normalizeDistributionOrder);
      const rulesPayload = unwrapObject(distributionRulesResponse);

      this.setData({
        hasLoaded: true,
        loading: false,
        totalCommissionLabel: formatAmountYuan(distributorInfo.totalCommission || 0),
        availableCommissionLabel: formatAmountYuan(distributorInfo.availableCommission || 0),
        teamCountLabel: String(distributorInfo.teamCount || 0),
        recentOrders: orderList,
        qualificationText: rulesPayload.qualificationText || '',
        commissionRules: rulesPayload.commissionRules || [],
        promotionWays: rulesPayload.promotionWays || [],
        withdrawRules: rulesPayload.withdrawRules || [],
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载分销数据失败',
          recentOrders: [],
        });
      } else {
        this.setData({ loading: false });
      }
      wx.showToast({ title: '加载分销数据失败', icon: 'none' });
    }
  },

  async openEntry(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      return;
    }
    navigation.openPage(url);
  },
});
