const api = require('../../api/index');
const { formatChinaDateTime } = require('../../common/utils/date-time');

const ARTICLE_CARDS = [
  {
    id: 'sleep-assessment',
    category: '睡眠自测',
    title: '白天总犯困，先从嗜睡程度记录开始',
    summary: '日间困倦不一定只是没睡够。通过 ESS 嗜睡量表记录困倦场景，再结合打卡数据观察变化，更容易了解自己的睡眠状态。',
    icon: '/static/icons/assessment_purple.svg',
    theme: 'purple',
    source: '鼾静健康',
    timeText: '',
    tags: ['ESS量表', '睡眠记录'],
  },
  {
    id: 'snore-recording',
    category: '鼾声记录',
    title: '鼾声强弱变化，可以作为夜间睡眠参考',
    summary: '记录鼾声强弱、持续时间和睡醒后的精神状态，有助于形成连续的个人睡眠观察资料。',
    icon: '/static/icons/microphone.svg',
    theme: 'blue',
    source: '鼾静健康',
    timeText: '',
    tags: ['鼾声分析', '夜间观察'],
  },
  {
    id: 'wear-tracking',
    category: '打卡追踪',
    title: '连续打卡，比单次感受更能看出趋势',
    summary: '把佩戴时长、舒适度、醒后感受持续记录下来，可以帮助你回看每周趋势，而不是只凭当天感觉判断。',
    icon: '/static/icons/treatment_green.svg',
    theme: 'green',
    source: '鼾静健康',
    timeText: '',
    tags: ['佩戴记录', '趋势观察'],
  },
  {
    id: 'daily-habit',
    category: '日常习惯',
    title: '睡前习惯稳定，记录结果才更有参考价值',
    summary: '睡前饮食、作息时间、饮酒和疲劳程度都会影响夜间状态。保持记录条件相对稳定，后续趋势更容易比较。',
    icon: '/static/icons/moon.svg',
    theme: 'amber',
    source: '鼾静健康',
    timeText: '',
    tags: ['作息管理', '睡前习惯'],
  },
];

function formatIntegerWithCommas(value) {
  const text = String(Math.max(0, parseInt(value, 10) || 0));
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function splitTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  return { category: values[0] || '', tags: values.slice(1) };
}

function mapCategory(name) {
  if (name === '阻鼾器配戴') return '使用指南';
  if (name === '睡眠科普') return '睡眠知识';
  if (name === '科普问答') return '知识问答';
  if (name === '专家') return '精选文章';
  if (name === 'OSAHS改善') return '睡眠变化';
  if (name === 'AHI改善') return '夜间变化';
  return name || '睡眠文章';
}

function getArticleIcon(category) {
  if (category === '鼾声记录' || category === '鼾声分析') return '/static/icons/microphone.svg';
  if (category === '打卡追踪' || category === '使用指南') return '/static/icons/treatment_green.svg';
  if (category === '日常习惯') return '/static/icons/moon.svg';
  return '/static/icons/assessment_purple.svg';
}

function getArticleTheme(category) {
  if (category === '鼾声记录' || category === '鼾声分析') return 'blue';
  if (category === '打卡追踪' || category === '使用指南') return 'green';
  if (category === '日常习惯') return 'amber';
  return 'purple';
}

function cleanArticleText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createArticleSummary(item) {
  const summary = cleanArticleText(item.summary || item.description);
  if (summary) return summary;

  const content = cleanArticleText(item.content);
  return content.length > 88 ? content.slice(0, 88) + '...' : content;
}

function normalizeArticle(item) {
  const tagInfo = splitTags(item.tags);
  const category = mapCategory(tagInfo.category);
  const summary = createArticleSummary(item);
  const content = summary;
  const title = item.title || String(content).slice(0, 24) || '睡眠知识';
  return {
    id: String(item.id || title),
    category,
    title,
    summary: content,
    icon: getArticleIcon(category),
    theme: getArticleTheme(category),
    source: '鼾静健康',
    timeText: formatChinaDateTime(item.createdAt || '', false),
    tags: tagInfo.tags.length ? tagInfo.tags.slice(0, 3) : ['睡眠知识'],
    isTop: Boolean(item.isTop),
    createdAt: item.createdAt || '',
  };
}

function sortArticles(articles) {
  return articles.slice().sort((a, b) => {
    if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    patientCountLabel: '10,000+',
    satisfactionRateLabel: '98%',
    articleCards: ARTICLE_CARDS,
  },

  onLoad() {
    this.hasLoaded = false;
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }

    try {
      const [statsResult, articlesResult] = await Promise.allSettled([
        api.getHomeStats(),
        api.getHomeArticles(),
      ]);

      const statsSource = statsResult.status === 'fulfilled'
        ? ((statsResult.value && statsResult.value.data) || statsResult.value || {})
        : {};
      const articleCards = articlesResult.status === 'fulfilled'
        ? sortArticles(unwrapList(articlesResult.value).map(normalizeArticle).filter((item) => item.summary || item.title))
        : [];
      const totalPatients = Number(statsSource.totalPatients || 0);
      const satisfactionRate = Number(statsSource.satisfactionRate || 0);
      const allFailed = statsResult.status === 'rejected' && articlesResult.status === 'rejected';

      this.setData({
        hasLoaded: true,
        loading: false,
        loadError: allFailed ? '加载首页失败' : '',
        patientCountLabel: totalPatients > 0 ? formatIntegerWithCommas(totalPatients) + '+' : '10,000+',
        satisfactionRateLabel: satisfactionRate > 0 ? String(satisfactionRate) + '%' : '98%',
        articleCards: articleCards.length ? articleCards : ARTICLE_CARDS,
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载首页失败',
        });
        return;
      }
      wx.showToast({ title: (error && error.message) || '加载首页失败', icon: 'none' });
    }
  },

  goEssAssessment() {
    wx.navigateTo({ url: '/pages/assessment/questionnaire/index' });
  },

  goSnoreAssessment() {
    wx.navigateTo({ url: '/pages/assessment/recording/index' });
  },

  goTreatmentTab() {
    wx.switchTab({ url: '/pages/treatment/index' });
  },

  openArticleDetail(event) {
    const articleId = String(event.currentTarget.dataset.articleId || '');
    if (!articleId) return;
    wx.navigateTo({ url: '/pages/article/detail/index?id=' + encodeURIComponent(articleId) });
  },
});
