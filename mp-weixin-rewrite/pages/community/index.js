const api = require('../../api/index');
const { formatChinaDateTime } = require('../../common/utils/date-time');

const TAB_LIST = [
  { key: 'hot', label: '热门' },
  { key: 'latest', label: '最新' },
  { key: 'expert', label: '专家' },
];

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function isExpertPost(post) {
  return post.category === '专家' || post.role === 'doctor' || post.role === 'expert';
}

function getCategoryClass(name) {
  if (['阻鼾器配戴', '睡眠科普', '科普问答', '专家'].includes(name)) return 'tag-theme--blue';
  if (['打鼾改善', '经验分享', '经验交流'].includes(name)) return 'tag-theme--green';
  if (['OSAHS改善', 'AHI改善'].includes(name)) return 'tag-theme--orange';
  if (['适应期', '设备保养'].includes(name)) return 'tag-theme--amber';
  if (['情感支持'].includes(name)) return 'tag-theme--pink';
  return 'tag-theme--violet';
}

function splitTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  return { category: values[0] || '', labels: values.slice(1) };
}

function formatPublishTime(value) {
  if (!value) return '';
  return formatChinaDateTime(value, false);
}

function getAvatarColor(name) {
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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

function normalizePost(post) {
  const tags = splitTags(post.tags);
  const role = post.role || 'patient';
  const liked = Boolean(post.isLiked);
  const author = post.author || '';
  return {
    id: String(post.id || ''),
    isTop: Boolean(post.isTop),
    avatar: post.avatar || '',
    avatarLoaded: false,
    avatarText: (author || '友').slice(0, 1),
    avatarBg: getAvatarColor(author || '友'),
    author,
    role,
    roleLabel: post.roleLabel || (role === 'doctor' ? '睡眠顾问' : role === 'expert' ? '睡眠专家' : '鼾友'),
    roleClass: 'role--' + role,
    createdAt: post.createdAt || '',
    displayTime: formatPublishTime(post.createdAt),
    title: post.title || '',
    content: post.content || '',
    category: tags.category,
    categoryClass: getCategoryClass(tags.category),
    labels: tags.labels,
    likes: Number(post.likes || 0),
    comments: Number(post.comments || post.commentsCount || 0),
    views: Number(post.views || post.viewsCount || 0),
    favorites: Number(post.favorites || post.favoritesCount || 0),
    shares: Number(post.shares || post.sharesCount || 0),
    isLiked: liked,
    likeIcon: liked ? '/static/icons/heart-active.svg' : '/static/icons/heart.svg',
    likeClass: liked ? 'liked' : '',
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    activeTab: 'hot',
    tabs: TAB_LIST.map((tab) => Object.assign({}, tab, {
      active: tab.key === 'hot',
      activeClass: tab.key === 'hot' ? 'community-tab--active' : '',
    })),
    posts: [],
    visiblePosts: [],
  },

  async onShow() {
    await this.loadPosts({ silent: this.data.hasLoaded });
  },

  async loadPosts(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const response = await api.getCommunityPosts();
      const posts = unwrapList(response).map(normalizePost);
      this.setData({ hasLoaded: true, loading: false, posts });
      this.refreshVisiblePosts(this.data.activeTab, posts);
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载社区帖子失败',
          posts: [],
          visiblePosts: [],
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载社区帖子失败', icon: 'none' });
    }
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
    const postId = event.currentTarget.dataset.postId;
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

  openPostDetail(event) {
    const postId = event.currentTarget.dataset.postId;
    if (!postId) return;
    wx.navigateTo({ url: '/pages/community/detail/index?id=' + postId });
  },

  goPublishPost() {
    wx.navigateTo({ url: '/pages/community/publish/index' });
  },
});
