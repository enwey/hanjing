const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');

function getCategoryClass(name) {
  if (['阻鼾器配戴', '睡眠科普', '科普问答', '专家'].includes(name)) return 'tag-theme--blue';
  if (['打鼾改善', '经验分享', '经验交流'].includes(name)) return 'tag-theme--green';
  if (['OSAHS改善', 'AHI改善'].includes(name)) return 'tag-theme--orange';
  if (['适应期', '设备保养'].includes(name)) return 'tag-theme--amber';
  if (['情感支持'].includes(name)) return 'tag-theme--pink';
  return 'tag-theme--violet';
}

function getDisplayCategory(name) {
  if (name === '阻鼾器配戴') return '使用记录';
  if (name === '睡眠科普') return '睡眠知识';
  if (name === '科普问答') return '交流问答';
  if (name === '专家') return '精选内容';
  if (name === 'OSAHS改善') return '睡眠变化';
  if (name === 'AHI改善') return '夜间变化';
  return name || '';
}

function getRoleLabel(role, roleLabel) {
  if (role === 'doctor' || role === 'expert') return '内容作者';
  if (roleLabel === '睡眠顾问' || roleLabel === '睡眠专家') return '内容作者';
  return roleLabel || '鼾友';
}

function formatDateTime(value) {
  if (!value) return '';
  return formatChinaDateTime(value, false);
}

function splitTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  return { category: values[0] || '', labels: values.slice(1) };
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

function normalizeComment(comment) {
  const author = comment.author || '';
  return {
    id: String(comment.id || ''),
    author,
    avatar: comment.avatar || '',
    avatarLoaded: false,
    avatarText: (author || '友').slice(0, 1),
    avatarBg: getAvatarColor(author || '友'),
    content: comment.content || '',
    likes: Number(comment.likes || 0),
    createdAt: comment.createdAt || '',
    displayTime: formatDateTime(comment.createdAt),
    parentId: comment.parentId || null,
    parentAuthor: comment.parentAuthor || '',
    isLiked: Boolean(comment.isLiked),
  };
}

function normalizePostDetail(detail) {
  const tags = splitTags(detail.tags);
  const role = detail.role || 'patient';
  const author = detail.author || '';
  return {
    id: String(detail.id || ''),
    author,
    avatar: detail.avatar || '',
    avatarLoaded: false,
    avatarText: (author || '友').slice(0, 1),
    avatarBg: getAvatarColor(author || '友'),
    role,
    roleLabel: getRoleLabel(role, detail.roleLabel),
    roleClass: 'role--' + role,
    title: detail.title || '',
    content: detail.content || '',
    coverUrl: detail.coverUrl || '',
    category: getDisplayCategory(tags.category),
    categoryClass: getCategoryClass(tags.category),
    labels: tags.labels,
    likes: Number(detail.likes || 0),
    commentsCount: Number(detail.commentsCount || 0),
    viewsCount: Number(detail.viewsCount || 0),
    favoritesCount: Number(detail.favoritesCount || 0),
    sharesCount: Number(detail.sharesCount || 0),
    createdAt: detail.createdAt || '',
    displayTime: formatDateTime(detail.createdAt),
    isLiked: Boolean(detail.isLiked),
    isFavorited: Boolean(detail.isFavorited),
    comments: Array.isArray(detail.comments) ? detail.comments.map(normalizeComment) : [],
  };
}

function normalizeCurrentUserAvatar(profile) {
  const nickname = String((profile && (profile.nickname || profile.name)) || '我');
  return {
    avatar: (profile && profile.avatar) || '',
    avatarLoaded: false,
    avatarText: nickname.slice(0, 1) || '我',
    avatarBg: getAvatarColor(nickname),
  };
}

Page({
  data: {
    postId: '',
    loading: true,
    hasLoaded: false,
    loadError: '',
    postDetail: null,
    commentsList: [],
    commentInput: '',
    isSubmitting: false,
    replyTarget: null,
    canSubmitComment: false,
    currentUserAvatar: normalizeCurrentUserAvatar(null),
    composerExpanded: false,
    composerFocus: false,
  },

  refreshCommentSubmitState() {
    this.setData({
      canSubmitComment: Boolean(String(this.data.commentInput || '').trim() && !this.data.isSubmitting),
    });
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    const postId = (this.options && this.options.id) || this.data.postId;
    if (!postId) {
      this.setData({ loading: false, loadError: '帖子参数缺失，请返回列表重试' });
      return;
    }
    this.setData({ postId });
    await this.loadPostDetail(postId, { silent: this.data.hasLoaded });
  },

  async loadPostDetail(postId, options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const [response, profileResponse] = await Promise.all([
        api.getCommunityPostDetail(postId),
        api.getUserProfile().catch(() => null),
      ]);
      const payload = (response && response.data) || response || null;
      const profile = (profileResponse && profileResponse.data) || profileResponse || null;
      const postDetail = normalizePostDetail(payload || {});
      this.setData({
        hasLoaded: true,
        loading: false,
        postDetail,
        commentsList: postDetail.comments,
        currentUserAvatar: normalizeCurrentUserAvatar(profile),
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载帖子详情失败，请稍后重试',
          postDetail: null,
          commentsList: [],
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载帖子详情失败，请稍后重试', icon: 'none' });
    }
  },

  async handlePostLike() {
    const postDetail = this.data.postDetail;
    if (!postDetail) return;
    const previousLiked = postDetail.isLiked;
    const previousLikes = postDetail.likes;
    const nextPost = Object.assign({}, postDetail, {
      isLiked: !postDetail.isLiked,
      likes: postDetail.likes + (!postDetail.isLiked ? 1 : -1),
    });
    this.setData({ postDetail: nextPost });
    try {
      await api.likeCommunityPost(postDetail.id, nextPost.isLiked);
    } catch (error) {
      this.setData({
        postDetail: Object.assign({}, postDetail, { isLiked: previousLiked, likes: previousLikes }),
      });
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' });
    }
  },

  handlePostAvatarLoad() {
    if (!this.data.postDetail) return;
    this.setData({
      postDetail: Object.assign({}, this.data.postDetail, { avatarLoaded: true }),
    });
  },

  handlePostAvatarError() {
    if (!this.data.postDetail) return;
    this.setData({
      postDetail: Object.assign({}, this.data.postDetail, { avatarLoaded: false, avatar: '' }),
    });
  },

  handleCommentAvatarLoad(event) {
    const commentId = String(event.currentTarget.dataset.commentId || '');
    if (!commentId) return;
    const commentsList = this.data.commentsList.map((comment) => (
      comment.id === commentId ? Object.assign({}, comment, { avatarLoaded: true }) : comment
    ));
    this.setData({ commentsList });
  },

  handleCommentAvatarError(event) {
    const commentId = String(event.currentTarget.dataset.commentId || '');
    if (!commentId) return;
    const commentsList = this.data.commentsList.map((comment) => (
      comment.id === commentId ? Object.assign({}, comment, { avatarLoaded: false, avatar: '' }) : comment
    ));
    this.setData({ commentsList });
  },

  handleCurrentUserAvatarLoad() {
    const currentUserAvatar = Object.assign({}, this.data.currentUserAvatar, { avatarLoaded: true });
    this.setData({ currentUserAvatar });
  },

  handleCurrentUserAvatarError() {
    const currentUserAvatar = Object.assign({}, this.data.currentUserAvatar, { avatarLoaded: false, avatar: '' });
    this.setData({ currentUserAvatar });
  },

  async handleCommentLike(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const comments = this.data.commentsList.slice();
    const index = comments.findIndex((comment) => comment.id === commentId);
    if (index < 0) return;
    const target = Object.assign({}, comments[index]);
    const previousLiked = target.isLiked;
    const previousLikes = target.likes;
    target.isLiked = !target.isLiked;
    target.likes += target.isLiked ? 1 : -1;
    comments[index] = target;
    this.setData({ commentsList: comments });
    try {
      await api.likeCommunityComment(commentId, target.isLiked);
    } catch (error) {
      target.isLiked = previousLiked;
      target.likes = previousLikes;
      comments[index] = target;
      this.setData({ commentsList: comments });
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' });
    }
  },

  async handlePostFavorite() {
    const postDetail = this.data.postDetail;
    if (!postDetail) return;
    const previousFavorited = postDetail.isFavorited;
    const previousFavoritesCount = postDetail.favoritesCount;
    const nextPost = Object.assign({}, postDetail, {
      isFavorited: !postDetail.isFavorited,
      favoritesCount: postDetail.favoritesCount + (!postDetail.isFavorited ? 1 : -1),
    });
    this.setData({ postDetail: nextPost });
    try {
      await api.favoriteCommunityPost(postDetail.id, nextPost.isFavorited);
    } catch (error) {
      this.setData({
        postDetail: Object.assign({}, postDetail, {
          isFavorited: previousFavorited,
          favoritesCount: previousFavoritesCount,
        }),
      });
      wx.showToast({ title: '收藏失败，请稍后重试', icon: 'none' });
    }
  },

  handleReply(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const comment = this.data.commentsList.find((item) => item.id === commentId) || null;
    this.setData({
      replyTarget: comment,
      composerExpanded: true,
      composerFocus: true,
    });
  },

  clearReplyTarget() {
    this.setData({ replyTarget: null, commentInput: '', composerExpanded: false, composerFocus: false });
    this.refreshCommentSubmitState();
  },

  handleCommentInput(event) {
    this.setData({ commentInput: event.detail.value || '' });
    this.refreshCommentSubmitState();
  },

  openComposer() {
    this.setData({ composerExpanded: true, composerFocus: true });
  },

  handleComposerFocus() {
    this.setData({ composerExpanded: true, composerFocus: true });
  },

  handleComposerBlur() {
    this.setData({ composerFocus: false });
    if (String(this.data.commentInput || '').trim()) {
      return;
    }
    setTimeout(() => {
      if (!this.data.composerFocus && !String(this.data.commentInput || '').trim()) {
        this.setData({
          composerExpanded: false,
          replyTarget: null,
        });
      }
    }, 120);
  },

  async submitComment() {
    if (!String(this.data.commentInput || '').trim() || this.data.isSubmitting) {
      return;
    }
    this.setData({ isSubmitting: true });
    this.refreshCommentSubmitState();
    try {
      const response = await api.commentCommunityPost(
        this.data.postId,
        this.data.commentInput.trim(),
        this.data.replyTarget ? this.data.replyTarget.id : null,
      );
      const createdComment = normalizeComment((response && response.data) || response || {});
      const commentsList = [createdComment].concat(this.data.commentsList);
      this.setData({
        commentsList,
        commentInput: '',
        isSubmitting: false,
        replyTarget: null,
        composerExpanded: false,
        composerFocus: false,
        postDetail: Object.assign({}, this.data.postDetail, {
          commentsCount: Number((this.data.postDetail && this.data.postDetail.commentsCount) || 0) + 1,
        }),
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
      this.refreshCommentSubmitState();
    } catch (error) {
      this.setData({ isSubmitting: false });
      this.refreshCommentSubmitState();
      wx.showToast({ title: '评论失败，请稍后重试', icon: 'none' });
    }
  },

  reportPost() {
    const reasons = ['垃圾广告', '违规言论', '侮辱谩骂', '涉嫌欺诈', '其他原因'];
    wx.showActionSheet({
      itemList: reasons,
      success: async (result) => {
        wx.showLoading({ title: '提交举报...' });
        try {
          await api.reportCommunityPost(this.data.postId, reasons[result.tapIndex] || '其他原因');
          wx.hideLoading();
          wx.showToast({ title: '举报成功，感谢您的反馈', icon: 'success' });
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: '举报失败，请稍后重试', icon: 'none' });
        }
      },
    });
  },

  retryLoad() {
    if (this.data.postId) {
      this.loadPostDetail(this.data.postId, { silent: false });
    }
  },

  onShareAppMessage() {
    const postDetail = this.data.postDetail;
    if (!postDetail) {
      return {
        title: '睡眠社区',
        path: '/pages/community/index',
      };
    }
    api.shareCommunityPost(postDetail.id).catch(() => {});
    this.setData({
      postDetail: Object.assign({}, postDetail, {
        sharesCount: Number(postDetail.sharesCount || 0) + 1,
      }),
    });
    return {
      title: postDetail.title || postDetail.content || '睡眠社区',
      path: '/pages/community/detail/index?id=' + postDetail.id,
    };
  },
});
