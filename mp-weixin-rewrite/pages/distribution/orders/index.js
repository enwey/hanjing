const api = require('../../../api/index');

const STATUS_LABEL_MAP = {
  all: '全部',
  settled: '已结算',
  pending: '冻结中',
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
  return {
    id: String(order.id || ''),
    productImage: order.productImage || '',
    productName: order.productName || '',
    buyerName: order.buyerName || '',
    dateLabel: String(order.createdAt || '').slice(0, 10),
    orderAmount,
    commissionAmount,
    orderAmountLabel: '订单 ' + '¥' + (orderAmount / 100).toFixed(2),
    commissionAmountLabel: '佣金 +' + (commissionAmount / 100).toFixed(2),
    status: order.status || '',
    statusLabel: STATUS_LABEL_MAP[order.status] || order.status || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedStatus: 'all',
    statusTabs: Object.keys(STATUS_LABEL_MAP).map((key) => ({ key, label: STATUS_LABEL_MAP[key] })),
    orders: [],
    visibleOrders: [],
    summary: {
      orderCount: '0',
      orderAmountLabel: '',
      commissionAmountLabel: '',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getDistributionOrders();
      const orders = unwrapList(response).map(normalizeDistributionOrder);
      this.setData({ loading: false, orders });
      this.refreshVisibleOrders(this.data.selectedStatus, orders);
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载推广订单失败',
        orders: [],
        visibleOrders: [],
      });
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
