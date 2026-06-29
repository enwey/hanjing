"use strict";
const api = require("../../../api/index.js");

Page({
  data: {
    room: null,
    products: [],
  },

  onLoad(options) {
    if (options && options.id) {
      this.loadDetail(options.id);
    }
  },

  async loadDetail(id) {
    try {
      const res = await api.getLiveRoomDetail(id);
      const source = (res && res.data) || res;
      const room = source ? {
        ...source,
        displayTime: this.formatDate(source.startTime),
        displayViewerCount: this.formatViewerCount(source.viewerCount),
        actionText: this.getActionText(source.status),
        anchorInitial: source.anchorName ? source.anchorName.slice(0, 1) : "播",
        displayDescription: source.description || "进入微信官方直播间可观看直播和回放。",
        statusText: source.status === "live" ? "直播中" : source.status === "replay" ? "回放中" : "预告中",
        displayRoomId: source.wechatRoomId || "未配置"
      } : null;
      this.setData({ room });
      if (room && room.productIds && room.productIds.length) {
        const productRes = await api.getProducts();
        const list = (productRes && productRes.data && productRes.data.list) || productRes.list || [];
        const productIdSet = room.productIds.map((item) => String(item));
        const products = list
          .filter((item) => productIdSet.includes(String(item.id)))
          .map((item) => ({
            ...item,
            displayPrice: (Number(item.price || 0) / 100).toFixed(2)
          }));
        this.setData({ products });
      }
    } catch (err) {
      wx.showToast({ title: "加载直播详情失败", icon: "none" });
    }
  },

  formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  },

  formatViewerCount(value) {
    const count = Number(value || 0);
    return count > 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
  },

  getActionText(status) {
    if (status === "live") return "进入微信直播间";
    if (status === "replay") return "进入微信直播间看回放";
    return "进入微信直播间预约";
  },

  openWechatLiveRoom() {
    const room = this.data.room;
    if (!room || !room.wechatRoomId) {
      if (room && room.replayUrl) {
        wx.setClipboardData({
          data: room.replayUrl,
          success() {
            wx.showToast({ title: "已复制回放链接", icon: "none" });
          }
        });
        return;
      }
      wx.showToast({ title: "暂未配置微信直播间", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: `plugin-private://wx2b03c6e691cd7370/pages/live-player-plugin?room_id=${room.wechatRoomId}`,
      fail: () => {
        wx.showToast({ title: "打开微信直播间失败", icon: "none" });
      }
    });
  },

  openProductDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
  }
});
