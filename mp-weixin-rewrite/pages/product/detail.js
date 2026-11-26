const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
const navigation = require('../../common/utils/navigation');
const subscribe = require('../../common/utils/subscribe');
const { isPaymentTimeout, prepareOrderPayment, reconcileOrderPayment } = require('../../common/utils/order-payment');

function checkoutInput(data) {
  return {
    items: [{ productId: String(data.product.id), quantity: data.quantity }],
    shippingAddress: {
      contactName: data.contactName,
      phone: data.phone,
      detailAddress: data.detailAddress,
      deliveryMethod: 'online',
    },
  };
}

const CATEGORY_COLORS = {
  device: '#d9e6ff',
  accessory: '#dff4e8',
  service: '#fff1d6',
};

const MEMBER_DISCOUNT_RATE_MAP = {
  normal: 1,
  silver: 0.95,
  gold: 0.9,
  diamond: 0.85,
};

function getMemberDiscountRate(level) {
  return MEMBER_DISCOUNT_RATE_MAP[String(level || 'normal')] || 1;
}

function parseMarkdownToHtml(markdown) {
  if (!markdown) return '';
  let html = String(markdown);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(
    /!\[(.*?)\]\((.*?)\)/g,
    '<img src="$2" alt="$1" style="max-width: 100%; display: block; margin: 12px auto; border-radius: 8px;" />',
  );
  html = html.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" style="color: #3B6BF5; text-decoration: underline;">$1</a>',
  );
  html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 14px; font-weight: 700; margin: 16px 0 8px 0; color: #1F2937;">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 16px; font-weight: 700; margin: 18px 0 10px 0; color: #1F2937;">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 18px; font-weight: 700; margin: 20px 0 12px 0; color: #111827;">$1</h1>');
  html = html.replace(/^\- (.*?)$/gm, '<li style="margin-left: 18px; list-style-type: disc;">$1</li>');
  return html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<br/>';
      if (
        trimmed.indexOf('<h') === 0 ||
        trimmed.indexOf('<li') === 0 ||
        trimmed.indexOf('<img') === 0 ||
        trimmed.indexOf('<a') === 0 ||
        trimmed.indexOf('<p') === 0
      ) {
        return line;
      }
      return '<p style="margin-bottom: 8px; color: #4b5563; line-height: 1.8;">' + line + '</p>';
    })
    .join('\n');
}

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

async function syncPaidOrder(orderId) {
  if (!orderId) return;
  await api.confirmOrderPayment(orderId);
}

function normalizeAddressText(result) {
  const detailText = result.detailInfoNew || result.detailInfo || result.streetName || '';
  const parts = [
    result.provinceName || '',
    result.cityName || '',
    result.countyName || '',
    detailText,
  ];
  return parts.join('').trim();
}

function normalizeCategory(rawCategory) {
  const category = String(rawCategory || '').trim().toLowerCase();
  if (category === 'product') {
    return 'accessory';
  }
  return category || 'service';
}

function applyMemberPricing(product, memberLevel) {
  const basePrice = Number(product.price || 0);
  const configuredOriginalPrice = Number(product.originalPrice || 0);
  const effectivePrice = Math.round(basePrice * getMemberDiscountRate(memberLevel));
  const effectiveOriginalPrice = Math.max(configuredOriginalPrice, basePrice);
  return Object.assign({}, product, {
    price: effectivePrice,
    originalPrice: effectiveOriginalPrice,
    basePrice,
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    product: null,
    galleryImages: [],
    galleryBackground: '#fff1d6',
    currentImageIndex: 0,
    hasDiscount: false,
    discountText: '',
    displayPrice: '¥0.00',
    displayOriginalPrice: '¥0.00',
    displaySalesCount: '0',
    showCheckout: false,
    priceReview: null,
    quantity: 1,
    isSubmitting: false,
    totalPayAmountText: '¥0.00',
    contactName: '',
    phone: '',
    detailAddress: '',
    memberLevel: 'normal',
  },

  onLoad(options) {
    this._unloaded = false;
    this.syncCheckoutSession();
    this.imageLoadFailedMap = {};
    const productId = options && options.id;
    if (!productId) {
      wx.navigateBack();
      return;
    }
    this.productId = String(productId);
    this.hasLoaded = false;
    this.loadProduct(this.productId, { silent: false });
  },

  onShow() {
    this.syncCheckoutSession();
    if (wx.requestSubscribeMessage) void subscribe.refreshSubscribeSettings();
    if (!this.productId || (!this.data.hasLoaded && !this.data.loadError)) {
      return;
    }
    this.loadProduct(this.productId, { silent: true });
  },

  async loadProduct(productId, options = {}) {
    if (this._unloaded) return;
    const requestId = this._loadRequestId = (this._loadRequestId || 0) + 1;
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const hasToken = sessionStore.isLoggedIn();
      const [response, memberInfoResponse] = await Promise.all([
        api.getProductDetail(productId),
        hasToken ? api.getMemberInfo().catch(() => null) : Promise.resolve(null),
      ]);
      if (this._unloaded || requestId !== this._loadRequestId) return;
      const rawProduct = (response && response.data) || response || null;
      if (!rawProduct) {
        throw new Error('商品不存在');
      }
      const memberLevel = memberInfoResponse && memberInfoResponse.code === 0 && memberInfoResponse.data
        ? (memberInfoResponse.data.currentLevel || memberInfoResponse.data.memberLevel || 'normal')
        : 'normal';
      const galleryImages = Array.isArray(rawProduct.galleryUrls)
        ? rawProduct.galleryUrls.filter(Boolean)
        : [];
      const resolvedImages = galleryImages.length
        ? galleryImages
        : (rawProduct.imageUrl ? [rawProduct.imageUrl] : []);
      const category = normalizeCategory(rawProduct.category || rawProduct.categoryName);
      this.imageLoadFailedMap = {};
      const product = applyMemberPricing({
        id: String(rawProduct.id || ''),
        name: rawProduct.name || '',
        category,
        categoryColor: CATEGORY_COLORS[category] || '#f3f4f6',
        imageUrl: rawProduct.imageUrl || '',
        galleryUrls: resolvedImages,
        price: Number(rawProduct.price || 0),
        originalPrice: Number(rawProduct.originalPrice || 0),
        salesCount: Number(rawProduct.salesCount || 0),
        descriptionHtml: parseMarkdownToHtml(rawProduct.description || ''),
      }, memberLevel);
      this.setData({
        hasLoaded: true,
        loading: false,
        loadError: '',
        memberLevel,
        product,
        galleryImages: resolvedImages,
        galleryBackground: product.categoryColor,
        hasDiscount: product.originalPrice > product.price && product.price > 0,
        discountText: product.originalPrice > product.price && product.price > 0
          ? Math.round((1 - product.price / product.originalPrice) * 100) + '% OFF'
          : '',
        displayPrice: this.formatPriceYuan(product.price),
        displayOriginalPrice: this.formatPriceYuan(product.originalPrice),
        displaySalesCount: this.formatSalesCount(product.salesCount),
      }, () => this.refreshCheckoutView());
    } catch (error) {
      if (this._unloaded || requestId !== this._loadRequestId) return;
      console.error(error);
      const notFound = Number(error?.statusCode || error?.data?.code) === 404;
      if (!this.data.hasLoaded || notFound) {
        wx.showToast({ title: (error && error.message) || '获取商品详情失败', icon: 'none' });
        this.setData({
          loading: false,
          hasLoaded: false,
          product: null,
          galleryImages: [],
          currentImageIndex: 0,
          showCheckout: false,
          loadError: (error && error.message) || '获取商品详情失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '获取商品详情失败', icon: 'none' });
    }
  },

  onSwiperChange(event) {
    this.setData({ currentImageIndex: event.detail.current || 0 });
  },

  handleGalleryImageError(event) {
    const imageUrl = String(event.currentTarget.dataset.imageUrl || '');
    if (!imageUrl || this.imageLoadFailedMap[imageUrl]) {
      return;
    }
    this.imageLoadFailedMap[imageUrl] = true;
    const galleryImages = (this.data.galleryImages || []).filter((item) => String(item) !== imageUrl);
    const nextIndex = galleryImages.length
      ? Math.min(this.data.currentImageIndex, galleryImages.length - 1)
      : 0;
    const nextProduct = this.data.product && String(this.data.product.imageUrl || '') === imageUrl
      ? { ...this.data.product, imageUrl: '' }
      : this.data.product;
    this.setData({
      galleryImages,
      currentImageIndex: nextIndex,
      product: nextProduct,
    });
  },

  formatPriceYuan(value) {
    return '¥' + (Number(value || 0) / 100).toFixed(2);
  },

  formatSalesCount(value) {
    const count = Number(value || 0);
    return count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
  },

  getTotalPayAmount() {
    return this.data.product ? Number(this.data.product.price || 0) * Number(this.data.quantity || 1) : 0;
  },

  refreshCheckoutView() {
    this.setData({ totalPayAmountText: this.formatPriceYuan(this.getTotalPayAmount()) });
  },

  openCheckout() {
    this.syncCheckoutSession();
    if (!this.data.product) return;
    if (!sessionStore.isLoggedIn()) {
      navigation.openLogin('/pages/product/detail?id=' + encodeURIComponent(String(this.productId || '')));
      return;
    }
    this.refreshCheckoutView();
    this.setData({ showCheckout: true });
  },

  closeCheckout() {
    this._priceReview = null;
    this.setData({ showCheckout: false, priceReview: null });
  },

  showCheckoutPriceReview(previousAmount, amount, fingerprint, revision) {
    this._priceReview = { amount, fingerprint, revision };
    this.setData({
      showCheckout: true,
      priceReview: { previous: this.formatPriceYuan(previousAmount), current: this.formatPriceYuan(amount) },
    });
  },

  async confirmCheckoutPrice() {
    if (this.data.isSubmitting || !this._priceReview) return;
    const review = this._priceReview;
    this._priceReview = null;
    this.setData({ priceReview: null });
    await this.submitOrder(review);
  },

  openOrderDetail(orderId, notice) {
    wx.navigateTo({ url: '/pages/order/detail?id=' + encodeURIComponent(orderId) + '&notice=' + notice });
  },

  noop() {},

  async onCheckoutSubmitTap() {
    await this.submitOrder();
  },

  increaseQty() {
    if (this.data.quantity >= 99) {
      wx.showToast({ title: '同一商品最多购买99件', icon: 'none' });
      return;
    }
    this.setData({ quantity: this.data.quantity + 1 }, () => this.refreshCheckoutView());
  },

  decreaseQty() {
    if (this.data.quantity <= 1) return;
    this.setData({ quantity: this.data.quantity - 1 }, () => this.refreshCheckoutView());
  },

  fillAddressFromWechat(result) {
    this.setData({
      contactName: result.userName || '',
      phone: result.telNumber || '',
      detailAddress: normalizeAddressText(result),
    }, () => this.refreshCheckoutView());
  },

  syncCheckoutSession() {
    const generation = sessionStore.getLoginGeneration();
    if (this.checkoutGeneration !== undefined && this.checkoutGeneration !== generation) {
      this._priceReview = null;
      this.setData({ contactName: '', phone: '', detailAddress: '', showCheckout: false, priceReview: null });
    }
    this.checkoutGeneration = generation;
    return generation;
  },

  getAddressPermissionState() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (result) => {
          const authSetting = result && result.authSetting ? result.authSetting : {};
          resolve(authSetting['scope.address']);
        },
        fail: () => resolve(undefined),
      });
    });
  },

  requestAddressPermission() {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.address',
        success: resolve,
        fail: reject,
      });
    });
  },

  tryChooseWxAddress() {
    return new Promise((resolve, reject) => {
      wx.chooseAddress({
        success: resolve,
        fail: reject,
      });
    });
  },

  openAddressPermissionSettings(isCurrent) {
    wx.openSetting({
      success: (settingResult) => {
        if (!isCurrent()) return;
        if (settingResult && settingResult.authSetting && settingResult.authSetting['scope.address']) {
          this.chooseWxAddress();
          return;
        }
        wx.showToast({ title: '未开启通讯地址权限，可继续手动填写', icon: 'none' });
      },
      fail: () => {
        if (!isCurrent()) return;
        wx.showToast({ title: '请在设置中开启通讯地址权限', icon: 'none' });
      },
    });
  },

  handleChooseWxAddressFail(error, isCurrent) {
    const errMsg = error && error.errMsg ? String(error.errMsg) : '';
    console.error('[chooseWxAddress] failed:', error);
    if (errMsg.indexOf('cancel') >= 0) {
      return;
    }
    if (errMsg.indexOf('api not supported') >= 0 || errMsg.indexOf('function not exist') >= 0) {
      wx.showToast({
        title: '开发者工具不支持，请在微信真机中选择地址',
        icon: 'none',
      });
      return;
    }
    if (errMsg.indexOf('auth deny') >= 0 || errMsg.indexOf('authorize no response') >= 0) {
      wx.showModal({
        title: '需要地址权限',
        content: '请选择允许访问微信通讯地址，以便快速填充收货人和地址信息。',
        confirmText: '去开启',
        cancelText: '手动填写',
        success: (result) => {
          if (result.confirm && isCurrent()) {
            this.openAddressPermissionSettings(isCurrent);
          }
        },
      });
      return;
    }
    if (errMsg.indexOf('authorize:fail') >= 0) {
      wx.showModal({
        title: '地址权限未授权',
        content: '请先允许小程序访问微信通讯地址；如果仍失败，请到小程序后台的“开发管理-接口设置”确认已开通收货地址接口。',
        confirmText: '去设置',
        cancelText: '知道了',
        success: (result) => {
          if (result.confirm && isCurrent()) {
            this.openAddressPermissionSettings(isCurrent);
          }
        },
      });
      return;
    }
    wx.showToast({
      title: errMsg ? '选择微信地址失败' : '当前环境暂不支持选择微信地址',
      icon: 'none',
    });
  },

  async chooseWxAddress() {
    if (this._unloaded) return;
    const generation = this.syncCheckoutSession();
    const isCurrent = () => !this._unloaded && this.syncCheckoutSession() === generation;
    if (typeof wx.chooseAddress !== 'function') {
      wx.showToast({ title: '当前环境暂不支持选择微信地址', icon: 'none' });
      return;
    }
    try {
      const permissionState = await this.getAddressPermissionState();
      if (!isCurrent()) return;
      if (permissionState === false) {
        wx.showModal({
          title: '需要地址权限',
          content: '请先开启微信通讯地址权限，然后直接从微信地址中选择收货信息。',
          confirmText: '去开启',
          cancelText: '取消',
          success: (result) => {
            if (result.confirm && isCurrent()) {
              this.openAddressPermissionSettings(isCurrent);
            }
          },
        });
        return;
      }
      if (permissionState === undefined && typeof wx.authorize === 'function') {
        try {
          await this.requestAddressPermission();
        } catch (authError) {
          if (isCurrent()) this.handleChooseWxAddressFail(authError, isCurrent);
          return;
        }
      }
      if (!isCurrent()) return;
      wx.showLoading({ title: '读取微信地址...' });
      const result = await this.tryChooseWxAddress();
      if (!this._unloaded) wx.hideLoading();
      if (!isCurrent()) return;
      this.fillAddressFromWechat(result || {});
      wx.showToast({ title: '已填充微信地址', icon: 'success' });
    } catch (error) {
      if (!this._unloaded) wx.hideLoading();
      if (isCurrent()) this.handleChooseWxAddressFail(error, isCurrent);
    }
  },

  onInputName(event) { this.syncCheckoutSession(); this.setData({ contactName: event.detail.value || '' }, () => this.refreshCheckoutView()); },
  onInputPhone(event) { this.syncCheckoutSession(); this.setData({ phone: event.detail.value || '' }, () => this.refreshCheckoutView()); },
  onInputDetail(event) { this.syncCheckoutSession(); this.setData({ detailAddress: event.detail.value || '' }, () => this.refreshCheckoutView()); },

  validateAddress(silent) {
    this.syncCheckoutSession();
    if (!String(this.data.contactName || '').trim()) {
      if (!silent) wx.showToast({ title: '请填写收货人', icon: 'none' });
      return false;
    }
    if (!/^1\d{10}$/.test(String(this.data.phone || ''))) {
      if (!silent) wx.showToast({ title: '请填写正确手机号', icon: 'none' });
      return false;
    }
    if (!String(this.data.detailAddress || '').trim()) {
      if (!silent) wx.showToast({ title: '请填写详细地址', icon: 'none' });
      return false;
    }
    return true;
  },

  showCheckoutPaymentResult(orderId, { order, confirmed, closed, unpaid }) {
    if (closed || unpaid) return;
    this.closeCheckout();
    this.openOrderDetail(orderId, confirmed || order?.payAt ? 'paymentSubmitted' : 'paymentPending');
  },

  async submitOrder(approvedPrice) {
    if (this._unloaded || !this.data.showCheckout || this.data.isSubmitting || this._priceReview || !this.data.product) return;
    if (!Number.isSafeInteger(this.data.quantity) || this.data.quantity < 1 || this.data.quantity > 99) {
      wx.showToast({ title: '购买数量应为1至99的整数', icon: 'none' });
      return;
    }
    if (!this.validateAddress(false)) return;
    const revision = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && sessionStore.getLoginGeneration() === revision;
    const orderInput = checkoutInput(this.data);
    const fingerprint = JSON.stringify(orderInput);
    const expectedPayAmount = approvedPrice?.revision === revision && approvedPrice.fingerprint === fingerprint
      ? approvedPrice.amount : this.getTotalPayAmount();
    // A new user confirmation gets a new key. Transport retries of this request keep the same key.
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    let paymentOrderId;
    let walletOpened = false;
    let loading = false;
    const showLoading = title => {
      loading = true;
      wx.showLoading({ title, mask: true });
    };
    const hideLoading = () => {
      if (!loading) return;
      loading = false;
      if (!this._unloaded) wx.hideLoading();
    };

    this.setData({ isSubmitting: true });
    try {
      if (wx.requestSubscribeMessage && expectedPayAmount === 0) {
        await subscribe.requestSubscribe({ force: true, scene: 'order', fromTap: true });
        if (!isCurrent()) return;
      }
      showLoading('发起支付...');
      const createResponse = await api.createOrder({ ...orderInput, requestId, expectedPayAmount });
      if (!isCurrent()) return;
      const createdOrder = createResponse?.data || createResponse || {};
      if (!createdOrder.id) throw new Error('未取得订单编号，请在订单列表核对');
      const orderId = String(createdOrder.id);
      if (Number(createdOrder.payAmount) === 0) {
        hideLoading();
        this.closeCheckout();
        this.openOrderDetail(orderId, 'orderSubmitted');
        return;
      }

      paymentOrderId = orderId;
      const { response, resolution } = await prepareOrderPayment(
        api, orderId, { expectedPayAmount }, isCurrent, order => order?.status === 'pending'
      );
      if (!isCurrent()) return;
      hideLoading();
      if (resolution) {
        this.showCheckoutPaymentResult(orderId, resolution);
        return;
      }
      const payParams = response?.data || response || {};
      if (payParams.alreadyPaid) {
        this.showCheckoutPaymentResult(orderId, { confirmed: true });
        return;
      }
      const actualPayAmount = Number(payParams.payAmount);
      if (!Number.isSafeInteger(actualPayAmount) || actualPayAmount <= 0) throw new Error('未取得有效的支付金额');
      if (actualPayAmount !== expectedPayAmount) {
        this.showCheckoutPriceReview(expectedPayAmount, actualPayAmount, fingerprint, revision);
        return;
      }

      walletOpened = true;
      await requestWxPay(payParams, () => {
        if (wx.requestSubscribeMessage && isCurrent()) {
          return subscribe.requestSubscribe({ force: true, scene: 'order', fromTap: true });
        }
      });
      if (!isCurrent()) return;
      showLoading('同步订单状态...');
      await syncPaidOrder(orderId);
      if (!isCurrent()) return;
      hideLoading();
      this.showCheckoutPaymentResult(orderId, { confirmed: true });
    } catch (error) {
      if (!isCurrent()) return;
      const reason = error?.data?.reason;
      const changedAmount = error?.data?.data?.payAmount;
      if (reason === 'ORDER_AMOUNT_CHANGED' && Number.isSafeInteger(changedAmount) && changedAmount >= 0) {
        hideLoading();
        this.showCheckoutPriceReview(expectedPayAmount, changedAmount, fingerprint, revision);
        return;
      }
      if (paymentOrderId && (walletOpened || isPaymentTimeout(error) || reason === 'ORDER_PAYMENT_PENDING')) {
        showLoading('核对支付状态...');
        const resolution = await reconcileOrderPayment(api, paymentOrderId, isCurrent).catch(() => ({}));
        if (!isCurrent()) return;
        hideLoading();
        this.showCheckoutPaymentResult(paymentOrderId, resolution);
        return;
      }
      hideLoading();
      wx.showToast({ title: getPaymentErrorMessage(error, '支付未完成'), icon: 'none', duration: 3500 });
    } finally {
      hideLoading();
      if (!this._unloaded) this.setData({ isSubmitting: false });
    }
  },
  onUnload() {
    this._unloaded = true;
    this._loadRequestId = (this._loadRequestId || 0) + 1;
    if (this.data.isSubmitting) wx.hideLoading();
  },
});
