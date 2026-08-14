const { request } = require('../request');

function getHomeArticles() {
  return request({ url: '/community/posts', method: 'GET', failMessage: '加载文章失败' });
}

function getArticleDetail(articleId) {
  return request({ url: '/community/posts/' + articleId, method: 'GET', failMessage: '加载文章详情失败' });
}

module.exports = { getHomeArticles, getArticleDetail };
