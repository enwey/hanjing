const api = require('../../../api/index');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeProduct(product) {
  const price = Number(product.price || 0);
  const commission = Number(product.commission || 0);
  const commissionRate = Number(product.commissionRate || 0);
  return {
    id: String(product.id || ''),
    name: product.name || '',
    image: product.image || product.cover || '',
    price,
    commission,
    commissionRate,
    priceLabel: '¥' + (price / 100).toFixed(2),
    commissionRateLabel: commissionRate > 0 ? commissionRate + '%' : '',
    commissionAmountLabel: commission > 0 ? '¥' + (commission / 100).toFixed(2) : '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    products: [],
    summary: {
      productCount: '0',
      averageCommissionRate: '',
      highestCommissionLabel: '',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getDistributionProducts();
      const products = unwrapList(response).map(normalizeProduct);
      const commissionProducts = products.filter((item) => item.commissionRate > 0);
      const averageCommissionRate = commissionProducts.length
        ? (commissionProducts.reduce((sum, item) => sum + item.commissionRate, 0) / commissionProducts.length).toFixed(1) + '%'
        : '';
      const highestCommission = products.reduce((maxValue, item) => Math.max(maxValue, Number(item.commission || 0)), 0);
      this.setData({
        loading: false,
        products,
        summary: {
          productCount: String(products.length),
          averageCommissionRate,
          highestCommissionLabel: highestCommission > 0 ? '¥' + (highestCommission / 100).toFixed(2) : '',
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载推广商品失败',
      });
    }
  },

  openProductDetail(event) {
    const productId = event.currentTarget.dataset.id;
    if (!productId) return;
    wx.navigateTo({ url: '/pages/product/detail?id=' + productId });
  },
});
