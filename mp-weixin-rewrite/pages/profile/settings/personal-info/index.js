const api = require('../../../../api/index');

Page({
  data: {
    loading: true,
    profile: {},
    editing: false,
    nickname: '',
    gender: 1,
    birthday: '',
    idCard: '',
    maxBirthday: '2026-07-23',
    avatarText: '?',
    displayIdCard: '未认证',
    displayCardNo: '未生成',
    displayGender: '男',
    birthdayPickerText: '请选择生日',
    birthdayDisplayText: '未设置',
    maleChipClass: 'chip data-v-acab1652 active',
    femaleChipClass: 'chip data-v-acab1652',
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const response = await api.getUserProfile();
      const profile = (response && response.data) || response || {};
      this.applyProfileData({
        loading: false,
        profile,
        editing: false,
        nickname: profile.nickname || '',
        gender: Number(profile.gender || 1),
        birthday: profile.birthday || '',
        idCard: profile.idCard || profile.id_card || '',
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
      nickname: profile.nickname || '',
      idCard: profile.idCard || profile.id_card || '',
      birthday: profile.birthday || '',
    });
  },

  handleNicknameInput(event) {
    this.applyProfileData({ nickname: event.detail.value || '' });
  },

  handleIdCardInput(event) {
    this.applyProfileData({ idCard: event.detail.value || '' });
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

  applyProfileData(updates) {
    const nextData = Object.assign({}, this.data, updates);
    const profile = nextData.profile || {};
    const nickname = String(nextData.nickname || profile.nickname || '').trim();
    const birthday = nextData.birthday || '';
    const gender = Number(nextData.gender || 1);

    this.setData(
      Object.assign({}, updates, {
        avatarText: nickname ? nickname.slice(0, 1) : '?',
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
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (idCard && !/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }
    try {
      await api.updateUserProfile({
        nickname,
        gender: this.data.gender,
        birthday: this.data.birthday,
        idCard,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      await this.loadProfile();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' });
    }
  },
});
