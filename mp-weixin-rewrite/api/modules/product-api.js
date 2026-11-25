const { request } = require('../request');

function normalizeProductImages(response, apiBaseUrl) {
  const origin = String(apiBaseUrl || '').replace(/\/api\/v1\/?$/, '');
  if (!/^https?:\/\/[^/]+$/i.test(origin)) return response;
  const image = value => typeof value === 'string' && /^\/uploads\//.test(value) ? origin + value : value;
  const product = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const result = { ...value };
    for (const key of ['imageUrl', 'coverUrl', 'cover']) {
      if (key in result) result[key] = image(result[key]);
    }
    for (const key of ['galleryUrls', 'images']) {
      if (Array.isArray(result[key])) result[key] = result[key].map(image);
    }
    return result;
  };
  if (!response || typeof response !== 'object' || !response.data) return response;
  const data = response.data;
  if (Array.isArray(data)) return { ...response, data: data.map(product) };
  if (Array.isArray(data.list)) return { ...response, data: { ...data, list: data.list.map(product) } };
  return { ...response, data: product(data) };
}

function getProducts(query) {
  return request({ url: '/products', method: 'GET', data: query, failMessage: '加载商品列表失败', transformResponse: normalizeProductImages });
}

function getProductDetail(productId) {
  return request({ url: '/products/' + productId, method: 'GET', failMessage: '加载商品详情失败', transformResponse: normalizeProductImages });
}

function getProductCategories() {
  return request({ url: '/product-categories', method: 'GET', failMessage: '加载商品分类失败' });
}

module.exports = {
  getProducts,
  getProductDetail,
  getProductCategories
};
