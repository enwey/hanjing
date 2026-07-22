const api = require('../../api/index');

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'device', label: '医疗器械' },
  { key: 'accessory', label: '配件耗材' },
  { key: 'service', label: '服务套餐' },
];

const CATEGORY_COLORS = {
  device: '#d9e6ff',
  accessory: '#dff4e8',
  service: '#fff1d6',
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

function getPrimaryImage(product) {
  if (product.imageUrl) {
    return product.imageUrl;
  }
  if (product.coverUrl) {
    return product.coverUrl;
  }
  if (product.cover) {
    return product.cover;
  }
  if (Array.isArray(product.images) && product.images.length) {
    return product.images[0];
  }
  return '';
}

function normalizeCategory(rawCategory) {
  const category = String(rawCategory || '').toLowerCase();
  if (category.includes('device') || category.includes('器械')) {
    return 'device';
  }
  if (category.includes('accessory') || category.includes('耗材') || category.includes('配件')) {
    return 'accessory';
  }
  if (category.includes('service') || category.includes('服务')) {
    return 'service';
  }
  return 'service';
}

function normalizeProduct(product) {
  return {
    id: String(product.id || ''),
    name: product.name || '',
    category: normalizeCategory(product.category || product.categoryName),
    imageUrl: getPrimaryImage(product),
    price: Number(product.price || 0),
    originalPrice: Number(product.originalPrice || 0),
    salesCount: Number(product.salesCount || 0),
  };
}

Page({
  data: {
    loading: true,
    selectedCategory: 'all',
    categories: CATEGORY_TABS,
    products: [],
    visibleProducts: [],
    leftColumnProducts: [],
    rightColumnProducts: [],
    navbarHeight: 88,
  },

  async onShow() {
    await this.loadProducts();
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

  async loadProducts() {
    this.setData({ loading: true });
    try {
      const response = await api.getProducts();
      const products = unwrapList(response).map(normalizeProduct);
      this.setData({ products });
      this.refreshVisibleProducts(this.data.selectedCategory, products);
    } catch (error) {
      this.setData({
        loading: false,
        products: [],
        visibleProducts: [],
        leftColumnProducts: [],
        rightColumnProducts: [],
      });
      wx.showToast({ title: (error && error.message) || '商品加载失败', icon: 'none' });
    }
  },

  refreshVisibleProducts(selectedCategory, products) {
    const nextProducts = products || this.data.products;
    const visibleProducts = selectedCategory === 'all'
      ? nextProducts
      : nextProducts.filter((product) => product.category === selectedCategory);

    this.setData({
      loading: false,
      selectedCategory,
      visibleProducts,
      leftColumnProducts: visibleProducts
        .filter((_, index) => index % 2 === 0)
        .map((product) => this.decorateProduct(product)),
      rightColumnProducts: visibleProducts
        .filter((_, index) => index % 2 === 1)
        .map((product) => this.decorateProduct(product)),
    });
  },

  decorateProduct(product) {
    const salesCount = Number(product.salesCount || 0);
    const hasDiscount = product.originalPrice > product.price && product.price > 0;
    return {
      ...product,
      priceLabel: formatPriceYuan(product.price),
      originalPriceLabel: formatPriceYuan(product.originalPrice),
      hasDiscount,
      discountPercent: hasDiscount ? Math.round((1 - product.price / product.originalPrice) * 100) : 0,
      salesLabel: salesCount >= 1000 ? (salesCount / 1000).toFixed(1) + 'k' : String(salesCount),
      categoryColor: CATEGORY_COLORS[product.category] || '#f3f4f6',
      placeholderIcon:
        product.category === 'device'
          ? '/static/icons/tab-treatment-active.png'
          : product.category === 'service'
            ? '/static/icons/tab-appointment-active.png'
            : '/static/icons/tab-profile-active.png',
    };
  },

  handleCategoryTap(event) {
    const categoryKey = String(event.currentTarget.dataset.categoryKey || 'all');
    this.refreshVisibleProducts(categoryKey);
  },

  openDetail(event) {
    const productId = String(event.currentTarget.dataset.productId || '');
    if (!productId) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/detail?id=' + productId });
  },
});
