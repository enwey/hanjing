const api = require('../../../../api/index');
const sessionStore = require('../../../../stores/session-store');

Page({
  data: {
    loading: true,
    info: null,
    showPhoneModal: false,
    showRealnameModal: false,
    inputPhone: '',
    inputCode: '',
    inputRealName: '',
    inputIdCard: '',
  },

  onShow() {
    this.fetchInfo();
  },

  async fetchInfo() {
    this.setData({ loading: true });
    try {
      const response = await api.getAccountSecurity();
      this.setData({
        loading: false,
        info: (response && response.data) || response || null,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }
  },

  handlePhoneInput(event) {
    this.setData({ inputPhone: event.detail.value || '' });
  },

  handleCodeInput(event) {
    this.setData({ inputCode: event.detail.value || '' });
  },

  handleRealNameInput(event) {
    this.setData({ inputRealName: event.detail.value || '' });
  },

  handleIdCardInput(event) {
    this.setData({ inputIdCard: event.detail.value || '' });
  },

  openPhoneModal() {
    this.setData({
      showPhoneModal: true,
      inputPhone: '',
      inputCode: '',
    });
  },

  closePhoneModal() {
    this.setData({ showPhoneModal: false });
  },

  openRealnameModal() {
    this.setData({
      showRealnameModal: true,
      inputRealName: '',
      inputIdCard: '',
    });
  },

  closeRealnameModal() {
    this.setData({ showRealnameModal: false });
  },

  async onGetCode() {
    const phone = String(this.data.inputPhone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '发送中...' });
      const response = await api.sendPhoneCode(phone);
      if (response && response.code === 0) {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        if (response.data && response.data.code) {
          this.setData({ inputCode: response.data.code });
        }
      } else {
        wx.showToast({ title: (response && response.message) || '发送失败', icon: 'none' });
      }
    } catch (error) {
      wx.showToast({ title: '发送失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onSubmitPhone() {
    const phone = String(this.data.inputPhone || '').trim();
    const code = String(this.data.inputCode || '').trim();
    if (!phone || !code) {
      wx.showToast({ title: '请输入手机和验证码', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '提交中...' });
      const response = await api.changePhone(phone, code);
      if (response && response.code === 0) {
        wx.showToast({ title: '手机换绑成功', icon: 'success' });
        this.setData({ showPhoneModal: false });
        await this.fetchInfo();
      } else {
        wx.showToast({ title: (response && response.message) || '修改失败', icon: 'none' });
      }
    } catch (error) {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onSubmitRealname() {
    const realName = String(this.data.inputRealName || '').trim();
    const idCard = String(this.data.inputIdCard || '').trim();
    if (!realName || !idCard) {
      wx.showToast({ title: '请填写姓名和身份证', icon: 'none' });
      return;
    }
    if (!/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '身份证格式不正确', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '认证中...' });
      const response = await api.verifyRealName(realName, idCard);
      if (response && response.code === 0) {
        wx.showToast({ title: '实名认证成功', icon: 'success' });
        this.setData({ showRealnameModal: false });
        await this.fetchInfo();
      } else {
        wx.showToast({ title: (response && response.message) || '认证失败', icon: 'none' });
      }
    } catch (error) {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (result) => {
        if (!result.confirm) {
          return;
        }
        sessionStore.logout();
        wx.showToast({ title: '已退出登录', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/profile/index' });
        }, 1000);
      },
    });
  },
});
