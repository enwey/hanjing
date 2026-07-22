const api = require('../../../api/index');

const TYPE_META = {
  appointment: { label: '约', color: '#3b6bf5' },
  treatment: { label: '疗', color: '#1a9d5c' },
  order: { label: '单', color: '#f59e0b' },
  community: { label: '帖', color: '#8b5cf6' },
  system: { label: '系', color: '#6b7280' },
  promo: { label: '惠', color: '#ef4444' },
};

function unwrapNotificationPayload(response) {
  const payload = response && response.data ? response.data : response || {};
  const list = Array.isArray(payload.list) ? payload.list : Array.isArray(payload) ? payload : [];
  return {
    list,
    unread: Number(payload.unread || 0),
  };
}

function formatTimeLabel(timestamp) {
  if (!timestamp) {
    return '';
  }
  return String(timestamp).slice(0, 16).replace('T', ' ');
}

function normalizeNotification(notification) {
  const meta = TYPE_META[notification.type] || { label: '?', color: '#6b7280' };
  const title = notification.title || notification.content || '';
  return {
    id: String(notification.id || ''),
    title,
    content: notification.content || '',
    typeLabel: meta.label,
    badgeColor: meta.color,
    timeLabel: formatTimeLabel(notification.createdAt),
    isRead: Boolean(notification.isRead),
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    unreadCount: 0,
    notifications: [],
    summary: {
      totalCount: '0',
      unreadCount: '0',
      latestTimeLabel: '',
    },
  },

  async onShow() {
    await this.loadNotifications();
  },

  async loadNotifications() {
    this.setData({ loading: true, loadError: '' });
    try {
      const response = await api.getNotifications();
      const payload = unwrapNotificationPayload(response);
      const notifications = payload.list.map(normalizeNotification);
      const unreadCount = payload.unread || notifications.filter((notification) => !notification.isRead).length;

      this.setData({
        loading: false,
        unreadCount,
        notifications,
        summary: {
          totalCount: String(notifications.length),
          unreadCount: String(unreadCount),
          latestTimeLabel: notifications.length ? notifications[0].timeLabel || '' : '',
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载消息通知失败',
        notifications: [],
      });
    }
  },

  async markAllRead() {
    try {
      await api.markAllNotificationsRead();
      await this.loadNotifications();
      wx.showToast({ title: '已全部标记为已读', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
    }
  },

  async markNotificationRead(event) {
    const notificationId = String(event.currentTarget.dataset.notificationId || '');
    if (!notificationId) {
      return;
    }
    try {
      await api.markNotificationRead(notificationId);
      await this.loadNotifications();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
    }
  },
});
