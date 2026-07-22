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
  return {
    id: String(order.id || ''),
    productName: order.productName || '',
    buyerName,
    dateLabel,
    metaLabel: buyerName && dateLabel ? buyerName + ' | ' + dateLabel : buyerName || dateLabel,
    commissionLabel: '+' + (Number(order.commission || 0) / 100).toFixed(2),
    statusLabel: ORDER_STATUS_LABEL_MAP[order.status] || order.status || '',
    statusClass: order.status || '',
    productImage: order.productImage || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    totalCommissionLabel: '¥0.00',
    availableCommissionLabel: '¥0.00',
    teamCountLabel: '0',
    actionEntries: ACTION_ENTRIES,
    recentOrders: [],
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [distributorInfoResponse, distributionOrdersResponse] = await Promise.all([
        api.getDistributorInfo(),
        api.getDistributionOrders(),
      ]);
      const distributorInfo = unwrapObject(distributorInfoResponse);
      const orderList = unwrapList(distributionOrdersResponse).slice(0, 5).map(normalizeDistributionOrder);

      this.setData({
        loading: false,
        totalCommissionLabel: formatAmountYuan(distributorInfo.totalCommission || 0),
        availableCommissionLabel: formatAmountYuan(distributorInfo.availableCommission || 0),
        teamCountLabel: String(distributorInfo.teamCount || 0),
        recentOrders: orderList,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载分销数据失败',
        recentOrders: [],
      });
    }
  },

  openEntry(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      return;
    }
    navigation.openPage(url);
  },
});
