const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');

const MENU_GROUPS = [
  {
    title: '我的健康',
    items: [
      { key: 'records', label: '病历档案', icon: '/static/icons/profile_orange.svg', url: '/pages/profile/medical-records/index' },
      { key: 'device', label: '阻鼾器管理', icon: '/static/icons/treatment_green.svg', url: '/pages/profile/device-manage/index' },
      { key: 'family', label: '家庭成员', icon: '/static/icons/community.svg', url: '/pages/profile/family-members/index' },
    ],
  },
  {
    title: '我的服务',
    items: [
      { key: 'benefits', label: '会员权益', icon: '/static/icons/fee.svg', url: '/pages/profile/member-benefits/index' },
      { key: 'orders', label: '我的订单', icon: '/static/icons/tab-mall-active.png', url: '/pages/order/index' },
      { key: 'distribution', label: '分销中心', icon: '/static/icons/distribution.svg', url: '/pages/distribution/center/index' },
      { key: 'live', label: '直播中心', icon: '/static/icons/microphone.svg', url: '/pages/live/list/index' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'service', label: '在线客服', icon: '/static/icons/chat.svg', url: '/pages/profile/online-service/index' },
      { key: 'notifications', label: '消息通知', icon: '/static/icons/bell.svg', url: '/pages/profile/notifications/index' },
      { key: 'settings', label: '设置', icon: '/static/icons/adjust.svg', url: '/pages/profile/settings/index' },
    ],
  },
];

function normalizeLevelLabel(level) {
  if (!level) {
    return '普通会员';
  }
  if (level === 'gold') {
    return '黄金会员';
  }
  if (level === 'diamond') {
    return '钻石会员';
  }
  if (level === 'silver') {
    return '白银会员';
  }
  return String(level);
}

Page({
  data: {
    isLoggedIn: false,
    nickname: '点击登录',
    avatarText: '👤',
    memberLevelLabel: '未登录',
    menuGroups: MENU_GROUPS,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const isLoggedIn = sessionStore.isLoggedIn();
    this.setData({
      isLoggedIn,
      nickname: isLoggedIn ? '加载中...' : '点击登录',
      avatarText: '👤',
      memberLevelLabel: isLoggedIn ? '会员信息加载中' : '未登录',
    });

    if (!isLoggedIn) {
      return;
    }

    try {
      const profile = await sessionStore.fetchProfile();
      const nickname = (profile && (profile.nickname || profile.name)) || '已登录用户';

      this.setData({
        nickname,
        avatarText: nickname.slice(0, 1),
        memberLevelLabel: normalizeLevelLabel(profile && (profile.memberLevel || profile.member_level)),
      });
    } catch (error) {
      this.setData({
        nickname: '已登录用户',
        avatarText: '已',
        memberLevelLabel: '会员信息加载失败',
      });
    }
  },

  handleProfileTap() {
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage('/pages/profile/settings/index');
  },

  openEntry(event) {
    const url = String(event.currentTarget.dataset.url || '');
    if (!url) {
      return;
    }
    if (!this.data.isLoggedIn && url !== '/pages/profile/online-service/index') {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage(url);
  },
});
