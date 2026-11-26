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

const REFUND_PROGRESS = { refund_pending: 1, refunding: 2, refunded: 3 };

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

function requestWxPay(payParams, onPaid) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: () => resolve(onPaid()),
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
  return [400, 401, 403, 404, 409].includes(Number(error?.statusCode || error?.data?.code));
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
    checkoutNotice: '',
    paymentPending: false,
    checkingPayment: false,
  },

  onLoad(options) {
    this._unloaded = false;
    const orderId = options && options.id;
    if (!orderId) {
      wx.navigateBack();
      return;
    }
    this.orderId = String(orderId);
    const notice = options.notice;
    try {
      const owner = sessionStore.state.profile?.id || wx.getStorageSync('account_cache_owner');
      if (owner) {
        this.paymentPendingKey = 'order_payment_pending:' + encodeURIComponent(owner) + ':' + encodeURIComponent(this.orderId);
        this.setData({ paymentPending: wx.getStorageSync(this.paymentPendingKey) === true });
      }
    } catch (_) {
      // The navigation notice still works without local storage.
    }
    if (notice === 'paymentSubmitted' || notice === 'orderSubmitted') {
      this.checkoutSuccess = notice === 'paymentSubmitted' ? '支付已提交' : '订单已提交';
      this.setPaymentPending(false);
    } else if (notice === 'paymentPending') {
      this.setPaymentPending(true);
    } else if (notice === 'priceChanged' || notice === 'reviewOrder') {
      this.setData({
        checkoutNotice: notice === 'priceChanged'
          ? '金额已变化，请核对下方实付款金额后再支付。'
          : '请在原订单中确认状态或取消订单。',
      });
    }
    this.hasLoaded = false;
    this.loadOrder(this.orderId, { silent: false });
  },

  setPaymentPending(pending) {
    this.setData({ paymentPending: pending });
    try {
      if (this.paymentPendingKey) {
        if (pending) wx.setStorageSync(this.paymentPendingKey, true);
        else wx.removeStorageSync(this.paymentPendingKey);
      }
    } catch (_) {
      // Keep the notice visible on the current page if local storage is unavailable.
    }
  },

  onReady() {
    if (!this.checkoutSuccess) return;
    wx.showToast({ title: this.checkoutSuccess, icon: 'success', duration: 2000 });
    this.checkoutSuccess = '';
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
    this.setPaymentPending(false);
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
      this.lastPaidOrder = null;
      this.confirmedOrderAction = null;
      this.refundRejection = null;
      this.checkoutSuccess = '';
      this.paymentPendingKey = '';
      this.hasLoaded = false;
      this._needsReload = true;
      this.setData({ loading: false, loadError: '', order: null, logisticsList: [], logisticsMessage: '',
        checkoutNotice: '', paymentPending: false, checkingPayment: false });
    }
    this.orderDetailGeneration = generation;
    return generation;
  },

  async loadOrder(orderId, options = {}) {
    if (this._unloaded) return;
    // Applying a reconciliation snapshot must not supersede an in-flight detail read.
    const requestId = options.rawOrder
      ? this._loadRequestId
      : (this._loadRequestId = (this._loadRequestId || 0) + 1);
    const generation = this.syncOrderDetailSession();
    const silent = Boolean(options.silent);
    const isCurrent = () => requestId === this._loadRequestId && generation === this.syncOrderDetailSession() &&
      (!options.isCurrent || options.isCurrent());
    this.setData({ loading: silent ? this.data.loading : true });
    try {
      const detailResponse = options.rawOrder || await api.getOrderDetail(orderId);
      if (!isCurrent()) return;
      const rawOrder = (detailResponse && detailResponse.data) || detailResponse || null;
      let order = this.normalizeOrder(rawOrder || {});
      const displayed = this.data.order;
      const action = this.confirmedOrderAction;
      const rejectedAt = Date.parse(order.shippingAddress.refund_rejected_at);
      const previousRejection = this.refundRejection?.id === order.id ? this.refundRejection.at : 0;
      const refundRejected = rejectedAt > previousRejection;
      if (displayed?.id === order.id) {
        const staleShipping = (order.status === 'shipping' && ['shipped', 'completed'].includes(displayed.status)) ||
          (order.status === 'shipped' && displayed.status === 'completed');
        const appliedAt = Date.parse(order.shippingAddress.refund_applied_at);
        const staleRejectedRefund = REFUND_PROGRESS[order.status] && previousRejection &&
          !(appliedAt > previousRejection);
        const stalePendingAfterRefund = displayed.status === 'refunded' && order.status === 'pending';
        const staleRefund = ['refunding', 'refunded'].includes(displayed.status) &&
          order.actionFlags.canRefund && !refundRejected;
        const staleRefundProgress = REFUND_PROGRESS[order.status] < REFUND_PROGRESS[displayed.status];
        if (staleShipping || staleRefund || staleRefundProgress || staleRejectedRefund || stalePendingAfterRefund) {
          this.setData({ loading: false, loadError: '' });
          return displayed;
        }
      }
      if (refundRejected) {
        this.refundRejection = { id: order.id, at: rejectedAt };
      } else if (this.refundRejection?.id !== order.id) {
        this.refundRejection = null;
      }
      const paid = this.lastPaidOrder;
      if (order.status === 'pending' && paid?.id === order.id) {
        order = paid;
      } else if (['paid', 'processing', 'shipping', 'shipped', 'completed'].includes(order.status)) {
        this.lastPaidOrder = order;
      } else {
        this.lastPaidOrder = null;
      }
      order = this.withConfirmedPayment(order);
      if (action?.id === order.id && order.actionFlags[action.flag] &&
          !(action.flag === 'canRefund' && refundRejected)) {
        order = this.withOrderActionStatus(order, action.status);
      } else if (action?.id !== order.id || order.status !== action.status) {
        this.confirmedOrderAction = null;
      }
      const hasLogistics = order.status === 'shipped' || order.status === 'completed';
      const keepLogistics = hasLogistics && displayed?.id === order.id &&
        displayed.shippingAddress?.tracking_number === order.shippingAddress.tracking_number;
      const displayedId = this._displayedOrderRequestId = (this._displayedOrderRequestId || 0) + 1;
      if (order.status !== 'pending' && this.data.paymentPending) this.setPaymentPending(false);
      this.setData({
        loading: false,
        loadError: '',
        order,
        logisticsList: keepLogistics ? this.data.logisticsList : [],
        logisticsMessage: hasLogistics ? '物流信息加载中…' : '',
      });
      this.hasLoaded = true;
      this._needsReload = false;
      if (hasLogistics) {
        void this.loadLogistics(orderId, () => !this._unloaded &&
          generation === this.syncOrderDetailSession() && this._displayedOrderRequestId === displayedId &&
          this.data.order?.id === order.id && ['shipped', 'completed'].includes(this.data.order.status));
      }
      return order;
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      const message = error?.message || '订单详情加载失败';
      if (!options.quiet) wx.showToast({ title: message, icon: 'none' });
      const unavailable = [401, 403, 404].includes(Number(error?.statusCode || error?.data?.code));
      const retain = silent && !unavailable && this.data.order;
      if (retain) {
        this.setData({ loading: false, loadError: '' });
      } else {
        this.clearOrderAfterLoadFailure(message);
      }
    }
  },

  clearOrderAfterLoadFailure(message) {
    this.lastPaidOrder = null;
    this.refundRejection = null;
    this.confirmedOrderAction = null;
    this._loadRequestId = (this._loadRequestId || 0) + 1;
    this.hasLoaded = false;
    this._needsReload = true;
    this.setData({ loading: false, loadError: message, order: null, logisticsList: [], logisticsMessage: '' });
  },

  async loadLogistics(orderId, isCurrent) {
    let logisticsMessage;
    let logisticsList = [];
    try {
      const response = await api.getOrderLogistics(orderId);
      const payload = response?.data || response || {};
      logisticsMessage = payload.message || '暂无物流轨迹';
      if (payload.available === false && !payload.steps?.length) {
        if (isCurrent()) this.setData({ logisticsMessage });
        return;
      }
      logisticsList = (payload.steps || []).map((step, index) => ({
        time: step.time || '',
        desc: step.desc || step.status || '',
        isFirst: index === 0,
      }));
    } catch (error) {
      if (isCurrent()) this.setData({ logisticsMessage: '物流信息加载失败，请稍后重试' });
      return;
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
      if (this.data.order.actionFlags[flag]) {
        this.confirmedOrderAction = { id: order.id, flag, status };
        this.setData({ order: this.withOrderActionStatus(this.data.order, status) });
      }
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
    if (this._unloaded || !order || !order.actionFlags.canPay || this.data.paymentPending || this.data.checkingPayment ||
        this.paymentInProgress || this.orderActionInProgress) return;
    const isCurrent = () => !this._unloaded && this.syncOrderDetailSession() === generation;
    const assertCurrentSession = () => {
      if (!isCurrent()) {
        throw new Error('登录状态已变化，请重新进入订单');
      }
    };
    const isCurrentOrder = () => isCurrent() && this.data.order?.id === order.id;
    let walletOpened = false;
    this.paymentInProgress = true;
    try {
      if (this._unloaded) return;
      assertCurrentSession();
      wx.showLoading({ title: '发起支付...' });
      const payResponse = await api.payOrder(order.id, { acceptPaidStatus: true });
      if (this._unloaded) return;
      assertCurrentSession();
      const payParams = (payResponse && payResponse.data) || payResponse || {};
      wx.hideLoading();
      if (payParams.alreadyPaid) {
        if (isCurrentOrder()) {
          this.showConfirmedPayment(order);
          await this.loadOrder(order.id, { silent: true, isCurrent });
        }
        return;
      }
      walletOpened = true;
      await requestWxPay(payParams, () => {
        if (wx.requestSubscribeMessage && isCurrentOrder() &&
            !['pickup', 'pickup_pending', 'offline'].includes(order.shippingAddress?.deliveryMethod)) {
          return subscribe.requestSubscribe({ force: true, scene: 'order', fromTap: true });
        }
      });
      if (this._unloaded) return;
      assertCurrentSession();
      wx.showLoading({ title: '同步订单状态...' });
      await syncPaidOrder(order.id);
      if (this._unloaded) return;
      assertCurrentSession();
      if (!isCurrentOrder()) {
        wx.hideLoading();
        return;
      }
      this.showConfirmedPayment(order);
      wx.hideLoading();
      wx.showToast({ title: '支付已提交', icon: 'success', duration: 2000 });
      await this.loadOrder(order.id, { silent: true, isCurrent });
    } catch (error) {
      if (this._unloaded) return;
      const needsConfirmation = isCurrent() &&
        (walletOpened || isPaymentTimeout(error) || error?.data?.reason === 'ORDER_PAYMENT_PENDING');
      if (needsConfirmation) {
        if (!isCurrentOrder() || this.data.order.status !== 'pending') {
          wx.hideLoading();
          return;
        }
        this.setPaymentPending(true);
        wx.showLoading({ title: '核对支付状态...' });
        const loadBeforeReconciliation = this._loadRequestId;
        const canApplyReconciliation = () => isCurrentOrder() && this.data.order.status === 'pending';
        const { order: latest, confirmed, unpaid, unavailable } = await reconcileOrderPayment(api, order.id, canApplyReconciliation)
          .catch(error => ({ unavailable: error }));
        if (unavailable && canApplyReconciliation() && this._loadRequestId === loadBeforeReconciliation) {
          wx.hideLoading();
          this.clearOrderAfterLoadFailure(unavailable.message || '订单详情加载失败');
          return;
        }
        if (!canApplyReconciliation()) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
        if (confirmed) this.showConfirmedPayment(order);
        if (unpaid) {
          this.setPaymentPending(false);
          wx.hideLoading();
          wx.showToast({ title: '订单尚未支付，可继续支付', icon: 'none', duration: 3500 });
          return;
        }
        // A pending result adds no state and must not invalidate a detail refresh.
        if (latest?.status && latest.status !== 'pending') {
          await this.loadOrder(order.id, { silent: true, rawOrder: latest, isCurrent });
        }
        if (!isCurrent()) return;
        if (confirmed || (latest?.status && latest.status !== 'pending')) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
      }
      if (!needsConfirmation && isCurrentOrder() && shouldRefreshOrderAfterRejection(error)) {
        await this.loadOrder(order.id, { silent: true, quiet: true, isCurrent });
        if (!isCurrent()) {
          if (!this._unloaded) wx.hideLoading();
          return;
        }
      }
      wx.hideLoading();
      if (needsConfirmation) return;
      wx.showToast({
        title: getPaymentErrorMessage(error, '支付未完成'),
        icon: 'none',
        duration: 3500,
      });
    } finally {
      this.paymentInProgress = false;
    }
  },

  async checkPendingPayment() {
    const order = this.data.order;
    if (!order || !this.data.paymentPending || this.data.checkingPayment ||
        this.paymentInProgress || this.orderActionInProgress) return;
    const generation = this.syncOrderDetailSession();
    const isCurrent = () => !this._unloaded && generation === this.syncOrderDetailSession() &&
      this.data.order?.id === order.id;
    if (!isCurrent()) return;
    this.setData({ checkingPayment: true });
    try {
      const { order: latest, confirmed, unpaid } = await reconcileOrderPayment(api, order.id, isCurrent);
      if (!isCurrent()) return;
      if (confirmed) this.showConfirmedPayment(order);
      if (unpaid) this.setPaymentPending(false);
      await this.loadOrder(order.id, { silent: true, rawOrder: latest, isCurrent });
    } catch (error) {
      if (isCurrent()) await this.loadOrder(order.id, { silent: true, isCurrent });
    } finally {
      if (!this._unloaded && generation === this.syncOrderDetailSession()) this.setData({ checkingPayment: false });
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
