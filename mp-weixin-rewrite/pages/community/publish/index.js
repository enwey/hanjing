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
    editId: '',
    loading: false,
    loadError: '',
    rejectReason: '',
    submittedForReview: false,
    title: '',
    content: '',
    selectedCategory: '睡眠科普',
    selectedTags: [],
    selectedTagMap: {},
    isSubmitting: false,
    publishedPostId: '',
    canSubmit: false,
    categoryOptions: CATEGORY_OPTIONS,
    tagOptions: TAG_OPTIONS,
  },

  onLoad(options) {
    if (options && options.editId) {
      if (!/^\d+$/.test(String(options.editId))) { this.setData({loadError:'帖子参数无效'}); return; }
      this.setData({editId:String(options.editId)});
      return this.loadEditablePost();
    }
  },

  async loadEditablePost() {
    this.setData({loading:true,loadError:''});
    try {
      const response=await api.getCommunityPostForEdit(this.data.editId);
      const post=(response && response.data) || response || {};
      const tags=Array.isArray(post.tags)?post.tags:[];
      const selectedCategory=tags[0] || CATEGORY_OPTIONS[0];
      const selectedTags=tags.slice(1,4);
      this.setData({title:post.title || '',content:post.content || '',rejectReason:post.rejectReason || '',selectedCategory,selectedTags,
        categoryOptions:Array.from(new Set(CATEGORY_OPTIONS.concat(selectedCategory))),tagOptions:Array.from(new Set(TAG_OPTIONS.concat(selectedTags)))});
    } catch(error) { this.setData({loadError:error.message || '加载失败，请重试'}); }
    finally { this.setData({loading:false});this.refreshFormState(); }
  },

  returnToNotifications() {
    wx.navigateBack({delta:1,fail:()=>wx.redirectTo({url:'/pages/profile/notifications/index'})});
  },

  refreshFormState() {
    const selectedTagMap = {};
    this.data.selectedTags.forEach((tag) => {
      selectedTagMap[tag] = true;
    });
    this.setData({
      selectedTagMap,
      canSubmit: Boolean((this.data.publishedPostId || (String(this.data.title || '').trim() && String(this.data.content || '').trim())) && !this.data.isSubmitting && !this.data.loading && !this.data.loadError && !this.data.submittedForReview),
    });
  },

  chooseCategory(event) {
    this.setData({ selectedCategory: event.currentTarget.dataset.category || '睡眠科普' });
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
    if (this.data.submittedForReview) { this.returnToNotifications(); return; }
    if (this.data.isSubmitting || this.data.loading || this.data.loadError) return;
    if (this.data.publishedPostId) {
      this.openPublishedPost();
      return;
    }
    if (!String(this.data.title || '').trim() || !String(this.data.content || '').trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });
    this.refreshFormState();
    try {
      const payload = {
        title: this.data.title.trim(),
        content: this.data.content.trim(),
        tags: [this.data.selectedCategory].concat(this.data.selectedTags),
      };
      const response = this.data.editId ? await api.updateCommunityPost(this.data.editId,payload) : await api.createCommunityPost(payload);
      if (this.data.editId) {
        this.setData({submittedForReview:true,isSubmitting:false});
        this.refreshFormState();
        wx.showToast({title:'已提交审核',icon:'success'});
        return;
      }
      const createdPost = (response && response.data) || response || {};
      this.setData({ publishedPostId: String(createdPost.id) });
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        this.openPublishedPost();
      }, 400);
    } catch (error) {
      this.setData({ isSubmitting: false });
      this.refreshFormState();
      wx.showToast({ title: error.message || (this.data.editId ? '提交失败，请重试' : '发布失败，请重试'), icon: 'none' });
    }
  },

  openPublishedPost() {
    this.setData({ isSubmitting: true });
    const failed = () => {
      this.setData({ isSubmitting: false });
      this.refreshFormState();
      wx.showToast({ title: '帖子已发布，点击重试打开', icon: 'none' });
    };
    try {
      wx.redirectTo({ url: '/pages/community/detail/index?id=' + this.data.publishedPostId, fail: failed });
    } catch (error) {
      failed();
    }
  },
});
