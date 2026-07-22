const api = require('../../api/index');

const ORDER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款' },
  { key: 'paid', label: '待取货' },
  { key: 'shipping', label: '待发货' },
  { key: 'shipped', label: '已发货' },
  { key: 'completed', label: '已完成' },
];

const ORDER_STATUS_META = {
  pending: { label: '待付款', color: '#f59e0b' },
  paid: { label: '待取货', color: '#3b6bf5' },
  shipping: { label: '待发货', color: '#f59e0b' },
  shipped: { label: '已发货', color: '#8b5cf6' },
  completed: { label: '已完成', color: '#1a9d5c' },
  cancelled: { label: '已取消', color: '#9ca3af' },
  confirmed: { label: '已确认', color: '#3b6bf5' },
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

function formatPriceYuan(priceInCents) {
  return '¥' + (Number(priceInCents || 0) / 100).toFixed(2);
}

function getProductImage(orderItem) {
  if (orderItem.productImage) {
    return orderItem.productImage;
  }
  if (orderItem.imageUrl) {
    return orderItem.imageUrl;
  }
  return '';
}

function normalizeOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    id: String(order.id || ''),
    orderNo: order.orderNo || order.order_no || '',
    status: order.status || 'pending',
    payAmount: Number(order.payAmount || order.totalAmount || 0),
    items: items.map((orderItem) => ({
      productId: String(orderItem.productId || orderItem.id || ''),
      productName: orderItem.productName || orderItem.name || '',
      quantity: Number(orderItem.quantity || 0),
      priceLabel: formatPriceYuan(orderItem.price || 0),
      productImage: getProductImage(orderItem),
    })),
  };
}

Page({
  data: {
    loading: true,
    selectedStatus: 'all',
    orderTabs: ORDER_TABS,
    orders: [],
    visibleOrders: [],
    navbarHeight: 88,
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
    await this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    try {
      const response = await api.getOrders();
      const orders = unwrapList(response).map(normalizeOrder);
      this.setData({ orders });
      this.refreshVisibleOrders(this.data.selectedStatus, orders);
    } catch (error) {
      console.error(error);
      this.setData({
        loading: false,
        orders: [],
        visibleOrders: [],
      });
      wx.showToast({ title: (error && error.message) || '加载订单失败', icon: 'none' });
    }
  },

  refreshVisibleOrders(selectedStatus, orders) {
    const sourceOrders = orders || this.data.orders;
    const visibleOrders = selectedStatus === 'all'
      ? sourceOrders
      : sourceOrders.filter((order) => order.status === selectedStatus);

    this.setData({
      loading: false,
      selectedStatus,
      visibleOrders: visibleOrders.map((order) => {
        const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, color: '#6b7280' };
        return {
          ...order,
          statusLabel: statusMeta.label,
          statusColor: statusMeta.color,
          itemCountLabel: '共 ' + order.items.length + ' 件商品',
          payAmountLabel: formatPriceYuan(order.payAmount),
        };
      }),
    });
  },

  handleTabTap(event) {
    const statusKey = String(event.currentTarget.dataset.statusKey || 'all');
    this.refreshVisibleOrders(statusKey);
  },

  openDetail(event) {
    const orderId = String(event.currentTarget.dataset.orderId || '');
    if (!orderId) {
      return;
    }
    wx.navigateTo({ url: '/pages/order/detail?id=' + orderId });
  },
});
