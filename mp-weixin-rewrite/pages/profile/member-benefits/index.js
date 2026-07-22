const api = require('../../../api/index');

const LEVEL_THEME_MAP = {
  normal: {
    background: 'linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)',
    textColor: '#9a6a14',
  },
  silver: {
    background: 'linear-gradient(135deg, #fff7db 0%, #f9e7a8 45%, #f2c96b 100%)',
    textColor: '#9a6a14',
  },
  gold: {
    background: 'linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)',
    textColor: '#8a5a00',
  },
  diamond: {
    background: 'linear-gradient(135deg, #fff8e1 0%, #f6df95 42%, #e9b949 100%)',
    textColor: '#8a5a00',
  },
};

const BENEFIT_ICON_MAP = {
  appointment: {
    icon: '/static/icons/calendar.svg',
    background: 'linear-gradient(135deg, #e8f0ff 0%, #cddcff 100%)',
  },
  assess: {
    icon: '/static/icons/assessment.svg',
    background: 'linear-gradient(135deg, #e9fbf1 0%, #c9f2db 100%)',
  },
  discount: {
    icon: '/static/icons/price.svg',
    background: 'linear-gradient(135deg, #fff1e8 0%, #ffd9c2 100%)',
  },
  service: {
    icon: '/static/icons/chat.svg',
    background: 'linear-gradient(135deg, #eef4ff 0%, #d9e6ff 100%)',
  },
  channel: {
    icon: '/static/icons/community.svg',
    background: 'linear-gradient(135deg, #f3ecff 0%, #e1d1ff 100%)',
  },
  free: {
    icon: '/static/icons/heart.svg',
    background: 'linear-gradient(135deg, #fff4dd 0%, #ffe3a8 100%)',
  },
};

function normalizeMemberInfo(response) {
  const payload = response && response.data ? response.data : response || {};
  const source = payload.currentLevel ? payload : payload.data || payload.memberInfo || null;
  if (!source) {
    return null;
  }
  return {
    currentLevel: source.currentLevel || source.level || '',
    points: Number(source.points || 0),
    totalSpent: Number(source.totalSpent || 0),
  };
}

function normalizeMemberLevels(response) {
  const payload = response && response.data ? response.data : response || {};
  const sourceList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.list)
      ? payload.list
      : Array.isArray(payload.data)
        ? payload.data
        : [];
  return sourceList.map((level) => ({
    level: level.level || '',
    title: level.title || '',
    spentRequired: Number(level.spentRequired || 0),
    benefits: Array.isArray(level.benefits) ? level.benefits : [],
    color: level.color || '#d4a948',
  }));
}

function formatAmountYuan(amountInCents) {
  return '¥' + (Number(amountInCents || 0) / 100).toFixed(0);
}

function getCurrentLevel(memberInfo, memberLevels) {
  return memberLevels.find((level) => level.level === memberInfo.currentLevel) || null;
}

function getCurrentBenefits(memberInfo, memberLevels) {
  const currentLevelIndex = memberLevels.findIndex((level) => level.level === memberInfo.currentLevel);
  if (currentLevelIndex < 0) {
    return [];
  }

  const benefitMap = new Map();
  memberLevels
    .filter((level, levelIndex) => levelIndex <= currentLevelIndex)
    .forEach((level) => {
      const benefitList = Array.isArray(level.benefits) ? level.benefits : [];
      benefitList.forEach((benefit) => {
        const iconMeta = BENEFIT_ICON_MAP[benefit.icon];
        if (!iconMeta || !benefit.title || !benefit.desc) {
          return;
        }
        benefitMap.set(benefit.icon, {
          icon: iconMeta.icon,
          iconBackground: iconMeta.background,
          title: benefit.title,
          description: benefit.desc,
        });
      });
    });

  return Array.from(benefitMap.values());
}

function getProgressInfo(memberInfo, memberLevels) {
  const currentLevelIndex = memberLevels.findIndex((level) => level.level === memberInfo.currentLevel);
  if (currentLevelIndex < 0 || currentLevelIndex >= memberLevels.length - 1) {
    return {
      showProgress: false,
      progressWidth: '100%',
      nextLevelTitle: '',
      amountToNextLevelLabel: '',
    };
  }

  const currentLevel = memberLevels[currentLevelIndex];
  const nextLevel = memberLevels[currentLevelIndex + 1];
  const currentSpent = Number(memberInfo.totalSpent || 0);
  const currentRequired = Number(currentLevel.spentRequired || 0);
  const nextRequired = Number(nextLevel.spentRequired || 0);
  const progressBase = nextRequired - currentRequired;
  const progressValue = Math.max(0, currentSpent - currentRequired);
  const percent = progressBase > 0 ? Math.min(Math.round((progressValue / progressBase) * 100), 100) : 100;
  const amountToNextLevel = Math.max(0, nextRequired - currentSpent);

  return {
    showProgress: amountToNextLevel > 0,
    progressWidth: percent + '%',
    nextLevelTitle: nextLevel.title || '',
    amountToNextLevelLabel: formatAmountYuan(amountToNextLevel),
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    memberInfo: null,
    currentLevelTitle: '',
    currentLevelTheme: LEVEL_THEME_MAP.normal,
    totalSpentLabel: '¥0',
    pointsLabel: '0',
    currentBenefits: [],
    levelRows: [],
    showProgress: false,
    progressWidth: '0%',
    nextLevelTitle: '',
    amountToNextLevelLabel: '',
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [memberInfoResponse, memberLevelsResponse] = await Promise.all([
        api.getMemberInfo(),
        api.getMemberLevels(),
      ]);

      const memberInfo = normalizeMemberInfo(memberInfoResponse);
      const memberLevels = normalizeMemberLevels(memberLevelsResponse);
      if (
        !memberInfo ||
        !memberInfo.currentLevel ||
        !memberLevels.length
      ) {
        throw new Error('会员数据不完整');
      }

      const currentLevel = getCurrentLevel(memberInfo, memberLevels);
      if (!currentLevel) {
        throw new Error('会员等级不存在');
      }

      const currentBenefits = getCurrentBenefits(memberInfo, memberLevels);
      const progressInfo = getProgressInfo(memberInfo, memberLevels);
      const levelRows = memberLevels.map((level) => ({
        id: level.level,
        title: level.title || '',
        spentRequiredLabel: formatAmountYuan(level.spentRequired || 0),
        actionLabel: level.level === 'normal' ? '即享' : '升级',
        isCurrent: level.level === memberInfo.currentLevel,
        color: level.color || '#d4a948',
      }));

      this.setData({
        loading: false,
        memberInfo,
        currentLevelTitle: currentLevel.title || '',
        currentLevelTheme: LEVEL_THEME_MAP[currentLevel.level] || LEVEL_THEME_MAP.normal,
        totalSpentLabel: formatAmountYuan(memberInfo.totalSpent || 0),
        pointsLabel: String(memberInfo.points || 0),
        currentBenefits,
        levelRows,
        showProgress: progressInfo.showProgress,
        progressWidth: progressInfo.progressWidth,
        nextLevelTitle: progressInfo.nextLevelTitle,
        amountToNextLevelLabel: progressInfo.amountToNextLevelLabel,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '会员信息暂不可用',
        memberInfo: null,
        currentBenefits: [],
        levelRows: [],
      });
    }
  },
});
