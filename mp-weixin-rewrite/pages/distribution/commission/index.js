const api = require('../../../api/index');

const STATUS_LABEL_MAP = {
  settled: '已结算',
  pending: '待结算',
  refunded: '已撤销',
};

const TAB_LIST = [
  { key: 'all', label: '全部' },
  { key: 'settled', label: '已结算' },
  { key: 'pending', label: '待结算' },
  { key: 'refunded', label: '已撤销' },
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

function normalizeCommission(commission) {
  const createdAt = String(commission.createdAt || '');
  const amount = Number(commission.commission || 0);
  return {
    id: String(commission.id || ''),
    productImage: commission.productImage || '',
    productName: commission.productName || '',
    buyerName: commission.buyerName || '',
    dateLabel: createdAt ? createdAt.split('T')[0] : '',
    commissionLevelLabel: Number(commission.commissionLevel || 1) === 2 ? '二级佣金' : '一级佣金',
    commissionAmount: amount,
    commissionAmountLabel: '+' + (amount / 100).toFixed(2),
    status: commission.status || '',
    statusLabel: STATUS_LABEL_MAP[commission.status] || commission.status || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedTab: 'all',
    tabList: TAB_LIST,
    totalCommissionLabel: '¥0.00',
    frozenCommissionLabel: '¥0.00',
    availableCommissionLabel: '¥0.00',
    commissions: [],
    visibleCommissions: [],
    summary: {
      recordCount: '0',
      visibleCommissionLabel: '¥0.00',
      settledCount: '0',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [statsResponse, commissionsResponse] = await Promise.all([
        api.getDistributionCommissionStats(),
        api.getDistributionCommissions(),
      ]);
      const stats = unwrapObject(statsResponse);
      const commissions = unwrapList(commissionsResponse).map(normalizeCommission);
      this.setData({
        loading: false,
        totalCommissionLabel: formatAmountYuan(stats.totalCommission || 0),
        frozenCommissionLabel: formatAmountYuan(stats.frozenCommission || 0),
        availableCommissionLabel: formatAmountYuan(stats.availableCommission || 0),
        commissions,
      });
      this.refreshVisibleCommissions(this.data.selectedTab, commissions);
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载佣金明细失败',
        commissions: [],
        visibleCommissions: [],
      });
    }
  },

  refreshVisibleCommissions(selectedTab, commissions) {
    const sourceList = commissions || this.data.commissions;
    const visibleCommissions = selectedTab === 'all'
      ? sourceList
      : sourceList.filter((commission) => commission.status === selectedTab);
    const visibleCommissionAmount = visibleCommissions.reduce((sum, commission) => sum + Number(commission.commissionAmount || 0), 0);
    const settledCount = visibleCommissions.filter((commission) => commission.status === 'settled').length;

    this.setData({
      selectedTab,
      visibleCommissions,
      summary: {
        recordCount: String(visibleCommissions.length),
        visibleCommissionLabel: formatAmountYuan(visibleCommissionAmount),
        settledCount: String(settledCount),
      },
    });
  },

  handleTabTap(event) {
    const tabKey = String(event.currentTarget.dataset.tabKey || 'all');
    this.refreshVisibleCommissions(tabKey);
  },
});
