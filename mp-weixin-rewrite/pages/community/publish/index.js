const api = require('../../../api/index');

const CATEGORY_OPTIONS = [
  '睡眠科普',
  '治疗知识',
  '设备介绍',
  '患者故事',
  '阻鼾器配戴',
  '科普问答',
];

const TAG_OPTIONS = [
  '适应期',
  '治疗分享',
  'AHI改善',
  '设备保养',
  '情感支持',
  '经验交流',
];

Page({
  data: {
    title: '',
    content: '',
    selectedCategory: '睡眠科普',
    selectedTags: [],
    isSubmitting: false,
    categoryOptions: CATEGORY_OPTIONS,
    tagOptions: TAG_OPTIONS,
  },

  chooseCategory(event) {
    this.setData({ selectedCategory: event.currentTarget.dataset.category || '睡眠科普' });
  },

  handleTitleInput(event) {
    this.setData({ title: event.detail.value || '' });
  },

  handleContentInput(event) {
    this.setData({ content: event.detail.value || '' });
  },

  toggleTag(event) {
    const tag = event.currentTarget.dataset.tag;
    if (!tag) return;
    const selectedTags = this.data.selectedTags.slice();
    const index = selectedTags.indexOf(tag);
    if (index >= 0) {
      selectedTags.splice(index, 1);
      this.setData({ selectedTags });
      return;
    }
    if (selectedTags.length >= 3) {
      wx.showToast({ title: '最多选择3个标签', icon: 'none' });
      return;
    }
    selectedTags.push(tag);
    this.setData({ selectedTags });
  },

  async submitPublish() {
    if (!String(this.data.title || '').trim() || !String(this.data.content || '').trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });
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
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    }
  },
});
