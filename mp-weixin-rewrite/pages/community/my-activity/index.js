const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');
const { formatChinaDateTime } = require('../../../common/utils/date-time');
const TABS = [
  { key: 'posts', label: '发布的帖子', empty: '暂无发布的帖子' },
  { key: 'comments', label: '评论记录', empty: '暂无评论记录' },
  { key: 'favorites', label: '收藏记录', empty: '暂无收藏记录' },
];

Page({
  data: { tabs: TABS, activeTab: 'posts', emptyText: TABS[0].empty, items: [], page: 0, hasMore: false, loading: true, loadingMore: false, loadError: '' },
  onShow() { this._unloaded = false; this.loadPage(); },
  onHide() { this._requestId = (this._requestId || 0) + 1; },
  onUnload() { this._unloaded = true; this._requestId = (this._requestId || 0) + 1; },
  onReachBottom() { if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) this.loadPage(true); },
  selectTab(event) {
    const tab = TABS.find(item => item.key === event.currentTarget.dataset.key);
    if (!tab || tab.key === this.data.activeTab) return;
    this.setData({ activeTab: tab.key, emptyText: tab.empty, items: [], page: 0, hasMore: false, loadingMore: false, loadError: '' });
    this.loadPage();
  },
  async loadPage(append = false) {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const type = this.data.activeTab;
    const page = append ? this.data.page + 1 : 1;
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, loadError: '' });
    try {
      const response = await api.getMyCommunityActivity(type, page);
      if (this._unloaded || requestId !== this._requestId || generation !== sessionStore.getLoginGeneration()) return;
      const data = response && response.data || {};
      const items = (Array.isArray(data.list) ? data.list : []).map(item => ({
        recordId: String(item.recordId || ''), postId: String(item.postId || ''), commentId: String(item.commentId || ''),
        title: String(item.title || ''), summary: String(item.summary || ''),
        commentContent: String(item.commentContent || ''),
        postDeleted: Boolean(item.postDeleted),
        commentDeleted: Boolean(item.commentDeleted),
        time: formatChinaDateTime(item.createdAt, false),
      }));
      this.setData({ items: append ? this.data.items.concat(items) : items, page, hasMore: !!data.hasMore, loading: false, loadingMore: false, loadError: '' });
    } catch (error) {
      if (this._unloaded || requestId !== this._requestId || generation !== sessionStore.getLoginGeneration()) return;
      if (append) { this.setData({ loadingMore: false }); wx.showToast({ title: '加载失败，请重试', icon: 'none' }); }
      else this.setData({ loading: false, loadingMore: false, loadError: error.message || '加载失败，请重试', items: [] });
    }
  },
  retryLoad() { this.loadPage(); },
  openItem(event) {
    if (event.currentTarget.dataset.postDeleted) {
      wx.showToast({ title: '原帖已删除，无法查看详情', icon: 'none' });
      return;
    }
    const postId = String(event.currentTarget.dataset.postId || '');
    const commentId = String(event.currentTarget.dataset.commentId || '');
    if (!/^\d+$/.test(postId)) return;
    const commentQuery = /^\d+$/.test(commentId) ? '&commentId=' + commentId : '';
    wx.navigateTo({ url: '/pages/community/detail/index?id=' + postId + commentQuery });
  },
});
