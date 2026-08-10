const api = require('../../../../api/index');

Page({
  data: {
    loading: true,
    hasLoaded: false,
    info: null,
    isDevTools: false,
    showPhoneModal: false,
    showRealnameModal: false,
    inputRealName: '',
    inputIdCard: '',
  },

  onLoad() {
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({ isDevTools: sysInfo.platform === 'devtools' });
    } catch (error) {
      console.error(error);
    }
  },

  onShow() {
    this.fetchInfo({ silent: this.data.hasLoaded });
  },

  async fetchInfo(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const response = await api.getAccountSecurity();
      this.setData({
        hasLoaded: true,
        loading: false,
        info: (response && response.data) || response || null,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }
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

  async onChangePhoneByWechat(event) {
    const detail = event && event.detail ? event.detail : {};
    if (!detail.code) {
      wx.showToast({ title: '授权已取消', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '换绑中...' });
      const response = await api.changePhone('', '', detail.code);
      if (response && response.code === 0) {
        wx.showToast({ title: '手机换绑成功', icon: 'success' });
        this.setData({ showPhoneModal: false });
        await this.fetchInfo();
        return;
      }
      wx.showToast({ title: (response && response.message) || '修改失败', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '换绑失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDeveloperChangePhone() {
    wx.showModal({
      title: '模拟微信手机号换绑',
      content: '',
      editable: true,
      placeholderText: '请输入测试手机号（11位数字）',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        const phone = result.content ? result.content.trim() : '';
        if (!/^\d{11}$/.test(phone)) {
          wx.showToast({ title: '请输入11位数字手机号', icon: 'none' });
          return;
        }
        try {
          wx.showLoading({ title: '换绑中...' });
          const response = await api.changePhone('', '', phone);
          if (response && response.code === 0) {
            wx.showToast({ title: '手机换绑成功', icon: 'success' });
            this.setData({ showPhoneModal: false });
            await this.fetchInfo();
            return;
          }
          wx.showToast({ title: (response && response.message) || '修改失败', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '换绑失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
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
});
