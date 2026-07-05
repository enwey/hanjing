"use strict";
const api = require("../../api/index.js");

function parseMarkdownToHtml(markdown) {
  if (!markdown) return "";
  let html = String(markdown);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /!\[(.*?)\]\((.*?)\)/g,
    '<img src="$2" alt="$1" style="max-width: 100%; display: block; margin: 12px auto; border-radius: 8px;" />',
  );
  html = html.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" style="color: #3B6BF5; text-decoration: underline;">$1</a>',
  );
  html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 14px; font-weight: 700; margin: 16px 0 8px 0; color: #1F2937;">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 16px; font-weight: 700; margin: 18px 0 10px 0; color: #1F2937;">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 18px; font-weight: 700; margin: 20px 0 12px 0; color: #111827;">$1</h1>');
  html = html.replace(/^\- (.*?)$/gm, '<li style="margin-left: 18px; list-style-type: disc;">$1</li>');
  return html
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<br/>";
      if (
        trimmed.indexOf("<h") === 0 ||
        trimmed.indexOf("<li") === 0 ||
        trimmed.indexOf("<img") === 0 ||
        trimmed.indexOf("<a") === 0 ||
        trimmed.indexOf("<p") === 0
      ) {
        return line;
      }
      return `<p style="margin-bottom: 8px; color: #4b5563; line-height: 1.8;">${line}</p>`;
    })
    .join("\n");
}

Page({
  data: {
    loading: true,
    product: null,
    galleryImages: [],
    hasDiscount: false,
    discountText: "",
    displayPrice: "",
    displayOriginalPrice: "",
    displaySalesCount: "0",
    currentImageIndex: 0,
    showCheckout: false,
    quantity: 1,
    isSubmitting: false,
    totalPayAmountText: "¥0.00",
    contactName: "",
    phone: "",
    detailAddress: "",
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) {
      wx.navigateBack();
      return;
    }
    this.loadProduct(id);
  },

  async loadProduct(id) {
    this.setData({ loading: true });
    try {
      const res = await api.getProductDetail(id);
      const rawProduct = (res && res.data) || res;
      if (!rawProduct) {
        throw new Error("商品不存在");
      }
      const galleryImages = Array.isArray(rawProduct.galleryUrls)
        ? rawProduct.galleryUrls.filter(Boolean)
        : [];
      const resolvedImages = galleryImages.length
        ? galleryImages
        : rawProduct.imageUrl
          ? [rawProduct.imageUrl]
          : [];
      const product = {
        id: rawProduct.id,
        name: rawProduct.name || "",
        imageUrl: rawProduct.imageUrl || "",
        galleryUrls: resolvedImages,
        price: Number(rawProduct.price || 0),
        originalPrice: Number(rawProduct.originalPrice || 0),
        salesCount: Number(rawProduct.salesCount || 0),
        descriptionHtml: parseMarkdownToHtml(rawProduct.description || ""),
      };
      this.setData({
        product,
        galleryImages: resolvedImages,
        hasDiscount: product.originalPrice > product.price && product.price > 0,
        discountText:
          product.originalPrice > product.price && product.price > 0
            ? `${Math.round(100 * (1 - product.price / product.originalPrice))}% OFF`
            : "",
        displayPrice: this.formatPriceYuan(product.price),
        displayOriginalPrice: this.formatPriceYuan(product.originalPrice),
        displaySalesCount: this.formatSalesCount(product.salesCount),
        loading: false,
      }, () => this.refreshCheckoutView());
    } catch (err) {
      console.error(err);
      wx.showToast({ title: err.message || "获取商品详情失败", icon: "none" });
      this.setData({ loading: false, product: null, galleryImages: [] });
    }
  },

  onSwiperChange(event) {
    this.setData({ currentImageIndex: event.detail.current || 0 });
  },

  formatPriceYuan(value) {
    return `¥${(Number(value || 0) / 100).toFixed(2)}`;
  },

  formatSalesCount(value) {
    const count = Number(value || 0);
    return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  },

  getDiscountAmount() {
    return 0;
  },

  getTotalPayAmount() {
    const product = this.data.product;
    if (!product) return 0;
    return Math.max(0, product.price * this.data.quantity - this.getDiscountAmount());
  },

  async openCheckout() {
    const token = wx.getStorageSync("access_token");
    if (!token) {
      wx.navigateTo({ url: "/pages/auth/login" });
      return;
    }
    this.setData({ showCheckout: true });
  },

  async handlePrimaryPay() {
    const token = wx.getStorageSync("access_token");
    if (!token) {
      wx.navigateTo({ url: "/pages/auth/login" });
      return;
    }
    if (
      String(this.data.contactName || "").trim() &&
      /^1\d{10}$/.test(String(this.data.phone || "")) &&
      String(this.data.detailAddress || "").trim()
    ) {
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

  refreshCheckoutView() {
    this.setData({
      totalPayAmountText: this.formatPriceYuan(this.getTotalPayAmount()),
    });
  },

  increaseQty() {
    this.setData(
      {
        quantity: this.data.quantity + 1,
      },
      () => this.refreshCheckoutView(),
    );
  },

  decreaseQty() {
    if (this.data.quantity <= 1) return;
    this.setData(
      {
        quantity: this.data.quantity - 1,
      },
      () => this.refreshCheckoutView(),
    );
  },

  chooseWxAddress() {
    if (!wx.chooseAddress) {
      wx.showToast({ title: "当前微信版本不支持选择地址", icon: "none" });
      return;
    }
    wx.chooseAddress({
      success: (res) => {
        this.setData({
          contactName: res.userName || "",
          phone: res.telNumber || "",
          detailAddress: `${res.provinceName || ""}${res.cityName || ""}${res.countyName || ""}${res.detailInfo || ""}`,
        });
      },
      fail: () => {
        wx.showToast({ title: "可手动填写收货地址", icon: "none" });
      },
    });
  },

  onInputName(event) {
    this.setData({ contactName: event.detail.value });
  },

  onInputPhone(event) {
    this.setData({ phone: event.detail.value });
  },

  onInputDetail(event) {
    this.setData({ detailAddress: event.detail.value });
  },

  validateAddress() {
    if (!String(this.data.contactName || "").trim()) {
      wx.showToast({ title: "请填写收货人", icon: "none" });
      return false;
    }
    if (!/^1\d{10}$/.test(String(this.data.phone || ""))) {
      wx.showToast({ title: "请填写正确手机号", icon: "none" });
      return false;
    }
    if (!String(this.data.detailAddress || "").trim()) {
      wx.showToast({ title: "请填写详细地址", icon: "none" });
      return false;
    }
    return true;
  },

  requestWxPay(payParams) {
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
  },

  async submitOrder() {
    if (this.data.isSubmitting || !this.data.product) return;
    if (!this.validateAddress()) return;
    this.setData({ isSubmitting: true });
    try {
      wx.showLoading({ title: "发起支付..." });
      const res = await api.createOrder({
        items: [{ productId: String(this.data.product.id), quantity: this.data.quantity }],
        shippingAddress: {
          contactName: this.data.contactName,
          phone: this.data.phone,
          detailAddress: this.data.detailAddress,
          deliveryMethod: "online",
        },
      });
      const orderId = res.data.id;
      const payRes = await api.payOrder(orderId);
      const payParams = payRes.data || payRes;
      wx.hideLoading();
      if (payParams.mockPayment) {
        wx.showLoading({ title: "开发环境模拟支付..." });
        await api.confirmOrderPayment(orderId);
        wx.hideLoading();
      } else {
        await this.requestWxPay(payParams);
      }
      wx.showToast({ title: "支付已提交", icon: "success" });
      this.setData({ showCheckout: false });
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
      }, 300);
    } catch (err) {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: err && err.errMsg ? "支付未完成，可稍后继续支付" : "发起支付失败，请稍后重试", icon: "none" });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },
});
