const api = require('../../../api/index');

const CATEGORY_OPTIONS = [
  '睡眠知识',
  '经验分享',
  '夜间记录',
  '使用记录',
  '交流问答',
  '生活习惯',
];

const TAG_OPTIONS = [
  '睡前习惯',
  '作息调整',
  '侧卧体验',
  '夜间变化',
  '经验交流',
  '日常记录',
];

Page({
  data: {
    title: '',
    content: '',
    selectedCategory: '睡眠知识',
    selectedTags: [],
    selectedTagMap: {},
    isSubmitting: false,
    canSubmit: false,
    categoryOptions: CATEGORY_OPTIONS,
    tagOptions: TAG_OPTIONS,
  },

  refreshFormState() {
    const selectedTagMap = {};
    this.data.selectedTags.forEach((tag) => {
      selectedTagMap[tag] = true;
    });
    this.setData({
      selectedTagMap,
      canSubmit: Boolean(String(this.data.title || '').trim() && String(this.data.content || '').trim() && !this.data.isSubmitting),
    });
  },

  chooseCategory(event) {
    this.setData({ selectedCategory: event.currentTarget.dataset.category || '睡眠知识' });
  },

  handleTitleInput(event) {
    this.setData({ title: event.detail.value || '' });
    this.refreshFormState();
  },

  handleContentInput(event) {
    this.setData({ content: event.detail.value || '' });
    this.refreshFormState();
  },

  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag;
    if (!tag) return;
    const selectedTags = this.data.selectedTags.slice();
    const index = selectedTags.indexOf(tag);
    if (index >= 0) {
      selectedTags.splice(index, 1);
      this.setData({ selectedTags });
      this.refreshFormState();
      return;
    }
    if (selectedTags.length >= 3) {
      wx.showToast({ title: '最多选择3个标签', icon: 'none' });
      return;
    }
    selectedTags.push(tag);
    this.setData({ selectedTags });
    this.refreshFormState();
  },

  async submitPublish() {
    if (!String(this.data.title || '').trim() || !String(this.data.content || '').trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });
    this.refreshFormState();
    try {
      const response = await api.createCommunityPost({
        title: this.data.title.trim(),
        content: this.data.content.trim(),
        tags: [this.data.selectedCategory].concat(this.data.selectedTags),
      });
      const createdPost = (response && response.data) || response || {};
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/community/detail/index?id=' + createdPost.id });
      }, 400);
    } catch (error) {
      this.setData({ isSubmitting: false });
      this.refreshFormState();
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    }
  },
});
