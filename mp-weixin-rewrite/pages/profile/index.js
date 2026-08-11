const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');
const { normalizeImageUrl } = require('../../common/utils/image-url');

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
      { key: 'orders', label: '我的订单', icon: '/static/icons/report.svg', url: '/pages/order/index' },
      { key: 'distribution', label: '分销中心', icon: '/static/icons/distribution.svg', url: '/pages/distribution/center/index' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'service', label: '在线客服', icon: '/static/icons/chat.svg', url: '/pages/profile/online-service/index' },
      { key: 'notifications', label: '消息通知', icon: '/static/icons/bell.svg', url: '/pages/profile/notifications/index' },
      { key: 'settings', label: '设置', icon: '/static/icons/settings-gear.svg', url: '/pages/profile/settings/index' },
    ],
  },
];

function getAvatarColor(name) {
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

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

function isPremiumServiceLevel(level) {
  return level === 'gold' || level === 'diamond';
}

function isPlaceholderNickname(nickname) {
  const text = String(nickname || '').trim();
  return !text || text === '微信用户' || text.indexOf('微信用户') === 0;
}

function resolveDisplayNickname(profile) {
  const nickname = String((profile && (profile.nickname || profile.name)) || '').trim();
  return nickname || '微信用户';
}

function needsProfileCompletion(profile) {
  const avatar = String(profile && (profile.avatar || profile.avatarUrl || profile.avatar_url) || '').trim();
  const nickname = String(profile && (profile.nickname || profile.name) || '').trim();
  return isPlaceholderNickname(nickname) || !avatar || avatar === '/static/demo/avatar.jpg';
}

function resolveMemberLevelLabel(profile, memberInfo, memberLevels) {
  const currentLevel = memberInfo && (memberInfo.currentLevel || memberInfo.level);
  const matchedLevel = Array.isArray(memberLevels) && currentLevel
    ? memberLevels.find((item) => item && item.level === currentLevel)
    : null;
  if (matchedLevel && matchedLevel.title) {
    return String(matchedLevel.title);
  }

  const profileLevel = profile && (
    profile.memberLevel ||
    profile.member_level ||
    profile.currentLevel ||
    profile.current_level ||
    profile.level
  );
  const matchedProfileLevel = Array.isArray(memberLevels) && profileLevel
    ? memberLevels.find((item) => item && item.level === profileLevel)
    : null;
  if (matchedProfileLevel && matchedProfileLevel.title) {
    return String(matchedProfileLevel.title);
  }

  if (currentLevel) {
    return normalizeLevelLabel(currentLevel);
  }

  const levelTitle = memberInfo && (memberInfo.currentLevelTitle || memberInfo.levelTitle || memberInfo.title);
  if (levelTitle) {
    return String(levelTitle);
  }

  return normalizeLevelLabel(profileLevel);
}

Page({
  data: {
    isLoggedIn: false,
    hasLoaded: false,
    showProfileSetupCard: false,
    nickname: '点击登录',
    avatarText: '👤',
    avatarUrl: '',
    avatarBg: '#3b6bf5',
    memberLevelLabel: '未登录',
    notificationsUnreadCount: 0,
    serviceUnreadCount: 0,
    menuGroups: MENU_GROUPS,
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    const isLoggedIn = sessionStore.isLoggedIn();
    if (!silent) {
      this.setData({
        isLoggedIn,
        nickname: isLoggedIn ? '加载中...' : '点击登录',
        avatarText: '👤',
        avatarUrl: '',
        avatarBg: '#3b6bf5',
        memberLevelLabel: isLoggedIn ? '会员信息加载中' : '未登录',
      });
    } else {
      this.setData({ isLoggedIn });
    }

    if (!isLoggedIn) {
      this.setData({
        hasLoaded: true,
        showProfileSetupCard: false,
        nickname: '点击登录',
        avatarText: '👤',
        avatarUrl: '',
        avatarBg: '#3b6bf5',
        memberLevelLabel: '未登录',
        notificationsUnreadCount: 0,
        serviceUnreadCount: 0,
      });
      return;
    }

    try {
      const [profile, memberInfoResponse, memberLevelsResponse, notificationsResponse, serviceUnreadResponse] = await Promise.all([
        sessionStore.fetchProfile(),
        api.getMemberInfo().catch(() => null),
        api.getMemberLevels().catch(() => null),
        api.getNotifications().catch(() => null),
        api.getImUnreadCount().catch(() => null),
      ]);
      const nickname = resolveDisplayNickname(profile);
      const memberInfo =
        memberInfoResponse && memberInfoResponse.code === 0
          ? memberInfoResponse.data
          : (memberInfoResponse && memberInfoResponse.data) || memberInfoResponse || null;
      const memberLevels =
        memberLevelsResponse && memberLevelsResponse.code === 0 && Array.isArray(memberLevelsResponse.data)
          ? memberLevelsResponse.data
          : [];
      const notificationsPayload =
        notificationsResponse && notificationsResponse.data ? notificationsResponse.data : notificationsResponse || {};
      const notificationsList = Array.isArray(notificationsPayload.list) ? notificationsPayload.list : [];
      const notificationsUnreadCount = typeof notificationsPayload.unread === 'number'
        ? notificationsPayload.unread
        : notificationsList.filter((item) => !(item.isRead || item.is_read)).length;
      const servicePayload =
        serviceUnreadResponse && serviceUnreadResponse.data ? serviceUnreadResponse.data : serviceUnreadResponse || {};
      const serviceUnreadCount = Number(servicePayload.unread || 0);
      const currentLevel = memberInfo && (memberInfo.currentLevel || memberInfo.memberLevel || memberInfo.level || '');
      const menuGroups = MENU_GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          if (item.key !== 'service') return item;
          return Object.assign({}, item, {
            label: isPremiumServiceLevel(currentLevel) ? '专属客服' : '在线客服',
          });
        }),
      }));

      this.setData({
        hasLoaded: true,
        showProfileSetupCard: needsProfileCompletion(profile),
        nickname,
        avatarText: nickname.slice(0, 1),
        avatarUrl: normalizeImageUrl(profile && (profile.avatar || profile.avatarUrl || profile.avatar_url)),
        avatarBg: getAvatarColor(nickname),
        memberLevelLabel: resolveMemberLevelLabel(profile, memberInfo, memberLevels),
        notificationsUnreadCount,
        serviceUnreadCount,
        menuGroups,
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          showProfileSetupCard: false,
          nickname: '微信用户',
          avatarText: '微',
          avatarUrl: '',
          avatarBg: getAvatarColor('微信用户'),
          memberLevelLabel: '会员信息加载失败',
          notificationsUnreadCount: 0,
          serviceUnreadCount: 0,
        });
      }
    }
  },

  handleProfileTap() {
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage('/pages/profile/settings/personal-info/index');
  },

  handleCompleteProfile() {
    if (!this.data.isLoggedIn) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    navigation.openPage('/pages/profile/settings/personal-info/index?fromLogin=1&autoEdit=1');
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
