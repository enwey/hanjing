const api = require('../../../api/index');

Page({
  data: {
    loading: false,
    loadError: '',
    activeTab: 'all',
    rooms: [],
    filteredRooms: [],
  },

  async onShow() {
    await this.fetchRooms();
  },

  async fetchRooms() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getLiveRooms();
      const payload = (response && response.data) || response || {};
      const rooms = (payload.list || payload.items || payload || []).map((item) => ({
        id: String(item.id || ''),
        title: item.title || '',
        cover: item.cover || '',
        status: item.status || 'upcoming',
        statusText: this.getStatusText(item.status),
        actionText: this.getActionText(item.status),
        displayTime: this.formatTime(item.startTime),
        displayViewerCount: this.formatViewerCount(item.viewerCount),
        anchorName: item.anchorName || '',
        anchorInitial: (item.anchorName || '').slice(0, 1),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
        displayRoomId: item.wechatRoomId || '',
        showViewerCount: item.status !== 'upcoming',
      }));
      this.setData({ rooms, loading: false }, () => this.applyFilter());
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载直播失败',
        rooms: [],
        filteredRooms: [],
      });
    }
  },

  applyFilter() {
    const activeTab = this.data.activeTab;
    const filteredRooms = activeTab === 'all'
      ? this.data.rooms
      : this.data.rooms.filter((item) => item.status === activeTab);
    this.setData({ filteredRooms });
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab || 'all' }, () => this.applyFilter());
  },

  openRoomDetail(event) {
    const roomId = event.currentTarget.dataset.id;
    if (!roomId) return;
    wx.navigateTo({ url: '/pages/live/playback/index?id=' + roomId });
  },

  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  },

  formatViewerCount(value) {
    const count = Number(value || 0);
    return count > 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
  },

  getStatusText(status) {
    if (status === 'live') return '直播中';
    if (status === 'replay') return '回放';
    return '预告';
  },

  getActionText(status) {
    if (status === 'live') return '进入直播';
    if (status === 'replay') return '观看回放';
    return '查看详情';
  },
});
