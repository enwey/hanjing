const api = require('../../../../api/index');
const sessionStore = require('../../../../stores/session-store');
const { normalizeImageUrl } = require('../../../../common/utils/image-url');

function isPlaceholderNickname(nickname) {
  const text = String(nickname || '').trim();
  return !text || text === '微信用户' || text.indexOf('微信用户_') === 0;
}

function resolveDisplayNickname(nickname) {
  const text = String(nickname || '').trim();
  return isPlaceholderNickname(text) ? '尊敬的微信用户' : text;
}

function getFileExt(path) {
  const match = String(path || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = match && match[1] ? match[1].toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'gif'].includes(ext) ? ext : 'jpg';
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    profileSetupMode: false,
    profile: {},
    editing: false,
    nickname: '',
    nicknameCursor: -1,
    gender: 1,
    birthday: '',
    idCard: '',
    idCardCursor: -1,
    maxBirthday: '2026-07-23',
    avatarText: '?',
    avatarUrl: '',
    pendingAvatarPath: '',
    displayIdCard: '未认证',
    displayCardNo: '未生成',
    displayGender: '男',
    birthdayPickerText: '请选择生日',
    birthdayDisplayText: '未设置',
    maleChipClass: 'chip data-v-acab1652 active',
    femaleChipClass: 'chip data-v-acab1652',
    avatarUploading: false,
  },

  onLoad(options = {}) {
    const profileSetupMode = String(options.fromLogin || '') === '1';
    const autoEdit = String(options.autoEdit || '') === '1';
    this.setData({
      profileSetupMode,
      editing: autoEdit,
    });
  },

  onShow() {
    this.loadProfile({ silent: this.data.hasLoaded });
  },

  async loadProfile(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const response = await api.getUserProfile();
      const profile = (response && response.data) || response || {};
      sessionStore.state.profile = profile;
      this.applyProfileData({
        hasLoaded: true,
        loading: false,
        profile,
        editing: this.data.editing || this.data.profileSetupMode,
        nickname: resolveDisplayNickname(profile.nickname),
        nicknameCursor: String(resolveDisplayNickname(profile.nickname) || '').length,
        gender: Number(profile.gender || 1),
        birthday: profile.birthday || '',
        idCard: profile.idCard || profile.id_card || '',
        idCardCursor: String(profile.idCard || profile.id_card || '').length,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载失败', icon: 'none' });
    }
  },

  startEdit() {
    this.setData({ editing: true });
  },

  cancelEdit() {
    const profile = this.data.profile || {};
    this.applyProfileData({
      editing: false,
      gender: Number(profile.gender || 1),
      nickname: resolveDisplayNickname(profile.nickname),
      nicknameCursor: String(resolveDisplayNickname(profile.nickname) || '').length,
      idCard: profile.idCard || profile.id_card || '',
      idCardCursor: String(profile.idCard || profile.id_card || '').length,
      birthday: profile.birthday || '',
      pendingAvatarPath: '',
      avatarUrl: normalizeImageUrl(profile.avatar || profile.avatarUrl || profile.avatar_url),
    });
  },

  handleNicknameInput(event) {
    const value = event.detail.value || '';
    this.applyProfileData({ nickname: value, nicknameCursor: value.length });
  },

  handleIdCardInput(event) {
    const value = event.detail.value || '';
    this.applyProfileData({ idCard: value, idCardCursor: value.length });
  },

  handleNicknameFocus() {
    const nickname = String(this.data.nickname || '');
    this.setData({ nicknameCursor: nickname.length });
  },

  handleIdCardFocus() {
    const idCard = String(this.data.idCard || '');
    this.setData({ idCardCursor: idCard.length });
  },

  selectMale() {
    this.applyProfileData({ gender: 1 });
  },

  selectFemale() {
    this.applyProfileData({ gender: 2 });
  },

  handleBirthdayChange(event) {
    this.applyProfileData({ birthday: event.detail.value || '' });
  },

  async handleChooseAvatar(event) {
    const avatarPath = event && event.detail ? event.detail.avatarUrl : '';
    if (!avatarPath) {
      wx.showToast({ title: '未选择头像', icon: 'none' });
      return;
    }
    this.applyProfileData({
      pendingAvatarPath: avatarPath,
      avatarUrl: avatarPath,
    });
    wx.showToast({ title: '头像已选择', icon: 'success' });
  },

  applyProfileData(updates) {
    const nextData = Object.assign({}, this.data, updates);
    const profile = nextData.profile || {};
    const nickname = String(nextData.nickname || resolveDisplayNickname(profile.nickname) || '').trim();
    const birthday = nextData.birthday || '';
    const gender = Number(nextData.gender || 1);
    const avatarUrl = normalizeImageUrl(nextData.avatarUrl || profile.avatar || profile.avatarUrl || profile.avatar_url);

    this.setData(
      Object.assign({}, updates, {
        avatarText: nickname ? nickname.slice(0, 1) : '?',
        avatarUrl,
        displayIdCard: profile.idCard || profile.id_card || '未认证',
        displayCardNo: profile.cardNo || profile.card_no || '未生成',
        displayGender: gender === 2 ? '女' : '男',
        birthdayPickerText: birthday || '请选择生日',
        birthdayDisplayText: birthday || '未设置',
        maleChipClass: gender === 1 ? 'chip data-v-acab1652 active' : 'chip data-v-acab1652',
        femaleChipClass: gender === 2 ? 'chip data-v-acab1652 active' : 'chip data-v-acab1652',
      })
    );
  },

  async saveProfile() {
    const nickname = String(this.data.nickname || '').trim();
    const idCard = String(this.data.idCard || '').trim();
    const pendingAvatarPath = String(this.data.pendingAvatarPath || '').trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (idCard && !/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }
    try {
      this.setData({ avatarUploading: Boolean(pendingAvatarPath) });
      if (pendingAvatarPath) {
        wx.showLoading({ title: '保存资料中...' });
      }
      let avatar = (this.data.profile && this.data.profile.avatar) || '';
      if (pendingAvatarPath) {
        const uploadResponse = await api.uploadLocalFile(pendingAvatarPath, getFileExt(pendingAvatarPath));
        const uploadData = (uploadResponse && uploadResponse.data) || uploadResponse || {};
        if (!uploadData.url) {
          throw new Error('上传文件失败');
        }
        avatar = uploadData.url;
      }
      const response = await api.updateUserProfile({
        nickname,
        gender: this.data.gender,
        birthday: this.data.birthday,
        idCard,
        avatar,
      });
      const profile = (response && response.data) || response || {};
      sessionStore.state.profile = profile;
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ profileSetupMode: false, editing: false, pendingAvatarPath: '', avatarUploading: false });
      await this.loadProfile();
    } catch (error) {
      wx.hideLoading();
      this.setData({ avatarUploading: false });
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' });
    }
  },
});
