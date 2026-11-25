const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadProductApi() {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/api/modules/product-api.js', 'utf8'), {
    module, exports: module.exports,
    require: () => ({ request: options => { calls.push(options); return options; } }),
  });
  return { api: module.exports, calls };
}

test('列表及详情仅将上传图片转为对应 API 源地址', () => {
  const { api } = loadProductApi();
  const list = api.getProducts({}).transformResponse({ code: 0, data: { list: [
    { id: 1, imageUrl: '/uploads/admin/images/products/a.jpg?x=1', galleryUrls: ['/uploads/admin/images/products/b.jpg', 'https://cdn.example/b.jpg', '/static/local.png'] },
  ] } }, 'https://m.xingkangming.com/api/v1');
  assert.equal(list.data.list[0].imageUrl, 'https://m.xingkangming.com/uploads/admin/images/products/a.jpg?x=1');
  assert.equal(list.data.list[0].galleryUrls[0], 'https://m.xingkangming.com/uploads/admin/images/products/b.jpg');
  assert.equal(list.data.list[0].galleryUrls[1], 'https://cdn.example/b.jpg');
  assert.equal(list.data.list[0].galleryUrls[2], '/static/local.png');
  const detail = api.getProductDetail(1).transformResponse({ code: 0, data: { imageUrl: '/uploads/p.jpg', galleryUrls: ['/uploads/q.jpg'] } }, 'http://127.0.0.1:5005/api/v1');
  assert.equal(detail.data.imageUrl, 'http://127.0.0.1:5005/uploads/p.jpg');
  assert.equal(detail.data.galleryUrls[0], 'http://127.0.0.1:5005/uploads/q.jpg');
  assert.equal(api.getProductCategories().transformResponse, undefined);
});

test('商品请求实际使用响应来源转换上传路径', async () => {
  const env = { getApiBaseUrl: () => 'https://m.xingkangming.com/api/v1', getApiBaseUrls: () => ['https://m.xingkangming.com/api/v1'] };
  const wx = { getStorageSync: () => '', request(options) { options.success({ statusCode: 200, data: { code: 0, data: { list: [{ imageUrl: '/uploads/product.jpg' }] } } }); } };
  const requestModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/api/request.js', 'utf8'), {
    module: requestModule, exports: requestModule.exports, wx,
    require: name => name.includes('asset-url') ? require('../../mp-weixin-rewrite/common/config/asset-url') : name.includes('config/env') ? env : name.includes('mini-log') ? { createTraceId: () => 'test' } : {},
  });
  const productModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/api/modules/product-api.js', 'utf8'), {
    module: productModule, exports: productModule.exports, require: () => requestModule.exports,
  });
  const result = await productModule.exports.getProducts({});
  assert.equal(result.data.list[0].imageUrl, 'https://m.xingkangming.com/uploads/product.jpg');
});
