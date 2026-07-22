const api = require('../../../api/index');

function getCategoryClass(name) {
  if (['阻鼾器配戴', '睡眠科普', '科普问答', '专家'].includes(name)) return 'tag-theme--blue';
  if (['打鼾治疗', '治疗分享', '经验交流'].includes(name)) return 'tag-theme--green';
  if (['OSAHS改善', 'AHI改善'].includes(name)) return 'tag-theme--orange';
  if (['适应期', '设备保养'].includes(name)) return 'tag-theme--amber';
  if (['情感支持'].includes(name)) return 'tag-theme--pink';
  return 'tag-theme--violet';
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function splitTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  return { category: values[0] || '', labels: values.slice(1) };
}

function normalizeComment(comment) {
  return {
    id: String(comment.id || ''),
    author: comment.author || '',
    avatar: comment.avatar || '',
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
  return {
    id: String(detail.id || ''),
    author: detail.author || '',
    avatar: detail.avatar || '',
    role,
    roleLabel: detail.roleLabel || (role === 'doctor' ? '专家医生' : role === 'expert' ? '睡眠专家' : '鼾友'),
    roleClass: 'role--' + role,
    title: detail.title || '',
    content: detail.content || '',
    coverUrl: detail.coverUrl || '',
    category: tags.category,
    categoryClass: getCategoryClass(tags.category),
    labels: tags.labels,
    likes: Number(detail.likes || 0),
    commentsCount: Number(detail.commentsCount || 0),
    createdAt: detail.createdAt || '',
    displayTime: formatDateTime(detail.createdAt),
    isLiked: Boolean(detail.isLiked),
    comments: Array.isArray(detail.comments) ? detail.comments.map(normalizeComment) : [],
  };
}

Page({
  data: {
    postId: '',
    loading: true,
    loadError: '',
    postDetail: null,
    commentsList: [],
    commentInput: '',
    isSubmitting: false,
    replyTarget: null,
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
    await this.loadPostDetail(postId);
  },

  async loadPostDetail(postId) {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getCommunityPostDetail(postId);
      const payload = (response && response.data) || response || null;
      const postDetail = normalizePostDetail(payload || {});
      this.setData({
        loading: false,
        postDetail,
        commentsList: postDetail.comments,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载帖子详情失败，请稍后重试',
        postDetail: null,
        commentsList: [],
      });
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

  handleReply(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const comment = this.data.commentsList.find((item) => item.id === commentId) || null;
    this.setData({ replyTarget: comment });
  },

  clearReplyTarget() {
    this.setData({ replyTarget: null, commentInput: '' });
  },

  handleCommentInput(event) {
    this.setData({ commentInput: event.detail.value || '' });
  },

  async submitComment() {
    if (!String(this.data.commentInput || '').trim() || this.data.isSubmitting) {
      return;
    }
    this.setData({ isSubmitting: true });
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
        postDetail: Object.assign({}, this.data.postDetail, {
          commentsCount: Number((this.data.postDetail && this.data.postDetail.commentsCount) || 0) + 1,
        }),
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (error) {
      this.setData({ isSubmitting: false });
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
      this.loadPostDetail(this.data.postId);
    }
  },
});
