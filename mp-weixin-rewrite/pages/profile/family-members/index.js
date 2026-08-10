const api = require('../../../api/index');

const RELATION_LABELS = {
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
  self: '本人',
};

function normalizeGenderValue(value) {
  const gender = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (gender === '1' || gender === '男' || gender === 'male' || gender === 'm') return '男';
  if (gender === '2' || gender === '女' || gender === 'female' || gender === 'f') return '女';
  return '未填写';
}

function normalizeAgeValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const age = Number(value);
  if (!Number.isFinite(age) || age <= 0) return '';
  return String(Math.floor(age));
}

function calculateAgeFromBirthday(birthday) {
  if (!birthday) return '';
  const normalized = String(birthday).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const today = new Date();
  const birthDate = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age > 0 ? String(age) : '';
}

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
  const age = normalizeAgeValue(member.age);
  const phone = member.phone === null || member.phone === undefined ? '' : String(member.phone);
  return {
    id: String(member.id || ''),
    avatarText: name.slice(0, 1) || '?',
    name,
    relationLabel: RELATION_LABELS[member.relation] || member.relation || '',
    genderLabel: normalizeGenderValue(member.gender),
    ageLabel: age,
    phone,
    hasSnore: Boolean(member.hasSnore || member.has_snore),
    lastVisit: member.lastVisit || member.last_visit || '',
    idCard: member.idCard || member.id_card || '',
    cardNo: member.cardNo || member.card_no || '',
  };
}

function mergeSelfProfile(member, profile) {
  if (!member || member.relationLabel !== '本人' || !profile) {
    return member;
  }
  const profileAge = normalizeAgeValue(profile.age) || calculateAgeFromBirthday(profile.birthday);
  const profilePhone = profile.phone === null || profile.phone === undefined ? '' : String(profile.phone);
  return Object.assign({}, member, {
    ageLabel: profileAge || member.ageLabel,
    phone: profilePhone || member.phone,
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    members: [],
  },

  onShow() {
    this.fetchFamilyMembers({ silent: this.data.hasLoaded });
  },

  async fetchFamilyMembers(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const [response, profileResponse] = await Promise.all([
        api.getFamilyMembers(),
        api.getUserProfile(),
      ]);
      const profile = (profileResponse && profileResponse.data) || profileResponse || {};
      const members = unwrapList(response).map((member) => mergeSelfProfile(normalizeMember(member), profile));
      this.setData({
        hasLoaded: true,
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
