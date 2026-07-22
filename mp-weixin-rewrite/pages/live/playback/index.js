const api = require('../../../api/index');

Page({
  data: {
    loading: true,
    loadError: '',
    room: null,
    products: [],
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    const roomId = (this.options && this.options.id) || '';
    if (roomId) {
      await this.loadDetail(roomId);
    }
  },

  async loadDetail(roomId) {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getLiveRoomDetail(roomId);
      const source = (response && response.data) || response || null;
      if (!source) {
        this.setData({ loading: false, room: null, products: [] });
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
        productIds: Array.isArray(source.productIds) ? source.productIds : [],
      };

      let products = [];
      if (room.productIds.length) {
        const productsResponse = await api.getProducts();
        const payload = (productsResponse && productsResponse.data) || productsResponse || {};
        const allProducts = payload.list || payload.items || payload || [];
        const productIdSet = room.productIds.map((item) => String(item));
        products = allProducts
          .filter((item) => productIdSet.includes(String(item.id)))
          .map((item) => ({
            id: String(item.id || ''),
            name: item.name || '',
            image: item.image || item.imageUrl || item.cover || '',
            displayPrice: '¥' + (Number(item.price || 0) / 100).toFixed(2),
          }));
      }

      this.setData({ loading: false, room, products });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载直播详情失败',
      });
    }
  },

  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0') + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
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

  openProductDetail(event) {
    const productId = event.currentTarget.dataset.id;
    if (!productId) return;
    wx.navigateTo({ url: '/pages/product/detail?id=' + productId });
  },
});
