const api = require('../../api/index');

const ORDER_STATUS_STEPS = {
  pending: [{ label: '待付款', done: true }, { label: '待取货', done: false }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  paid: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  shipping: [{ label: '待付款', done: true }, { label: '待发货', done: true }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  shipped: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: true }, { label: '已完成', done: false }],
  completed: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: true }, { label: '已完成', done: true }],
  cancelled: [{ label: '已取消', done: true }],
  refunding: [{ label: '退款审核中', done: true }],
  refunded: [{ label: '已退款', done: true }],
};

const STATUS_LABEL_MAP = {
  pending: '待付款',
  paid: '待取货',
  shipping: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款审核中',
  refunded: '已退款',
  confirmed: '已确认',
};

function requestWxPay(payParams) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: resolve,
      fail: reject,
    });
  });
}

Page({
  data: {
    loading: true,
    order: null,
    logisticsList: [],
  },

  onLoad(options) {
    const orderId = options && options.id;
    if (!orderId) {
      wx.navigateBack();
      return;
    }
    this.loadOrder(orderId);
  },

  formatPriceYuan(value) {
    return '¥' + (Number(value || 0) / 100).toFixed(2);
  },

  normalizeOrder(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const shippingAddress = order.shippingAddress || {};
    return {
      id: String(order.id || ''),
      status: order.status || 'pending',
      statusLabel: STATUS_LABEL_MAP[order.status] || (order.status || ''),
      steps: ORDER_STATUS_STEPS[order.status] || ORDER_STATUS_STEPS.pending,
      items: items.map((item) => ({
        productId: String(item.productId || item.id || ''),
        productName: item.productName || item.name || '',
        quantity: Number(item.quantity || 0),
        productImage: item.productImage || item.imageUrl || '',
        priceLabel: this.formatPriceYuan(item.price || 0),
      })),
      totalAmountLabel: this.formatPriceYuan(order.totalAmount || 0),
      discountAmountLabel: this.formatPriceYuan(order.discountAmount || 0),
      payAmountLabel: this.formatPriceYuan(order.payAmount || 0),
      hasDiscount: Number(order.discountAmount || 0) > 0,
      orderNo: order.orderNo || '',
      createdAtText: order.createdAt ? String(order.createdAt).slice(0, 16).replace('T', ' ') : '',
      payAtText: order.payAt ? String(order.payAt).slice(0, 16).replace('T', ' ') : '',
      payMethod: order.payMethod || '',
      shippingAddress,
      deliveryMethodText: shippingAddress.deliveryMethod === 'pickup' ? '到店自提' : '快递邮寄',
      actionFlags: {
        canCancel: order.status === 'pending',
        canPay: order.status === 'pending',
        canConfirmReceipt: order.status === 'shipped',
        canRefund: order.status === 'paid' || order.status === 'shipping',
      },
    };
  },

  async loadOrder(orderId) {
    this.setData({ loading: true });
    try {
      const detailResponse = await api.getOrderDetail(orderId);
      const rawOrder = (detailResponse && detailResponse.data) || detailResponse || null;
      const order = this.normalizeOrder(rawOrder || {});
      let logisticsList = [];
      if (order.status === 'shipped' || order.status === 'completed') {
        try {
          const logisticsResponse = await api.getOrderLogistics(orderId);
          const logisticsPayload = (logisticsResponse && logisticsResponse.data) || logisticsResponse || {};
          logisticsList = (logisticsPayload.steps || []).map((step, index) => ({
            time: step.time || '',
            desc: step.desc || step.status || '',
            isFirst: index === 0,
          }));
        } catch (error) {
          logisticsList = [];
        }
      }
      this.setData({ loading: false, order, logisticsList });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: (error && error.message) || '订单详情加载失败', icon: 'none' });
      this.setData({
        loading: false,
        order: null,
        logisticsList: [],
      });
    }
  },

  async onCancelOrder() {
    const order = this.data.order;
    if (!order) return;
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.cancelOrder(order.id);
          wx.showToast({ title: '订单已取消', icon: 'success' });
          await this.loadOrder(order.id);
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '取消失败', icon: 'none' });
        }
      },
    });
  },

  async onPayOrder() {
    const order = this.data.order;
    if (!order) return;
    wx.showLoading({ title: '发起支付...' });
    try {
      const payResponse = await api.payOrder(order.id);
      const payParams = (payResponse && payResponse.data) || payResponse || {};
      wx.hideLoading();
      if (payParams.mockPayment) {
        wx.showLoading({ title: '开发环境模拟支付...' });
        await api.confirmOrderPayment(order.id);
        wx.hideLoading();
      } else {
        await requestWxPay(payParams);
      }
      wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
      await this.loadOrder(order.id);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: error && error.errMsg ? '支付未完成，可稍后继续支付' : '发起支付失败，请稍后重试',
        icon: 'none',
      });
    }
  },

  async onConfirmReceipt() {
    const order = this.data.order;
    if (!order) return;
    wx.showModal({
      title: '提示',
      content: '确定已收到商品吗？',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.confirmReceipt(order.id);
          wx.showToast({ title: '已确认收货', icon: 'success' });
          await this.loadOrder(order.id);
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '确认失败', icon: 'none' });
        }
      },
    });
  },

  async onApplyRefund() {
    const order = this.data.order;
    if (!order) return;
    const reasons = ['不想要了', '商品信息不符', '地址或自提信息有误', '其他原因'];
    wx.showActionSheet({
      itemList: reasons,
      success: async (result) => {
        const reason = reasons[result.tapIndex] || '其他原因';
        try {
          await api.applyRefund(order.id, { reason });
          wx.showToast({ title: '退款申请已提交', icon: 'success' });
          await this.loadOrder(order.id);
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '申请失败', icon: 'none' });
        }
      },
    });
  },
});
