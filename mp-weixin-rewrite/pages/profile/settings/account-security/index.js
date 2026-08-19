const api = require('../../../../api/index');

Page({
  data: {
    loading: true,
    hasLoaded: false,
    info: null,
    showPhoneModal: false,
    showRealnameModal: false,
    showPasswordModal: false,
    inputRealName: '',
    inputIdCard: '',
    inputOldPassword: '',
    inputNewPassword: '',
    inputConfirmPassword: '',
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

  openPasswordModal() {
    this.setData({
      showPasswordModal: true,
      inputOldPassword: '',
      inputNewPassword: '',
      inputConfirmPassword: '',
    });
  },

  closeRealnameModal() {
    this.setData({ showRealnameModal: false });
  },

  closePasswordModal() {
    this.setData({ showPasswordModal: false });
  },

  handleOldPasswordInput(event) {
    this.setData({ inputOldPassword: event.detail.value || '' });
  },

  handleNewPasswordInput(event) {
    this.setData({ inputNewPassword: event.detail.value || '' });
  },

  handleConfirmPasswordInput(event) {
    this.setData({ inputConfirmPassword: event.detail.value || '' });
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

  async onSubmitPassword() {
    const hasPassword = Boolean(this.data.info && this.data.info.hasPassword);
    const oldPassword = String(this.data.inputOldPassword || '').trim();
    const newPassword = String(this.data.inputNewPassword || '').trim();
    const confirmPassword = String(this.data.inputConfirmPassword || '').trim();

    if (hasPassword && !oldPassword) {
      wx.showToast({ title: '请输入当前密码', icon: 'none' });
      return;
    }
    if (!newPassword || !confirmPassword) {
      wx.showToast({ title: '请填写完整密码信息', icon: 'none' });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次输入密码不一致', icon: 'none' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 20) {
      wx.showToast({ title: '密码长度需为6到20位', icon: 'none' });
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{6,20}$/.test(newPassword)) {
      wx.showToast({ title: '密码需包含字母和数字', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: hasPassword ? '修改中...' : '设置中...' });
      const response = await api.updateUserPassword(oldPassword, newPassword, confirmPassword);
      if (response && response.code === 0) {
        this.setData({ showPasswordModal: false });
        await this.fetchInfo({ silent: true });
        wx.showModal({
          title: hasPassword ? '密码修改成功' : '密码设置成功',
          content: hasPassword
            ? '新密码已生效，后续可使用绑定手机号和新密码登录推广后台。'
            : '登录密码已设置完成，后续可使用绑定手机号和该密码登录推广后台。',
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      wx.showToast({ title: (response && response.message) || '设置失败', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '设置失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
