const { normalizeImageUrl, BRAND_LOGO } = require('../../../common/utils/image-url');
const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');
const { articleRichText } = require('../utils/article-rich-text');

const COMMENT_LIMIT = 500;
const COMMENT_EMOJIS = [
  '😀', '😄', '😂', '😊', '😍', '🥰', '😘', '😎',
  '🤔', '😅', '🥹', '😢', '😭', '😴', '😮', '🙈',
  '👍', '👏', '🙌', '🙏', '💪', '👌', '✌️', '🤝',
  '❤️', '💙', '✨', '🌟', '🎉', '🌹', '🌙', '☀️',
];

const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('zh', { granularity: 'grapheme' })
  : null;

function getCommentCursor(value, cursor) {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= value.length) return value.length;
  if (graphemeSegmenter) return graphemeSegmenter.segment(value).containing(cursor).index;
  // A cursor from a native editor normally points between characters.
  const code = value.charCodeAt(cursor);
  return code >= 0xdc00 && code <= 0xdfff ? Math.max(0, cursor - 1) : cursor;
}

function previousCommentCharacter(value, cursor) {
  if (graphemeSegmenter) return graphemeSegmenter.segment(value).containing(cursor - 1).index;
  const before = value.slice(0, cursor);
  const emoji = COMMENT_EMOJIS.find(item => before.endsWith(item));
  if (emoji) return cursor - emoji.length;
  return cursor - Array.from(before).pop().length;
}

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
    avatar: comment.role === 'admin' ? BRAND_LOGO : normalizeImageUrl(comment.avatar),
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
    avatar: role === 'admin' ? BRAND_LOGO : normalizeImageUrl(detail.avatar),
    avatarLoaded: false,
    avatarText: (author || '友').slice(0, 1),
    avatarBg: getAvatarColor(author || '友'),
    role,
    isOfficial: role === 'admin',
    roleLabel: detail.roleLabel || (role === 'doctor' ? '专家医生' : role === 'expert' ? '睡眠专家' : '鼾友'),
    roleClass: 'role--' + role,
    title: detail.title || '',
    content: detail.content || '',
    richContent: articleRichText(detail.content),
    coverUrl: detail.coverUrl || '',
    category: tags.category,
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
    avatar: normalizeImageUrl(profile && profile.avatar),
    avatarLoaded: false,
    avatarText: nickname.slice(0, 1) || '我',
    avatarBg: getAvatarColor(nickname),
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
    currentUserAvatar: normalizeCurrentUserAvatar(null),
    commentEmojis: COMMENT_EMOJIS,
    commentLimit: COMMENT_LIMIT,
    commentLines: 1,
    composerMode: 'idle',
    composerFocus: false,
    commentCursor: -1,
    keyboardHeight: 0,
    emojiPanelHeight: 248,
    keepEmojiPanel: false,
  },

  onLoad(options) {
    this.options = options || {};
    this._notificationCommentId = /^\d+$/.test(String(this.options.commentId || '')) ? String(this.options.commentId) : '';
  },

  async onShow() {
    const postId = (this.options && this.options.id) || this.data.postId;
    if (!postId) {
      this.setData({ loading: false, loadError: '帖子参数缺失，请返回列表重试' });
      return;
    }
    this.setData({ postId });
    await this.loadPostDetail(postId, { silent: true });
  },

  async loadPostDetail(postId, { silent = false } = {}) {
    const requestId = this._detailRequestId = (this._detailRequestId || 0) + 1;
    const commentRevision = this._commentRevision || 0;
    const keepContent = silent && this.data.postDetail?.id === String(postId);
    if (!keepContent) this.setData({ loading: true, loadError: '' });

    try {
      const response = await api.getCommunityPostDetail(postId);
      if (requestId !== this._detailRequestId) return;

      const postDetail = normalizePostDetail((response && response.data) || response || {});
      const previousPost = this.data.postDetail;
      if (previousPost?.id === postDetail.id) {
        postDetail.avatarLoaded = previousPost.avatarLoaded && previousPost.avatar === postDetail.avatar;
        if (commentRevision !== (this._commentRevision || 0)) {
          postDetail.comments = this.data.commentsList;
          postDetail.commentsCount = previousPost.commentsCount;
        } else {
          const loadedAvatars = new Map(
            this.data.commentsList.filter(item => item.avatarLoaded).map(item => [item.id, item.avatar])
          );
          for (const item of postDetail.comments) {
            item.avatarLoaded = Boolean(item.avatar && loadedAvatars.get(item.id) === item.avatar);
          }
        }
      }
      this.setData({
        loading: false,
        loadError: '',
        postDetail,
        commentsList: postDetail.comments,
      }, () => this.focusNotificationComment());
      this.loadComposerAvatar(requestId);
    } catch (error) {
      if (requestId !== this._detailRequestId) return;
      const status = Number(error?.statusCode || error?.status || error?.code);
      const message = error?.message || '加载帖子详情失败，请稍后重试';
      if (!keepContent || [401, 403, 404].includes(status)) {
        this.setData({ loading: false, loadError: message, postDetail: null, commentsList: [] });
        return;
      }
      if (this.data.loading) this.setData({ loading: false });
      wx.showToast({ title: message, icon: 'none' });
    }
  },

  async loadComposerAvatar(requestId) {
    try {
      const response = await api.getUserProfile();
      if (requestId !== this._detailRequestId) return;
      const profile = (response && response.data) || response || null;
      const currentUserAvatar = normalizeCurrentUserAvatar(profile);
      if (currentUserAvatar.avatar === this.data.currentUserAvatar.avatar) return;
      this.setData({ currentUserAvatar });
    } catch (error) {
      // The reply bar already has a fallback avatar.
    }
  },

  onHide() {
    this.setData({ composerMode: 'idle', composerFocus: false, keyboardHeight: 0, keepEmojiPanel: false });
  },

  onUnload() {
    this._unloaded = true;
    this._detailRequestId = (this._detailRequestId || 0) + 1;
  },

  focusNotificationComment() {
    const id=this._notificationCommentId;
    if(!id || this._commentFocused)return;
    this._commentFocused=true;
    if(!(this.data.commentsList || []).some(item=>String(item.id)===id)) {
      wx.showToast({title:'该评论已删除或暂不可查看',icon:'none'});
      return;
    }
    this.setData({highlightCommentId:id},()=>wx.pageScrollTo({selector:'#comment-'+id,offsetTop:-100,duration:250}));
  },

  async handlePostLike() {
    if (this._postLikePending) return;
    const postDetail = this.data.postDetail;
    if (!postDetail) return;
    this._postLikePending = true;
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
        postDetail: Object.assign({}, this.data.postDetail, { isLiked: previousLiked, likes: previousLikes }),
      });
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' });
    } finally {
      this._postLikePending = false;
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
    if (this._postFavoritePending) return;
    const postDetail = this.data.postDetail;
    if (!postDetail) return;
    this._postFavoritePending = true;
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
        postDetail: Object.assign({}, this.data.postDetail, {
          isFavorited: previousFavorited,
          favoritesCount: previousFavoritesCount,
        }),
      });
      wx.showToast({ title: '收藏失败，请稍后重试', icon: 'none' });
    } finally {
      this._postFavoritePending = false;
    }
  },

  jumpToComments() {
    this.dismissCommentInput();
    const navbarHeight = this.selectComponent('#post-detail-navbar')?.data?.totalHeight || 64;
    wx.pageScrollTo({ selector: '#post-comments', offsetTop: -navbarHeight - 8, duration: 200 });
  },

  handleReply(event) {
    if (this.data.isSubmitting) return;
    const id = String(event.currentTarget.dataset.commentId);
    const comment = this.data.commentsList.find(item => item.id === id);
    if (!comment) return;
    this.setData({ replyTarget: { id, author: comment.author } }, () => this.focusComposer());
  },

  clearReplyTarget() {
    if (!this.data.isSubmitting) this.setData({ replyTarget: null });
  },

  handleCommentInput(event) {
    const { value = '', cursor } = event.detail;
    this._commentCursor = getCommentCursor(value, cursor);
    this.setData({ commentInput: value });
  },

  handleCommentLineChange(event) {
    const commentLines = Math.max(1, Math.min(4, Number(event.detail.lineCount) || 1));
    if (commentLines !== this.data.commentLines) this.setData({ commentLines });
  },

  focusComposer(event) {
    // Native textarea taps set the caret themselves. The surrounding padding also opens it.
    if (event?.target?.id === 'comment-composer') return;
    const { composerMode, keyboardHeight, keepEmojiPanel, commentInput } = this.data;
    if (this.data.isSubmitting || this.data.composerFocus) return;
    this.setData({
      composerMode: 'keyboard',
      composerFocus: true,
      commentCursor: getCommentCursor(commentInput, this._commentCursor),
      keepEmojiPanel: keyboardHeight === 0 && (composerMode === 'emoji' || keepEmojiPanel),
    });
  },

  handleComposerFocus(event) {
    if (this.data.isSubmitting) return;
    const keepEmojiPanel = this.data.composerMode === 'emoji' || this.data.keepEmojiPanel;
    this.setData({ composerMode: 'keyboard', composerFocus: true, keepEmojiPanel });
    if (Number(event.detail.height) > 0) this.handleKeyboardHeight(event);
  },

  handleComposerBlur(event) {
    const { value, cursor } = event.detail;
    if (value === this.data.commentInput && Number.isInteger(cursor) && cursor >= 0) {
      this._commentCursor = getCommentCursor(value, cursor);
    }
    if (this.data.composerMode === 'emoji') return;
    this.setData({ composerMode: 'idle', composerFocus: false, keepEmojiPanel: false });
  },

  handleKeyboardHeight(event) {
    const keyboardHeight = Math.max(0, Number(event.detail.height) || 0);
    const { composerMode, keyboardHeight: oldHeight } = this.data;
    if (keyboardHeight > 0) {
      this.setData({ keyboardHeight, emojiPanelHeight: keyboardHeight, keepEmojiPanel: false });
    } else {
      const closedKeyboard = oldHeight > 0 && composerMode === 'keyboard';
      this.setData(closedKeyboard
        ? { keyboardHeight: 0, composerMode: 'idle', composerFocus: false, keepEmojiPanel: false }
        : { keyboardHeight: 0 });
    }
  },

  toggleCommentEmoji() {
    if (this.data.isSubmitting) return;
    if (this.data.composerMode === 'emoji') {
      this.focusComposer();
      return;
    }
    const { composerFocus, keyboardHeight } = this.data;
    this.setData({ composerMode: 'emoji', composerFocus: false, keepEmojiPanel: false });
    if (composerFocus || keyboardHeight) wx.hideKeyboard();
  },

  dismissCommentInput() {
    const { composerMode, composerFocus, keyboardHeight } = this.data;
    if (composerMode === 'idle') return;
    this.setData({ composerMode: 'idle', composerFocus: false, keepEmojiPanel: false });
    if (composerFocus || keyboardHeight) wx.hideKeyboard();
  },

  insertCommentEmoji(event) {
    const emoji = event.currentTarget.dataset.emoji;
    const { commentInput, composerMode, isSubmitting } = this.data;
    if (composerMode !== 'emoji' || isSubmitting || !COMMENT_EMOJIS.includes(emoji)) return;
    if (commentInput.length + emoji.length > COMMENT_LIMIT) {
      wx.showToast({ title: '评论最多 500 字', icon: 'none' });
      return;
    }
    const cursor = getCommentCursor(commentInput, this._commentCursor);
    this._commentCursor = cursor + emoji.length;
    this.setData({ commentInput: commentInput.slice(0, cursor) + emoji + commentInput.slice(cursor) });
  },

  deleteCommentCharacter() {
    const { commentInput, composerMode, isSubmitting } = this.data;
    const cursor = getCommentCursor(commentInput, this._commentCursor);
    if (composerMode !== 'emoji' || isSubmitting || cursor === 0) return;
    const start = previousCommentCharacter(commentInput, cursor);
    this._commentCursor = start;
    this.setData({ commentInput: commentInput.slice(0, start) + commentInput.slice(cursor) });
  },

  async submitComment(event) {
    if (this.data.isSubmitting) return;
    const confirmedValue = event?.detail?.value;
    const draft = typeof confirmedValue === 'string' ? confirmedValue : this.data.commentInput;
    if (draft !== this.data.commentInput) {
      this._commentCursor = draft.length;
      this.setData({ commentInput: draft });
    }
    const content = draft.trim();
    if (!content) return;
    if (content.length > COMMENT_LIMIT) {
      wx.showToast({ title: '评论最多 500 字', icon: 'none' });
      return;
    }
    this.setData({ isSubmitting: true });
    try {
      const response = await api.commentCommunityPost(
        this.data.postId,
        content,
        this.data.replyTarget ? this.data.replyTarget.id : null,
      );
      if (this._unloaded) return;
      const createdComment = normalizeComment((response && response.data) || response || {});
      this._commentRevision = (this._commentRevision || 0) + 1;
      const commentsList = [createdComment].concat(this.data.commentsList);
      this._commentCursor = 0;
      this.setData({
        commentsList,
        commentInput: '',
        commentLines: 1,
        commentCursor: -1,
        isSubmitting: false,
        replyTarget: null,
        composerMode: 'idle',
        composerFocus: false,
        keyboardHeight: 0,
        keepEmojiPanel: false,
        postDetail: Object.assign({}, this.data.postDetail, {
          commentsCount: Number((this.data.postDetail && this.data.postDetail.commentsCount) || 0) + 1,
        }),
      });
      wx.hideKeyboard?.();
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (error) {
      if (this._unloaded) return;
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error?.message || '评论失败，请稍后重试', icon: 'none' });
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
    if (this.data.postId) return this.loadPostDetail(this.data.postId);
  },

  onShareAppMessage() {
    const postDetail = this.data.postDetail;
    if (!postDetail) {
      return {
        title: '医患社区',
        path: '/pages/community/index',
      };
    }
    api.shareCommunityPost(postDetail.id).then(() => {
      const current = this.data.postDetail;
      if (!current || current.id !== postDetail.id) return;
      this.setData({ postDetail: Object.assign({}, current, { sharesCount: Number(current.sharesCount || 0) + 1 }) });
    }).catch(() => {});
    return {
      title: postDetail.title || postDetail.content || '医患社区',
      path: '/pages/community/detail/index?id=' + postDetail.id,
    };
  },
});
