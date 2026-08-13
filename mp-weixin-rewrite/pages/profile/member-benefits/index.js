const api = require('../../../api/index');

const LEVEL_THEMES = {
  normal: {
    bg: 'linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)',
  },
  silver: {
    bg: 'linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)',
  },
  gold: {
    bg: 'linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)',
  },
  diamond: {
    bg: 'linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)',
  },
};

const BENEFIT_META = {
  appointment: {
    icon: '/static/icons/calendar.svg',
    iconBg: 'linear-gradient(135deg, #e8f0ff 0%, #cddcff 100%)',
  },
  assess: {
    icon: '/static/icons/assessment.svg',
    iconBg: 'linear-gradient(135deg, #e9fbf1 0%, #c9f2db 100%)',
  },
  discount: {
    icon: '/static/icons/price.svg',
    iconBg: 'linear-gradient(135deg, #fff1e8 0%, #ffd9c2 100%)',
  },
  service: {
    icon: '/static/icons/chat.svg',
    iconBg: 'linear-gradient(135deg, #eef4ff 0%, #d9e6ff 100%)',
  },
  channel: {
    icon: '/static/icons/community.svg',
    iconBg: 'linear-gradient(135deg, #f3ecff 0%, #e1d1ff 100%)',
  },
  free: {
    icon: '/static/icons/heart.svg',
    iconBg: 'linear-gradient(135deg, #fff4dd 0%, #ffe3a8 100%)',
  },
};

function formatPriceYuan(value) {
  return '¥' + (Number(value || 0) / 100).toFixed(0);
}

function normalizeBenefitContent(level, benefit) {
  if (level === 'normal' && benefit && benefit.icon === 'appointment') {
    return Object.assign({}, benefit, {
      title: '内容权益',
      desc: '解锁更多睡眠内容与会员服务',
    });
  }
  return benefit;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    memberInfo: null,
    errorMessage: '',
    levelCardBg: '',
    currentLevelTitle: '',
    totalSpentText: '¥0',
    pointsText: '0',
    needUpgrade: false,
    nextLevelDiffText: '',
    nextLevelTitle: '',
    progressWidth: '0%',
    currentBenefits: [],
    levelRows: [],
  },

  onShow() {
    this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    this.setData({
      loading: silent ? false : true,
      memberInfo: silent ? this.data.memberInfo : null,
      errorMessage: silent ? this.data.errorMessage : '',
    });

    try {
      const [memberInfoRes, memberLevelsRes] = await Promise.all([
        api.getMemberInfo(),
        api.getMemberLevels(),
      ]);
      const memberInfo = memberInfoRes && memberInfoRes.code === 0 ? memberInfoRes.data : null;
      const memberLevels = memberLevelsRes && memberLevelsRes.code === 0 && Array.isArray(memberLevelsRes.data) ? memberLevelsRes.data : [];

      if (
        !memberInfo ||
        !memberInfo.currentLevel ||
        typeof memberInfo.points !== 'number' ||
        typeof memberInfo.totalSpent !== 'number' ||
        !memberLevels.length ||
        !memberLevels.some((item) => item.level === memberInfo.currentLevel)
      ) {
        throw new Error('会员数据不完整');
      }

      const currentLevel = memberLevels.find((item) => item.level === memberInfo.currentLevel) || null;
      const currentTheme = currentLevel ? (LEVEL_THEMES[currentLevel.level] || LEVEL_THEMES.normal) : LEVEL_THEMES.normal;
      const currentLevelIndex = memberLevels.findIndex((item) => item.level === memberInfo.currentLevel);

      const mergedBenefits = new Map();
      memberLevels
        .filter((item, index) => index <= currentLevelIndex)
        .forEach((level) => {
          (Array.isArray(level.benefits) ? level.benefits : []).forEach((benefit) => {
            const normalizedBenefit = normalizeBenefitContent(level.level, benefit);
            if (benefit.icon === 'channel') {
              return;
            }
            const meta = BENEFIT_META[normalizedBenefit.icon];
            if (!meta || !normalizedBenefit.title || !normalizedBenefit.desc) {
              return;
            }
            mergedBenefits.set(normalizedBenefit.icon, {
              key: normalizedBenefit.icon,
              icon: meta.icon,
              iconBg: meta.iconBg,
              title: normalizedBenefit.title,
              desc: normalizedBenefit.desc,
            });
          });
        });

      let needUpgrade = false;
      let nextLevelDiffText = '';
      let nextLevelTitle = '';
      let progressWidth = '100%';
      if (currentLevel && currentLevelIndex >= 0 && currentLevelIndex < memberLevels.length - 1) {
        const nextLevel = memberLevels[currentLevelIndex + 1];
        const baseSpent = Number(currentLevel.spentRequired || 0);
        const nextSpent = Number(nextLevel.spentRequired || 0);
        const totalSpent = Number(memberInfo.totalSpent || 0);
        const diff = Math.max(0, nextSpent - totalSpent);
        const percent = nextSpent > baseSpent ? Math.min(100, Math.max(0, Math.round(((totalSpent - baseSpent) / (nextSpent - baseSpent)) * 100))) : 100;
        needUpgrade = diff > 0;
        nextLevelDiffText = formatPriceYuan(diff);
        nextLevelTitle = nextLevel.title || '';
        progressWidth = percent + '%';
      }

      const levelRows = memberLevels.map((level) => ({
        key: level.level,
        color: level.color,
        title: level.title,
        spentRequiredText: formatPriceYuan(level.spentRequired || 0),
        actionText: level.level === 'normal' ? '即享' : '升级',
        isCurrent: level.level === memberInfo.currentLevel,
      }));

      this.setData({
        hasLoaded: true,
        loading: false,
        memberInfo,
        levelCardBg: currentTheme.bg,
        currentLevelTitle: currentLevel ? currentLevel.title : '',
        totalSpentText: formatPriceYuan(memberInfo.totalSpent),
        pointsText: String(memberInfo.points),
        needUpgrade,
        nextLevelDiffText,
        nextLevelTitle,
        progressWidth,
        currentBenefits: Array.from(mergedBenefits.values()),
        levelRows,
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          memberInfo: null,
          errorMessage: (error && error.message) || '会员信息暂不可用',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '会员信息暂不可用', icon: 'none' });
    }
  },
});
