const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
const { formatChinaDateTime } = require('../../common/utils/date-time');
const subscribe = require('../../common/utils/subscribe');

const ORDER_STATUS_STEPS = {
  pending: [{ label: '待付款', done: true }, { label: '待取货', done: false }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  paid: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  shipping: [{ label: '待付款', done: true }, { label: '待发货', done: true }, { label: '已发货', done: false }, { label: '已完成', done: false }],
  shipped: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: true }, { label: '已完成', done: false }],
  completed: [{ label: '待付款', done: true }, { label: '待取货', done: true }, { label: '已发货', done: true }, { label: '已完成', done: true }],
  cancelled: [{ label: '已取消', done: true }],
  refund_pending: [{ label: '退款待审核', done: true }],
  refunding: [{ label: '退款处理中', done: true }],
  refunded: [{ label: '已退款', done: true }],
};

const STATUS_LABEL_MAP = {
  pending: '待付款',
  paid: '待取货',
  shipping: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refund_pending: '退款待审核',
  refunding: '退款处理中',
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

function getPaymentErrorMessage(error, canceledText) {
  if (error && error.errMsg) {
    return canceledText;
  }
  if (error && error.message) {
    return error.message;
  }
  return '发起支付失败';
}

async function syncPaidOrder(orderId) {
  if (!orderId) return;
  await api.confirmOrderPayment(orderId);
}

Page({
  onUnload() {
    this._unloaded = true;
    if (this.paymentInProgress) wx.hideLoading();
    this._loadRequestId = (this._loadRequestId || 0) + 1;
  },

  data: {
    loading: true,
    order: null,
    logisticsList: [],
    logisticsMessage: '',
  },

  onLoad(options) {
    this._unloaded = false;
    const orderId = options && options.id;
    if (!orderId) {
      wx.navigateBack();
      return;
    }
    this.orderId = String(orderId);
    this.hasLoaded = false;
    this.loadOrder(this.orderId, { silent: false });
  },

  onShow() {
    if ((!this.hasLoaded && !this._needsReload) || !this.orderId) {
      return;
    }
    this.loadOrder(this.orderId, { silent: true });
  },

  formatPriceYuan(value) {
    return '¥' + (Number(value || 0) / 100).toFixed(2);
  },

  normalizeOrder(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const shippingAddress = order.shippingAddress || {};
    return {
      id: String(order.id || ''),
      status: order.status || '',
      statusLabel: STATUS_LABEL_MAP[order.status] || (order.status || ''),
      steps: ORDER_STATUS_STEPS[order.status] || [],
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
      createdAtText: order.createdAt ? formatChinaDateTime(order.createdAt, false) : '',
      payAtText: order.payAt ? formatChinaDateTime(order.payAt, false) : '',
      payMethod: order.payMethod || '',
      payMethodLabel: ({ wechat: '小程序微信支付', wechat_native: '门店微信扫码', wechat_micropay: '门店付款码支付', cash: '现金', bank: '银行转账' })[order.payMethod] || order.payMethod || '',
      shippingAddress,
      deliveryMethodText: shippingAddress.deliveryMethod === 'pickup_pending' ? '到店自取（待到货）' : ['pickup', 'offline'].includes(shippingAddress.deliveryMethod) ? '到店自提' : '快递邮寄',
      actionFlags: {
        canCancel: order.status === 'pending',
        canPay: order.status === 'pending' && !['wechat_native', 'wechat_micropay', 'cash', 'bank'].includes(order.payMethod),
        canConfirmReceipt: order.status === 'shipped',
        canRefund: ['paid', 'processing', 'shipping', 'shipped'].includes(order.status),
      },
    };
  },

  async loadOrder(orderId, options = {}) {
    if (this._unloaded) return;
    const requestId = this._loadRequestId = (this._loadRequestId || 0) + 1;
    const silent = Boolean(options.silent);
    this.setData({ loading: silent ? this.data.loading : true });
    try {
      const detailResponse = await api.getOrderDetail(orderId);
      if (requestId !== this._loadRequestId) return;
      const rawOrder = (detailResponse && detailResponse.data) || detailResponse || null;
      const order = this.normalizeOrder(rawOrder || {});
      let logisticsList = [];
      let logisticsMessage = '';
      if (order.status === 'shipped' || order.status === 'completed') {
        try {
          const logisticsResponse = await api.getOrderLogistics(orderId);
          const logisticsPayload = (logisticsResponse && logisticsResponse.data) || logisticsResponse || {};
          logisticsMessage = logisticsPayload.message || '暂无物流轨迹';
          logisticsList = (logisticsPayload.steps || []).map((step, index) => ({
            time: step.time || '',
            desc: step.desc || step.status || '',
            isFirst: index === 0,
          }));
        } catch (error) {
          logisticsList = [];
          logisticsMessage = '物流信息加载失败，请稍后重试';
        }
      }
      if (requestId !== this._loadRequestId) return;
      this.setData({ loading: false, order, logisticsList, logisticsMessage });
      this.hasLoaded = true;
      this._needsReload = false;
    } catch (error) {
      if (requestId !== this._loadRequestId) return;
      console.error(error);
      wx.showToast({ title: (error && error.message) || '订单详情加载失败', icon: 'none' });
      const unauthorized = error && [401, 403].includes(Number(error.statusCode || (error.data && error.data.code)));
      const retain = silent && !unauthorized;
      if (unauthorized) {
        this.hasLoaded = false;
        this._needsReload = true;
      }
      this.setData({
        loading: false,
        order: retain ? this.data.order : null,
        logisticsList: retain ? this.data.logisticsList : [],
        logisticsMessage: retain ? this.data.logisticsMessage : '',
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
    if (this._unloaded || !order || !order.actionFlags.canPay || this.paymentInProgress) return;
    const generation = sessionStore.getLoginGeneration();
    const assertCurrentSession = () => {
      if (sessionStore.getLoginGeneration() !== generation) {
        throw new Error('登录状态已变化，请重新进入订单');
      }
    };
    this.paymentInProgress = true;
    wx.showLoading({ title: '发起支付...' });
    try {
      const payResponse = await api.payOrder(order.id);
      if (this._unloaded) return;
      assertCurrentSession();
      const payParams = (payResponse && payResponse.data) || payResponse || {};
      wx.hideLoading();
      await requestWxPay(payParams);
      if (this._unloaded) return;
      assertCurrentSession();
      wx.showLoading({ title: '同步订单状态...' });
      await syncPaidOrder(order.id);
      if (this._unloaded) return;
      assertCurrentSession();
      wx.hideLoading();
      await subscribe.requestSubscribe({ force: true, scene: 'order' });
      if (this._unloaded) return;
      wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
      await this.loadOrder(order.id);
    } catch (error) {
      if (this._unloaded) return;
      wx.hideLoading();
      wx.showToast({
        title: getPaymentErrorMessage(error, '支付未完成'),
        icon: 'none',
      });
    } finally {
      this.paymentInProgress = false;
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
