const api = require('../../api/index');

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
  if (['打鼾治疗', '治疗分享', '经验交流'].includes(name)) return 'tag-theme--green';
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function normalizePost(post) {
  const tags = splitTags(post.tags);
  return {
    id: String(post.id || ''),
    isTop: Boolean(post.isTop),
    avatar: post.avatar || '',
    author: post.author || '',
    role: post.role || 'patient',
    roleLabel: post.roleLabel || (post.role === 'doctor' ? '专家医生' : post.role === 'expert' ? '睡眠专家' : '鼾友'),
    createdAt: post.createdAt || '',
    displayTime: formatPublishTime(post.createdAt),
    title: post.title || '',
    content: post.content || '',
    category: tags.category,
    categoryClass: getCategoryClass(tags.category),
    labels: tags.labels,
    likes: Number(post.likes || 0),
    comments: Number(post.comments || post.commentsCount || 0),
    isLiked: Boolean(post.isLiked),
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    activeTab: 'hot',
    tabs: TAB_LIST,
    posts: [],
    visiblePosts: [],
  },

  async onShow() {
    await this.loadPosts();
  },

  async loadPosts() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getCommunityPosts();
      const posts = unwrapList(response).map(normalizePost);
      this.setData({ loading: false, posts });
      this.refreshVisiblePosts(this.data.activeTab, posts);
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载社区帖子失败',
        posts: [],
        visiblePosts: [],
      });
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
        const likeDiff = Number(b.likes || 0) - Number(a.likes || 0);
        if (likeDiff !== 0) return likeDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    visiblePosts = visiblePosts.filter((post) => post.isTop).concat(visiblePosts.filter((post) => !post.isTop));
    this.setData({ activeTab, visiblePosts });
  },

  handleTabTap(event) {
    const tabKey = event.currentTarget.dataset.tabKey || 'hot';
    this.refreshVisiblePosts(tabKey);
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
    posts[index] = target;
    this.setData({ posts });
    this.refreshVisiblePosts(this.data.activeTab, posts);
    try {
      await api.likeCommunityPost(postId, target.isLiked);
    } catch (error) {
      target.isLiked = previousLiked;
      target.likes = previousLikes;
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
