const api = require('../../../api/index');

const STATUS_LABEL_MAP = {
  all: '全部',
  pending: '待结算',
  settled: '已结算',
  refunded: '已撤销',
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

function normalizeDistributionOrder(order) {
  const orderAmount = Number(order.orderAmount || 0);
  const commissionAmount = Number(order.commission || 0);
  const status = order.status || '';
  return {
    id: String(order.id || ''),
    orderNo: order.orderNo || '',
    productImage: order.productImage || '',
    productName: order.productName || '',
    buyerName: order.buyerName || '',
    dateLabel: String(order.createdAt || '').slice(0, 10),
    orderAmount,
    commissionAmount,
    orderAmountLabel: '¥' + (orderAmount / 100).toFixed(2),
    commissionAmountLabel: '¥' + (commissionAmount / 100).toFixed(2),
    status,
    statusLabel: STATUS_LABEL_MAP[status] || status || '',
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    selectedStatus: 'all',
    statusTabs: Object.keys(STATUS_LABEL_MAP).map((key) => ({ key, label: STATUS_LABEL_MAP[key] })),
    orders: [],
    visibleOrders: [],
    navbarHeight: 88,
    summary: {
      orderCount: '0',
      orderAmountLabel: '',
      commissionAmountLabel: '',
    },
  },

  onLoad() {
    try {
      const windowInfo = wx.getWindowInfo();
      const statusBarHeight = windowInfo.statusBarHeight || 44;
      this.setData({ navbarHeight: statusBarHeight + 44 });
    } catch (error) {
      console.error(error);
    }
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
      const response = await api.getDistributionOrders();
      const orders = unwrapList(response).map(normalizeDistributionOrder);
      this.setData({ hasLoaded: true, loading: false, orders });
      this.refreshVisibleOrders(this.data.selectedStatus, orders);
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载推广订单失败',
          orders: [],
          visibleOrders: [],
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载推广订单失败', icon: 'none' });
    }
  },

  refreshVisibleOrders(selectedStatus, orders) {
    const sourceList = orders || this.data.orders;
    const visibleOrders = selectedStatus === 'all'
      ? sourceList
      : sourceList.filter((order) => order.status === selectedStatus);
    const totalOrderAmount = visibleOrders.reduce((sum, order) => sum + Number(order.orderAmount || 0), 0);
    const totalCommissionAmount = visibleOrders.reduce((sum, order) => sum + Number(order.commissionAmount || 0), 0);

    this.setData({
      selectedStatus,
      visibleOrders,
      summary: {
        orderCount: String(visibleOrders.length),
        orderAmountLabel: '¥' + (totalOrderAmount / 100).toFixed(2),
        commissionAmountLabel: '¥' + (totalCommissionAmount / 100).toFixed(2),
      },
    });
  },

  handleTabTap(event) {
    const statusKey = String(event.currentTarget.dataset.statusKey || 'all');
    this.refreshVisibleOrders(statusKey);
  },
});
