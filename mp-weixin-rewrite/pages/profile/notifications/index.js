const api = require('../../../api/index');
const { formatChinaDateTime } = require('../../../common/utils/date-time');

const TYPE_LABELS = {
  appointment: 'A',
  treatment: 'T',
  order: 'O',
  system: 'S',
  promo: 'P',
};

const TYPE_COLORS = {
  appointment: '#3B6BF5',
  treatment: '#1A9D5C',
  order: '#F59E0B',
  system: '#6B7280',
  promo: '#EF4444',
};

function unwrapNotifications(response) {
  const payload = response && response.data ? response.data : response || {};
  const list = (payload && payload.list) || [];
  const unread = typeof payload.unread === 'number'
    ? payload.unread
    : list.filter((item) => !item.isRead && !item.is_read).length;

  return {
    list: list.map((item) => ({
      id: String(item.id || ''),
      iconText: TYPE_LABELS[item.type] || '?',
      iconBg: (TYPE_COLORS[item.type] || '#6B7280') + '15',
      iconColor: TYPE_COLORS[item.type] || '#6B7280',
      title: item.title || '',
      content: item.content || '',
      timeText: formatChinaDateTime(item.createdAt || item.created_at || '', false),
      isRead: Boolean(item.isRead || item.is_read),
    })),
    unread,
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    notifications: [],
    unreadCount: 0,
  },

  onShow() {
    this.fetchNotifications({ silent: this.data.hasLoaded });
  },

  async fetchNotifications(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const response = await api.getNotifications();
      const { list, unread } = unwrapNotifications(response);
      this.setData({
        hasLoaded: true,
        loading: false,
        notifications: list,
        unreadCount: unread,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载失败', icon: 'none' });
    }
  },

  async markAllRead() {
    try {
      await api.markAllNotificationsRead();
      await this.fetchNotifications();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
    }
  },

  async openNotification(event) {
    const notificationId = String(event.currentTarget.dataset.id || '');
    if (!notificationId) return;
    try {
      await api.markNotificationRead(notificationId);
      await this.fetchNotifications();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
    }
  },
});
