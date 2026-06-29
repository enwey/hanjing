"use strict";
const api = require("../../../api/index.js");

Page({
  data: {
    rooms: [],
    filteredRooms: [],
    activeTab: "all",
    loading: !1,
    showEmpty: !1,
  },

  onLoad() {
    this.fetchRooms();
  },

  async fetchRooms() {
    this.setData({ loading: !0 });
    try {
      const res = await api.getLiveRooms();
      const list = ((res && res.data && res.data.list) || res.list || []).map((item) => ({
        ...item,
        displayTime: this.formatTime(item.startTime),
        displayViewerCount: this.formatViewerCount(item.viewerCount),
        statusText: this.getStatusText(item.status),
        actionText: this.getActionText(item.status),
        anchorInitial: item.anchorName ? item.anchorName.slice(0, 1) : "播",
        displayRoomId: item.wechatRoomId || "未配置",
        showViewerCount: item.status !== "upcoming"
      }));
      this.setData({ rooms: list }, () => this.applyFilter());
    } catch (err) {
      wx.showToast({ title: "加载直播失败", icon: "none" });
    } finally {
      this.setData({ loading: !1 }, () => this.applyFilter());
    }
  },

  applyFilter() {
    const activeTab = this.data.activeTab;
    const filteredRooms = activeTab === "all"
      ? this.data.rooms
      : this.data.rooms.filter((item) => item.status === activeTab);
    this.setData({ filteredRooms, showEmpty: !this.data.loading && filteredRooms.length === 0 });
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    this.setData({ activeTab: tab }, () => this.applyFilter());
  },

  openRoomDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/live/playback/index?id=${id}` });
  },

  formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  },

  formatViewerCount(value) {
    const count = Number(value || 0);
    return count > 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
  },

  getStatusText(status) {
    if (status === "live") return "直播中";
    if (status === "replay") return "回放";
    return "预告";
  },

  getActionText(status) {
    if (status === "live") return "进入直播";
    if (status === "replay") return "观看回放";
    return "查看详情";
  }
});
