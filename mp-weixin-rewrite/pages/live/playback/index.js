const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    room: null,
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    const roomId = (this.options && this.options.id) || '';
    if (roomId) {
      await this.loadDetail(roomId, { silent: this.data.hasLoaded });
    }
  },

  async loadDetail(roomId, options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const response = await api.getLiveRoomDetail(roomId);
      const source = (response && response.data) || response || null;
      if (!source) {
        this.setData({ loading: false, room: null });
        return;
      }
      const room = {
        id: String(source.id || ''),
        title: source.title || '',
        cover: source.cover || '',
        anchorName: source.anchorName || '',
        anchorInitial: (source.anchorName || '').slice(0, 1),
        displayTime: this.formatDate(source.startTime),
        displayViewerCount: this.formatViewerCount(source.viewerCount),
        displayDescription: source.description || '',
        status: source.status || 'upcoming',
        statusText: source.status === 'live' ? '直播中' : source.status === 'replay' ? '回放中' : '预告中',
        actionText: this.getActionText(source.status),
        displayRoomId: source.wechatRoomId || '',
        wechatRoomId: source.wechatRoomId || '',
        replayUrl: source.replayUrl || '',
      };
      this.setData({ hasLoaded: true, loading: false, room });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载直播详情失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载直播详情失败', icon: 'none' });
    }
  },

  formatDate(value) {
    if (!value) return '';
    return formatChinaDateTime(value, false);
  },

  formatViewerCount(value) {
    const count = Number(value || 0);
    return count > 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
  },

  getActionText(status) {
    if (status === 'live') return '进入微信直播间';
    if (status === 'replay') return '进入微信直播间看回放';
    return '进入微信直播间预约';
  },

  openWechatLiveRoom() {
    const room = this.data.room;
    if (!room) return;
    if (!room.wechatRoomId) {
      if (room.replayUrl) {
        wx.setClipboardData({
          data: room.replayUrl,
          success() {
            wx.showToast({ title: '已复制回放链接', icon: 'none' });
          },
        });
        return;
      }
      wx.showToast({ title: '当前内容暂未开放小程序直播入口', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: 'plugin-private://wx2b03c6e691cd7370/pages/live-player-plugin?room_id=' + room.wechatRoomId,
      fail: () => {
        wx.showToast({ title: '打开微信直播间失败', icon: 'none' });
      },
    });
  },
});
