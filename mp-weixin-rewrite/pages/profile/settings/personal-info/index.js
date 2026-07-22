const userApi = require('../../../../api/modules/user-api');

function maskIdCard(idCard) {
  const value = String(idCard || '');
  if (value.length < 8) {
    return value;
  }
  return value.slice(0, 4) + '**********' + value.slice(-4);
}

function getAvatarBadgeText(nickname) {
  const value = String(nickname || '').trim();
  return value ? value.slice(0, 1) : '?';
}

Page({
  data: {
    loading: true,
    profile: null,
    editing: false,
    summary: {
      avatarBadge: '?',
      nickname: '',
      genderLabel: '',
      birthday: '',
      idCardMasked: '',
      cardNo: '',
    },
    form: {
      nickname: '',
      gender: 1,
      birthday: '',
      idCard: '',
    },
  },

  async onShow() {
    await this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const response = await userApi.getUserProfile();
      const profile = (response && response.data) || response || {};
      this.setData({
        loading: false,
        profile,
        summary: {
          avatarBadge: getAvatarBadgeText(profile.nickname),
          nickname: profile.nickname || '',
          genderLabel: Number(profile.gender || 1) === 1 ? '男' : '女',
          birthday: profile.birthday || '',
          idCardMasked: maskIdCard(profile.idCard),
          cardNo: profile.cardNo || '',
        },
        form: {
          nickname: profile.nickname || '',
          gender: Number(profile.gender || 1),
          birthday: profile.birthday || '',
          idCard: profile.idCard || '',
        },
      });
    } catch (error) {
      this.setData({ loading: false, profile: null });
    }
  },

  startEdit() {
    this.setData({ editing: true });
  },

  cancelEdit() {
    const profile = this.data.profile || {};
    this.setData({
      editing: false,
      form: {
        nickname: profile.nickname || '',
        gender: Number(profile.gender || 1),
        birthday: profile.birthday || '',
        idCard: profile.idCard || '',
      },
    });
  },

  onInputNickname(event) {
    this.setData({ 'form.nickname': event.detail.value || '' });
  },

  onInputIdCard(event) {
    this.setData({ 'form.idCard': event.detail.value || '' });
  },

  chooseGender(event) {
    this.setData({ 'form.gender': Number(event.currentTarget.dataset.gender || 1) });
  },

  chooseBirthday(event) {
    this.setData({ 'form.birthday': event.detail.value || '' });
  },

  async saveProfile() {
    if (!String(this.data.form.nickname || '').trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (this.data.form.idCard && !/^\d{17}[\dXx]$/.test(String(this.data.form.idCard))) {
      wx.showToast({ title: '请输入正确的身份证号', icon: 'none' });
      return;
    }
    try {
      await userApi.updateUserProfile(this.data.form);
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ editing: false });
      await this.loadProfile();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' });
    }
  },
});
