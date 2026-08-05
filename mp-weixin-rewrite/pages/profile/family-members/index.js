const api = require('../../../api/index');

const RELATION_LABELS = {
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
  self: '本人',
};

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
  return [];
}

function normalizeMember(member) {
  const name = String(member.name || '');
  const gender = String(member.gender || '1');
  return {
    id: String(member.id || ''),
    avatarText: name.slice(0, 1) || '?',
    name,
    relationLabel: RELATION_LABELS[member.relation] || member.relation || '',
    genderLabel: gender === '1' ? '男' : '女',
    ageLabel: member.age === null || member.age === undefined ? '--' : String(member.age),
    phone: member.phone || '',
    hasSnore: Boolean(member.hasSnore || member.has_snore),
    lastVisit: member.lastVisit || member.last_visit || '',
    idCard: member.idCard || member.id_card || '',
    cardNo: member.cardNo || member.card_no || '',
  };
}

Page({
  data: {
    loading: true,
    members: [],
  },

  onShow() {
    this.fetchFamilyMembers();
  },

  async fetchFamilyMembers() {
    this.setData({ loading: true });
    try {
      const response = await api.getFamilyMembers();
      const members = unwrapList(response).map(normalizeMember);
      this.setData({
        members,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: (error && error.message) || '加载失败',
        icon: 'none',
      });
    }
  },

  goAddMember() {
    wx.navigateTo({
      url: '/pages/profile/family-members/add-member/index',
    });
  },

  goMemberDetail(event) {
    const memberId = String(event.currentTarget.dataset.id || '');
    if (!memberId) {
      return;
    }
    wx.navigateTo({
      url: '/pages/profile/family-members/add-member/index?id=' + memberId,
    });
  },
});
