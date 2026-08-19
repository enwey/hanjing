const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
const navigation = require('../../common/utils/navigation');

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
  try {
    await api.confirmOrderPayment(orderId);
  } catch (error) {}
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
    quantity: 1,
    isSubmitting: false,
    totalPayAmountText: '¥0.00',
    contactName: '',
    phone: '',
    detailAddress: '',
    memberLevel: 'normal',
  },

  onLoad(options) {
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
    if (!this.productId || !this.data.hasLoaded) {
      return;
    }
    this.loadProduct(this.productId, { silent: true });
  },

  async loadProduct(productId, options = {}) {
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
      console.error(error);
      if (!this.data.hasLoaded) {
        wx.showToast({ title: (error && error.message) || '获取商品详情失败', icon: 'none' });
        this.setData({
          loading: false,
          product: null,
          galleryImages: [],
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
    this.setData({
      totalPayAmountText: this.formatPriceYuan(this.getTotalPayAmount()),
    });
  },

  async openCheckout() {
    if (!sessionStore.isLoggedIn()) {
      navigation.openLogin('/pages/product/detail?id=' + encodeURIComponent(String(this.productId || '')));
      return;
    }
    this.setData({ showCheckout: true });
  },

  async handlePrimaryPay() {
    if (!sessionStore.isLoggedIn()) {
      navigation.openLogin('/pages/product/detail?id=' + encodeURIComponent(String(this.productId || '')));
      return;
    }
    if (this.validateAddress(true)) {
      await this.submitOrder();
      return;
    }
    await this.openCheckout();
  },

  closeCheckout() {
    this.setData({ showCheckout: false });
  },

  noop() {},

  async onCheckoutSubmitTap() {
    await this.submitOrder();
  },

  increaseQty() {
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
    });
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

  openAddressPermissionSettings() {
    wx.openSetting({
      success: (settingResult) => {
        if (settingResult && settingResult.authSetting && settingResult.authSetting['scope.address']) {
          this.chooseWxAddress();
          return;
        }
        wx.showToast({ title: '未开启通讯地址权限，可继续手动填写', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '请在设置中开启通讯地址权限', icon: 'none' });
      },
    });
  },

  handleChooseWxAddressFail(error) {
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
          if (result.confirm) {
            this.openAddressPermissionSettings();
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
          if (result.confirm) {
            this.openAddressPermissionSettings();
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

  onChooseWxAddress(event) {
    const detail = event && event.detail ? event.detail : {};
    if (detail && (detail.errMsg === 'chooseAddress:ok' || detail.userName)) {
      this.fillAddressFromWechat(detail);
      wx.showToast({ title: '已填充微信地址', icon: 'success' });
      return;
    }
    this.handleChooseWxAddressFail(detail);
  },

  async chooseWxAddress() {
    if (typeof wx.chooseAddress !== 'function') {
      wx.showToast({ title: '当前环境暂不支持选择微信地址', icon: 'none' });
      return;
    }
    try {
      const permissionState = await this.getAddressPermissionState();
      if (permissionState === false) {
        wx.showModal({
          title: '需要地址权限',
          content: '请先开启微信通讯地址权限，然后直接从微信地址中选择收货信息。',
          confirmText: '去开启',
          cancelText: '取消',
          success: (result) => {
            if (result.confirm) {
              this.openAddressPermissionSettings();
            }
          },
        });
        return;
      }
      if (permissionState === undefined && typeof wx.authorize === 'function') {
        try {
          await this.requestAddressPermission();
        } catch (authError) {
          this.handleChooseWxAddressFail(authError);
          return;
        }
      }
      wx.showLoading({ title: '读取微信地址...' });
      const result = await this.tryChooseWxAddress();
      wx.hideLoading();
      this.fillAddressFromWechat(result || {});
      wx.showToast({ title: '已填充微信地址', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      this.handleChooseWxAddressFail(error);
    }
  },

  onInputName(event) { this.setData({ contactName: event.detail.value || '' }); },
  onInputPhone(event) { this.setData({ phone: event.detail.value || '' }); },
  onInputDetail(event) { this.setData({ detailAddress: event.detail.value || '' }); },

  validateAddress(silent) {
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

  async submitOrder() {
    if (this.data.isSubmitting || !this.data.product) return;
    if (!this.validateAddress(false)) return;
    this.setData({ isSubmitting: true });
    try {
      wx.showLoading({ title: '发起支付...' });
      const createOrderResponse = await api.createOrder({
        items: [{ productId: String(this.data.product.id), quantity: this.data.quantity }],
        shippingAddress: {
          contactName: this.data.contactName,
          phone: this.data.phone,
          detailAddress: this.data.detailAddress,
          deliveryMethod: 'online',
        },
      });
      const createdOrder = (createOrderResponse && createOrderResponse.data) || createOrderResponse || {};
      const orderId = createdOrder.id;
      const payResponse = await api.payOrder(orderId);
      const payParams = (payResponse && payResponse.data) || payResponse || {};
      wx.hideLoading();
      if (payParams.mockPayment) {
        wx.showLoading({ title: '开发环境模拟支付...' });
        await api.confirmOrderPayment(orderId);
        wx.hideLoading();
      } else {
        await requestWxPay(payParams);
        wx.showLoading({ title: '同步订单状态...' });
        await syncPaidOrder(orderId);
        wx.hideLoading();
      }
      wx.showToast({ title: '支付已提交', icon: 'success' });
      this.setData({ showCheckout: false });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/order/detail?id=' + orderId });
      }, 300);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: getPaymentErrorMessage(error, '支付未完成'),
        icon: 'none',
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },
});
