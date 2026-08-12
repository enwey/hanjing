const api = require('../../../api/index');
const { formatChinaDate } = require('../../../common/utils/date-time');

const LEVEL_LABEL_MAP = {
  gold: '金牌',
  silver: '银牌',
  diamond: '钻石',
  member: '成员',
};

function formatWanAmountLabel(amountInCents) {
  const amount = Number(amountInCents || 0) / 10000;
  return amount.toFixed(1) + 'w';
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadError: '',
    teamCount: 0,
    level2Count: 0,
    totalSalesLabel: '0.0w',
    members: [],
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const [membersResponse, infoResponse] = await Promise.all([
        api.getTeamMembers(),
        api.getDistributorInfo(),
      ]);
      const members = unwrapList(membersResponse).map((member) => ({
        id: String(member.id || ''),
        avatarText: (member.nickname || member.name || LEVEL_LABEL_MAP[member.level] || '成').slice(0, 1),
        nickname: member.nickname || member.name || '',
        orderCount: Number(member.orderCount || 0),
        totalSalesAmount: Number(member.totalSales || 0),
        levelLabel: LEVEL_LABEL_MAP[member.level] || '成员',
        levelClass: member.level || 'member',
        totalSalesLabel: formatWanAmountLabel(member.totalSales || 0),
        joinedAtText: formatChinaDate(member.joinedAt || ''),
        statusLabel: member.statusText || '',
        statusClass: member.statusClass || '',
      }));
      const info = (infoResponse && infoResponse.data) || infoResponse || {};
      const totalSalesAmount = members.reduce((sum, item) => sum + Number(item.totalSalesAmount || 0), 0);

      this.setData({
        hasLoaded: true,
        loading: false,
        teamCount: Number(info.teamCount || 0),
        level2Count: Number(info.teamLevel2Count || 0),
        totalSalesLabel: formatWanAmountLabel(totalSalesAmount),
        members,
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载团队成员失败',
          members: [],
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载团队成员失败', icon: 'none' });
    }
  },
});
