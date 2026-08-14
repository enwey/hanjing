const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function splitTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  return { category: values[0] || '', tags: values.slice(1) };
}

const BLOCKED_ARTICLE_TAG_TERMS = [
  [31038, 21306],
  [31038, 32676],
  [35770, 22363],
  [24086, 23376],
  [21457, 24086],
  [21457, 24067],
  [35780, 35770],
  [22238, 22797],
  [28857, 36190],
  [20114, 21160],
  [20132, 27969],
  [32463, 39564, 20998, 20139],
  [32463, 39564, 20132, 27969],
  [40766, 21451],
].map((codes) => String.fromCharCode.apply(String, codes));

function hasBlockedArticleTerm(value) {
  const text = String(value || '');
  return BLOCKED_ARTICLE_TAG_TERMS.some((term) => text.indexOf(term) > -1);
}

function normalizeArticleTags(tags, limit) {
  return tags
    .map((tag) => String(tag || '').trim())
    .filter((tag) => tag && !hasBlockedArticleTerm(tag))
    .slice(0, limit);
}

function mapCategory(name) {
  if (hasBlockedArticleTerm(name)) return '睡眠文章';
  if (name === '阻鼾器配戴') return '使用指南';
  if (name === '睡眠科普') return '睡眠知识';
  if (name === '科普问答') return '知识问答';
  if (name === '专家') return '精选文章';
  if (name === 'OSAHS改善') return '睡眠变化';
  if (name === 'AHI改善') return '夜间变化';
  return name ? '睡眠文章' : '睡眠文章';
}

function normalizeArticle(detail) {
  const tagInfo = splitTags(detail.tags);
  const category = mapCategory(tagInfo.category);
  const content = detail.content || detail.summary || detail.description || '';
  const title = detail.title || String(content).slice(0, 24) || '睡眠知识';
  const displayTags = normalizeArticleTags(tagInfo.tags, 5);
  return {
    id: String(detail.id || ''),
    category,
    title,
    content,
    source: '鼾静健康',
    timeText: formatChinaDateTime(detail.createdAt || '', false),
    tags: displayTags.length ? displayTags : ['睡眠知识'],
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    article: null,
  },

  onLoad(options = {}) {
    this.articleId = String(options.id || '');
    this.loadArticle();
  },

  async loadArticle() {
    if (!this.articleId) {
      this.setData({ loading: false, loadError: '文章参数缺失' });
      return;
    }

    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getArticleDetail(this.articleId);
      const detail = unwrapObject(response);
      this.setData({
        loading: false,
        article: normalizeArticle(detail),
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载文章详情失败',
      });
    }
  },
});
