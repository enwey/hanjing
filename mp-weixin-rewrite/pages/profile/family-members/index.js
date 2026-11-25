const api = require('../../../api/index');
const { normalizeImageUrl } = require('../../../common/utils/image-url');
const sessionStore = require('../../../stores/session-store');

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
  return '未设置';
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
    avatarUrl: normalizeImageUrl(member.avatarUrl || member.avatar || member.avatar_url || ''),
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
    selectionMode: false,
    selectedId: '',
  },

  onLoad(options = {}) {
    this.selectionGeneration = sessionStore.getLoginGeneration();
    this.selectionStoreId = String(options.storeId || '');
    this.selectionStoreName = String(options.storeName || '');
    this.setData({ selectionMode: options.source === 'appointment', selectedId: String(options.selectedId || '') });
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
    const params = this.data.selectionMode ? [
      'source=appointment',
      this.selectionStoreId ? 'storeId=' + encodeURIComponent(this.selectionStoreId) : '',
      this.selectionStoreName ? 'storeName=' + encodeURIComponent(this.selectionStoreName) : '',
    ].filter(Boolean).join('&') : '';
    wx.navigateTo({
      url: '/pages/profile/family-members/add-member/index' + (params ? '?' + params : ''),
    });
  },

  selectCreatedPatient(id) {
    if (!this.data.selectionMode || this.selectionGeneration !== sessionStore.getLoginGeneration()) return;
    this.setData({ selectedId: String(id) });
    const pages = getCurrentPages();
    const confirmPage = pages[pages.length - 3];
    if (confirmPage && typeof confirmPage.selectCreatedPatient === 'function') confirmPage.selectCreatedPatient(id);
  },

  goMemberDetail(event) {
    const memberId = String(event.currentTarget.dataset.id || '');
    if (!memberId) {
      return;
    }
    if (this.data.selectionMode) {
      if (this.selectionGeneration !== sessionStore.getLoginGeneration()) {
        wx.showToast({ title: '登录状态已变更，请重新选择就诊人', icon: 'none' });
        return;
      }
      const member = this.data.members.find(item => item.id === memberId);
      if (!member) return;
      const choose = () => {
        if (this.selectionGeneration !== sessionStore.getLoginGeneration()) return;
        const pages = getCurrentPages();
        const confirmPage = pages[pages.length - 2];
        if (!confirmPage || typeof confirmPage.selectCreatedPatient !== 'function') return;
        confirmPage.selectCreatedPatient(memberId);
        wx.navigateBack();
      };
      if (member.ageLabel && Number(member.ageLabel) < 18) {
        wx.showModal({ title: '儿童就诊提示', content: '本门诊定制式下颌前移防鼾器（牙套）仅适用于18岁以上发育成熟的成人。18岁以下儿童打鼾通常由扁桃体或腺样体肥大引起，建议优先预约小儿耳鼻喉科进行排查诊治。是否继续？', confirmText: '继续预约', cancelText: '取消', success: result => { if (result.confirm) choose(); } });
      } else choose();
      return;
    }
    wx.navigateTo({
      url: '/pages/profile/family-members/add-member/index?id=' + memberId,
    });
  },
});
