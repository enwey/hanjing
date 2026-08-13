const api = require('../../api/index');
const { formatChinaDateTime } = require('../../common/utils/date-time');

const TAB_LIST = [
  { key: 'hot', label: '热门' },
  { key: 'latest', label: '最新' },
  { key: 'expert', label: '精选' },
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
  return { category: values[0] || '', labels: values.slice(1) };
}

function mapCategory(name) {
  if (name === '阻鼾器配戴') return '使用记录';
  if (name === '睡眠科普') return '睡眠知识';
  if (name === '科普问答') return '交流问答';
  if (name === '专家') return '精选内容';
  if (name === 'OSAHS改善') return '睡眠变化';
  if (name === 'AHI改善') return '夜间变化';
  return name || '';
}

function normalizePost(item) {
  const tags = splitTags(item.tags);
  return {
    id: String(item.id || ''),
    isTop: Boolean(item.isTop),
    avatar: item.avatar || '',
    avatarLoaded: false,
    author: item.author || '',
    role: item.role || 'patient',
    roleLabel: item.role === 'doctor' || item.role === 'expert' ? '内容作者' : (item.roleLabel || '鼾友'),
    roleClass: 'role--' + (item.role || 'patient'),
    title: item.title || '',
    content: item.content || '',
    category: mapCategory(tags.category),
    categoryClass: getCategoryClass(tags.category),
    labels: tags.labels,
    likes: Number(item.likes || 0),
    comments: Number(item.comments || item.commentsCount || 0),
    views: Number(item.views || item.viewsCount || 0),
    favorites: Number(item.favorites || item.favoritesCount || 0),
    shares: Number(item.shares || item.sharesCount || 0),
    isLiked: Boolean(item.isLiked),
    likeIcon: Boolean(item.isLiked) ? '/static/icons/heart-active.svg' : '/static/icons/heart.svg',
    likeClass: Boolean(item.isLiked) ? 'liked' : '',
    createdAt: item.createdAt || '',
    displayTime: formatChinaDateTime(item.createdAt || '', false),
  };
}

function getCategoryClass(name) {
  if (['阻鼾器配戴', '睡眠科普', '科普问答', '专家'].includes(name)) return 'tag-theme--blue';
  if (['打鼾改善', '经验分享', '经验交流'].includes(name)) return 'tag-theme--green';
  if (['OSAHS改善', 'AHI改善'].includes(name)) return 'tag-theme--orange';
  if (['适应期', '设备保养'].includes(name)) return 'tag-theme--amber';
  if (['情感支持'].includes(name)) return 'tag-theme--pink';
  return 'tag-theme--violet';
}

function isExpertPost(post) {
  return post.role === 'doctor' || post.role === 'expert' || post.category === '精选内容';
}

function getPostAgeHours(createdAt) {
  if (!createdAt) return 24 * 365;
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return 24 * 365;
  return Math.max(1, (Date.now() - timestamp) / (1000 * 60 * 60));
}

function getHotScore(post) {
  const likes = Number(post.likes || 0);
  const comments = Number(post.comments || 0);
  const views = Number(post.views || 0);
  const favorites = Number(post.favorites || 0);
  const shares = Number(post.shares || 0);
  const ageHours = getPostAgeHours(post.createdAt);
  const interactionScore = likes * 1 + comments * 4 + favorites * 5 + shares * 6 + Math.log1p(views) * 2;
  const qualityBoost = comments > 0 ? 8 : favorites > 0 || shares > 0 ? 4 : likes > 0 ? 2 : 0;
  const freshnessPenalty = Math.pow(ageHours + 2, 0.45);
  return (interactionScore + qualityBoost) / freshnessPenalty;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    patientCountLabel: '10,000+',
    satisfactionRateLabel: '98%',
    posts: [],
    visiblePosts: [],
    activeTab: 'hot',
    tabs: TAB_LIST.map((tab) => Object.assign({}, tab, {
      active: tab.key === 'hot',
      activeClass: tab.key === 'hot' ? 'community-tab--active' : '',
    })),
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
      const [statsResult, postsResult] = await Promise.allSettled([
        api.getHomeStats(),
        api.getCommunityPosts(),
      ]);

      const statsSource = statsResult.status === 'fulfilled'
        ? ((statsResult.value && statsResult.value.data) || statsResult.value || {})
        : {};
      const posts = postsResult.status === 'fulfilled' ? unwrapList(postsResult.value).map(normalizePost) : [];
      const totalPatients = Number(statsSource.totalPatients || 0);
      const satisfactionRate = Number(statsSource.satisfactionRate || 0);
      const allFailed = statsResult.status === 'rejected' && postsResult.status === 'rejected';

      this.setData({
        hasLoaded: true,
        loading: false,
        loadError: allFailed ? '加载首页失败' : '',
        patientCountLabel: totalPatients > 0 ? formatIntegerWithCommas(totalPatients) + '+' : '10,000+',
        satisfactionRateLabel: satisfactionRate > 0 ? String(satisfactionRate) + '%' : '98%',
        posts,
      });
      this.refreshVisiblePosts(this.data.activeTab, posts);
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

  goPublishPost() {
    wx.navigateTo({ url: '/pages/community/publish/index' });
  },

  openFeaturedPost(event) {
    const postId = String(event.currentTarget.dataset.postId || '');
    if (!postId) return;
    wx.navigateTo({ url: '/pages/community/detail/index?id=' + postId });
  },

  refreshVisiblePosts(activeTab, posts) {
    const sourcePosts = posts || this.data.posts;
    let visiblePosts = sourcePosts.slice();
    if (activeTab === 'expert') {
      visiblePosts = visiblePosts.filter((post) => isExpertPost(post));
      visiblePosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (activeTab === 'latest') {
      visiblePosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      visiblePosts.sort((a, b) => {
        const hotDiff = getHotScore(b) - getHotScore(a);
        if (hotDiff !== 0) return hotDiff;
        const commentDiff = Number(b.comments || 0) - Number(a.comments || 0);
        if (commentDiff !== 0) return commentDiff;
        const likeDiff = Number(b.likes || 0) - Number(a.likes || 0);
        if (likeDiff !== 0) return likeDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    visiblePosts = visiblePosts.filter((post) => post.isTop).concat(visiblePosts.filter((post) => !post.isTop));
    this.setData({
      activeTab,
      tabs: TAB_LIST.map((tab) => Object.assign({}, tab, {
        active: tab.key === activeTab,
        activeClass: tab.key === activeTab ? 'community-tab--active' : '',
      })),
      visiblePosts,
    });
  },

  handleTabTap(event) {
    const tabKey = event.currentTarget.dataset.tabKey || 'hot';
    this.refreshVisiblePosts(tabKey);
  },

  handleAvatarLoad(event) {
    const postId = String(event.currentTarget.dataset.postId || '');
    if (!postId) return;
    const posts = this.data.posts.map((post) => (
      post.id === postId ? Object.assign({}, post, { avatarLoaded: true }) : post
    ));
    this.setData({ posts });
    this.refreshVisiblePosts(this.data.activeTab, posts);
  },

  handleAvatarError(event) {
    const postId = String(event.currentTarget.dataset.postId || '');
    if (!postId) return;
    const posts = this.data.posts.map((post) => (
      post.id === postId ? Object.assign({}, post, { avatarLoaded: false, avatar: '' }) : post
    ));
    this.setData({ posts });
    this.refreshVisiblePosts(this.data.activeTab, posts);
  },

  async handleLikeTap(event) {
    const postId = String(event.currentTarget.dataset.postId || '');
    const index = this.data.posts.findIndex((post) => post.id === postId);
    if (index < 0) return;
    const posts = this.data.posts.slice();
    const target = Object.assign({}, posts[index]);
    const previousLiked = target.isLiked;
    const previousLikes = target.likes;
    target.isLiked = !target.isLiked;
    target.likes += target.isLiked ? 1 : -1;
    target.likeIcon = target.isLiked ? '/static/icons/heart-active.svg' : '/static/icons/heart.svg';
    target.likeClass = target.isLiked ? 'liked' : '';
    posts[index] = target;
    this.setData({ posts });
    this.refreshVisiblePosts(this.data.activeTab, posts);
    try {
      await api.likeCommunityPost(postId, target.isLiked);
    } catch (error) {
      target.isLiked = previousLiked;
      target.likes = previousLikes;
      target.likeIcon = previousLiked ? '/static/icons/heart-active.svg' : '/static/icons/heart.svg';
      target.likeClass = previousLiked ? 'liked' : '';
      posts[index] = target;
      this.setData({ posts });
      this.refreshVisiblePosts(this.data.activeTab, posts);
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' });
    }
  },
});
