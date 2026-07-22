const api = require('../../../../api/index');
const patientContextStore = require('../../../../stores/patient-context-store');
const patientContextService = require('../../../../services/patient-context-service');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeRecord(record) {
  const rating = Number(record.rating || 0);
  return {
    id: String(record.id || ''),
    dateLabel: record.createdAt || record.date || '',
    content: record.content || '',
    rating,
    ratingStars: '★★★★★'.slice(0, rating),
    statusLabel: record.statusText || record.statusLabel || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedMemberLabel: '',
    records: [],
    showComposer: false,
    ratingOptions: [1, 2, 3, 4, 5],
    rating: 0,
    content: '',
    submitting: false,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const recordsResponse = await api.getDeviceFeedback(
        context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() },
      );
      const records = unwrapList(recordsResponse).map(normalizeRecord);

      this.setData({
        loading: false,
        selectedMemberLabel: context.currentMember ? context.currentMember.name + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）' : '',
        currentPatientId: context.currentPatientId,
        records,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载使用反馈失败',
        records: [],
      });
    }
  },

  openComposer() {
    this.setData({ showComposer: true, rating: 0, content: '' });
  },

  closeComposer() {
    this.setData({ showComposer: false });
  },

  noop() {},

  chooseRating(event) {
    this.setData({ rating: Number(event.currentTarget.dataset.value || 0) });
  },

  handleContentInput(event) {
    this.setData({ content: event.detail.value || '' });
  },

  async submitFeedback() {
    if (this.data.submitting) return;
    if (!this.data.rating) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }
    if (!String(this.data.content || '').trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await api.submitDeviceFeedback({
        patientId: this.data.currentPatientId,
        rating: this.data.rating,
        content: this.data.content.trim(),
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      this.setData({ showComposer: false, rating: 0, content: '' });
      await this.loadPage();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
