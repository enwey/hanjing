const { request } = require('../request');

function getProducts(query) {
  return request({ url: '/products', method: 'GET', data: query, failMessage: '加载商品列表失败' });
}

function getProductDetail(productId) {
  return request({ url: '/products/' + productId, method: 'GET', failMessage: '加载商品详情失败' });
}

module.exports = {
  getProducts,
  getProductDetail
};
