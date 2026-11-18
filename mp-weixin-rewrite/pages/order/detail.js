const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
const { formatChinaDateTime } = require('../../common/utils/date-time');
const subscribe = require('../../common/utils/subscribe');
const { isPaymentTimeout, reconcileOrderPayment } = require('../../common/utils/order-payment');

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
  processing: '待到货',
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

function shouldRefreshOrderAfterRejection(error) {
  return [400, 404, 409].includes(Number(error?.statusCode || error?.data?.code));
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
    loadError: '',
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
    subscribe.refreshSubscribeSettings();
    this.syncOrderDetailSession();
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

  showConfirmedPayment(order) {
    this.confirmedPaymentOrder = { id: order.id, generation: sessionStore.getLoginGeneration() };
    const displayedOrder = this.data.order;
    if (displayedOrder?.id === order.id) {
      this.setData({ order: this.withConfirmedPayment(displayedOrder) });
    }
  },

  withConfirmedPayment(order) {
    const confirmed = this.confirmedPaymentOrder;
    if (order.status !== 'pending' || confirmed?.id !== order.id ||
      confirmed.generation !== sessionStore.getLoginGeneration()) return order;
    return {
      ...order,
      statusLabel: '支付已确认，等待更新',
      steps: [],
      actionFlags: { ...order.actionFlags, canPay: false, canCancel: false },
    };
  },

  withOrderActionStatus(order, status) {
    return {
      ...order,
      status,
      statusLabel: STATUS_LABEL_MAP[status],
      steps: ORDER_STATUS_STEPS[status],
      actionFlags: { canPay: false, canCancel: false, canConfirmReceipt: false, canRefund: false },
    };
  },

  syncOrderDetailSession() {
    const generation = sessionStore.getLoginGeneration();
    if (this.orderDetailGeneration !== undefined && this.orderDetailGeneration !== generation) {
      this.confirmedPaymentOrder = null;
      this.hasLoaded = false;
      this._needsReload = true;
      this.setData({ loading: false, loadError: '', order: null, logisticsList: [], logisticsMessage: '' });
    }
    this.orderDetailGeneration = generation;
    return generation;
  },

  async loadOrder(orderId, options = {}) {
    if (this._unloaded) return;
    const requestId = this._loadRequestId = (this._loadRequestId || 0) + 1;
    const generation = this.syncOrderDetailSession();
    const silent = Boolean(options.silent);
    const isCurrent = () => requestId === this._loadRequestId && generation === this.syncOrderDetailSession() &&
      (!options.isCurrent || options.isCurrent());
    this.setData({ loading: silent ? this.data.loading : true });
    try {
      const detailResponse = options.rawOrder || await api.getOrderDetail(orderId);
      if (!isCurrent()) return;
      const rawOrder = (detailResponse && detailResponse.data) || detailResponse || null;
      const order = this.withConfirmedPayment(this.normalizeOrder(rawOrder || {}));
      const hasLogistics = order.status === 'shipped' || order.status === 'completed';
      this.setData({
        loading: false,
        loadError: '',
        order,
        logisticsList: [],
        logisticsMessage: hasLogistics ? '物流信息加载中…' : '',
      });
      this.hasLoaded = true;
      this._needsReload = false;
      if (hasLogistics) {
        void this.loadLogistics(orderId, () => isCurrent() && this.data.order?.id === order.id &&
          this.data.order.status === order.status);
      }
      return order;
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      const message = error?.message || '订单详情加载失败';
      if (!options.quiet) wx.showToast({ title: message, icon: 'none' });
      const unavailable = [401, 403, 404].includes(Number(error?.statusCode || error?.data?.code));
      const retain = silent && !unavailable && this.data.order;
      if (!retain) {
        this.hasLoaded = false;
        this._needsReload = true;
      }
      this.setData({
        loading: false,
        loadError: retain ? '' : message,
        order: retain ? this.data.order : null,
        logisticsList: retain ? this.data.logisticsList : [],
        logisticsMessage: retain ? this.data.logisticsMessage : '',
      });
    }
  },

  async loadLogistics(orderId, isCurrent) {
    let logisticsMessage;
    let logisticsList = [];
    try {
      const response = await api.getOrderLogistics(orderId);
      const payload = response?.data || response || {};
      logisticsMessage = payload.message || '暂无物流轨迹';
      logisticsList = (payload.steps || []).map((step, index) => ({
        time: step.time || '',
        desc: step.desc || step.status || '',
        isFirst: index === 0,
      }));
    } catch (error) {
      logisticsMessage = '物流信息加载失败，请稍后重试';
    }
    if (isCurrent()) this.setData({ logisticsList, logisticsMessage });
  },

  async onCancelOrder() {
    await this.submitOrderAction({
      flag: 'canCancel',
      ask: resolve => wx.showModal({
        title: '提示',
        content: '确定要取消该订单吗？',
        success: result => resolve(result.confirm),
        fail: () => resolve(false),
      }),
      submit: id => api.cancelOrder(id),
      status: 'cancelled',
      successText: '订单已取消',
      failureText: '取消失败',
    });
  },

  async submitOrderAction({ flag, ask, submit, status, successText, failureText }) {
    const generation = this.syncOrderDetailSession();
    const order = this.data.order;
    if (this._unloaded || !order?.actionFlags[flag] || this.orderActionInProgress || this.paymentInProgress) return;
    const isCurrent = () => !this._unloaded && generation === this.syncOrderDetailSession() &&
      this.data.order?.id === order.id;
    this.orderActionInProgress = true;
    try {
      const choice = await new Promise(ask);
      if (!choice || !isCurrent() || !this.data.order.actionFlags[flag]) return;
      await submit(order.id, choice);
      if (!isCurrent()) return;
      this.setData({ order: this.withOrderActionStatus(this.data.order, status) });
      wx.showToast({ title: successText, icon: 'success' });
      await this.loadOrder(order.id, { silent: true, isCurrent });
    } catch (error) {
      if (!isCurrent()) return;
      if (isPaymentTimeout(error)) {
        const latest = await this.loadOrder(order.id, { silent: true, isCurrent });
        if (!isCurrent()) return;
        const applied = latest?.status === status ||
          (status === 'refund_pending' && ['refunding', 'refunded'].includes(latest?.status));
        wx.showToast({
          title: applied ? successText : '操作结果待确认，请刷新订单',
          icon: applied ? 'success' : 'none',
        });
      } else {
        if (shouldRefreshOrderAfterRejection(error)) {
          await this.loadOrder(order.id, { silent: true, quiet: true, isCurrent });
          if (!isCurrent()) return;
        }
        wx.showToast({ title: error?.message || failureText, icon: 'none' });
      }
    } finally {
      this.orderActionInProgress = false;
    }
  },

  async onPayOrder() {
    const generation = this.syncOrderDetailSession();
    const order = this.data.order;
    if (this._unloaded || !order || !order.actionFlags.canPay || this.paymentInProgress || this.orderActionInProgress) return;
    const isCurrent = () => !this._unloaded && this.syncOrderDetailSession() === generation;
    const assertCurrentSession = () => {
      if (!isCurrent()) {
        throw new Error('登录状态已变化，请重新进入订单');
      }
    };
    this.paymentInProgress = true;
    try {
      await subscribe.requestSubscribe({ force: true, scene: 'order' });
      if (this._unloaded) return;
      assertCurrentSession();
      wx.showLoading({ title: '发起支付...' });
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
      this.showConfirmedPayment(order);
      wx.hideLoading();
      wx.showToast({ title: '支付已提交，请稍后刷新', icon: 'success' });
      await this.loadOrder(order.id, { silent: true, isCurrent });
    } catch (error) {
      if (this._unloaded) return;
      const timedOut = isCurrent() && isPaymentTimeout(error);
      if (timedOut) {
        wx.showLoading({ title: '核对支付状态...' });
        const { order: latest, confirmed } = await reconcileOrderPayment(api, order.id, isCurrent).catch(() => ({}));
        if (!isCurrent()) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
        if (confirmed) this.showConfirmedPayment(order);
        if (latest?.status) await this.loadOrder(order.id, { silent: true, rawOrder: latest, isCurrent });
        if (!isCurrent()) return;
        if (confirmed || (latest?.status && latest.status !== 'pending')) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
      }
      if (!timedOut && isCurrent() && shouldRefreshOrderAfterRejection(error)) {
        await this.loadOrder(order.id, { silent: true, quiet: true, isCurrent });
        if (!isCurrent()) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
      }
      wx.hideLoading();
      wx.showToast({
        title: timedOut ? '支付结果待确认，请刷新订单' : getPaymentErrorMessage(error, '支付未完成'),
        icon: 'none',
      });
    } finally {
      this.paymentInProgress = false;
    }
  },

  async onConfirmReceipt() {
    await this.submitOrderAction({
      flag: 'canConfirmReceipt',
      ask: resolve => wx.showModal({
        title: '提示',
        content: '确定已收到商品吗？',
        success: result => resolve(result.confirm),
        fail: () => resolve(false),
      }),
      submit: id => api.confirmReceipt(id),
      status: 'completed',
      successText: '已确认收货',
      failureText: '确认失败',
    });
  },

  async onApplyRefund() {
    const reasons = ['不想要了', '商品信息不符', '地址或自提信息有误', '其他原因'];
    await this.submitOrderAction({
      flag: 'canRefund',
      ask: resolve => wx.showActionSheet({
        itemList: reasons,
        success: result => resolve(reasons[result.tapIndex] || '其他原因'),
        fail: () => resolve(false),
      }),
      submit: (id, reason) => api.applyRefund(id, { reason }),
      status: 'refund_pending',
      successText: '退款申请已提交',
      failureText: '申请失败',
    });
  },
});
