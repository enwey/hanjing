const api = require('../../api/index');

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

const DEFAULT_CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'device', label: '健康用品' },
  { key: 'accessory', label: '配件耗材' },
  { key: 'service', label: '服务套餐' },
];

function isNotFoundError(error) {
  return !!(error && (error.statusCode === 404 || (error.data && error.data.code === 404)));
}

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

function getMemberDiscountRate(level) {
  return MEMBER_DISCOUNT_RATE_MAP[String(level || 'normal')] || 1;
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
  const category = String(rawCategory || '').trim().toLowerCase();
  if (category === 'product') {
    return 'accessory';
  }
  return category || 'service';
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
    selectedCategory: 'all',
    categories: DEFAULT_CATEGORY_TABS,
    products: [],
    visibleProducts: [],
    leftColumnProducts: [],
    rightColumnProducts: [],
    navbarHeight: 88,
    memberLevel: 'normal',
  },

  async onShow() {
    await this.loadProducts({ silent: this.data.hasLoaded });
  },

  onLoad() {
    this.imageLoadFailedMap = {};
    try {
      const windowInfo = wx.getWindowInfo();
      const statusBarHeight = windowInfo.statusBarHeight || 44;
      this.setData({ navbarHeight: statusBarHeight + 44 });
    } catch (error) {
      console.error(error);
    }
  },

  async loadProducts(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const hasToken = !!wx.getStorageSync('access_token');
      let categoryList = [];
      try {
        const categoryResponse = await api.getProductCategories();
        categoryList = unwrapList(categoryResponse)
          .map((item) => ({
            key: normalizeCategory(item.code || item.key),
            label: item.name || item.label || '',
          }))
          .filter((item) => item.key && item.key !== 'all' && item.label);
      } catch (categoryError) {
        if (!isNotFoundError(categoryError)) {
          throw categoryError;
        }
      }
      const [productResponse, memberInfoResponse] = await Promise.all([
        api.getProducts(),
        hasToken ? api.getMemberInfo().catch(() => null) : Promise.resolve(null),
      ]);
      const memberLevel = memberInfoResponse && memberInfoResponse.code === 0 && memberInfoResponse.data
        ? (memberInfoResponse.data.currentLevel || memberInfoResponse.data.memberLevel || 'normal')
        : 'normal';
      const products = unwrapList(productResponse).map((item) => applyMemberPricing(normalizeProduct(item), memberLevel));
      this.imageLoadFailedMap = {};
      const nextCategories = [{ key: 'all', label: '全部' }].concat(categoryList.length ? categoryList : DEFAULT_CATEGORY_TABS.slice(1));
      const selectedCategoryExists = nextCategories.some((item) => item.key === this.data.selectedCategory);
      this.setData({
        products,
        hasLoaded: true,
        categories: nextCategories,
        memberLevel,
        selectedCategory: selectedCategoryExists ? this.data.selectedCategory : 'all',
      });
      this.refreshVisibleProducts(selectedCategoryExists ? this.data.selectedCategory : 'all', products);
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          products: [],
          visibleProducts: [],
          leftColumnProducts: [],
          rightColumnProducts: [],
        });
      } else {
        this.setData({ loading: false });
      }
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
    const showImage = !!product.imageUrl && !this.imageLoadFailedMap[String(product.id)];
    return {
      ...product,
      showImage,
      priceLabel: formatPriceYuan(product.price),
      originalPriceLabel: formatPriceYuan(product.originalPrice),
      hasDiscount,
      discountPercent: hasDiscount ? Math.round((1 - product.price / product.originalPrice) * 100) : 0,
      salesLabel: salesCount >= 1000 ? (salesCount / 1000).toFixed(1) + 'k' : String(salesCount),
      categoryColor: CATEGORY_COLORS[product.category] || '#f3f4f6',
    };
  },

  handleProductImageError(event) {
    const productId = String(event.currentTarget.dataset.productId || '');
    if (!productId || this.imageLoadFailedMap[productId]) {
      return;
    }
    this.imageLoadFailedMap[productId] = true;
    this.refreshVisibleProducts(this.data.selectedCategory);
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
