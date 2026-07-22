const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');

Page({
  data: {
    agreed: false,
    isDevTools: false,
  },

  onLoad() {
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({ isDevTools: sysInfo.platform === 'devtools' });
    } catch (error) {
      console.error(error);
    }
  },

  handleAgreementChange(event) {
    const values = event.detail.value || [];
    this.setData({ agreed: values.indexOf('agree') > -1 });
  },

  viewAgreement() {
    wx.navigateTo({ url: '/pages/auth/agreement/index' });
  },

  viewPrivacy() {
    wx.navigateTo({ url: '/pages/auth/privacy/index' });
  },

  onCancel() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  onLoginTap() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议与隐私政策', icon: 'none' });
    }
  },

  async onGetPhoneNumber(event) {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议与隐私政策', icon: 'none' });
      return;
    }
    const detail = event && event.detail ? event.detail : {};
    if (!detail.code) {
      wx.showToast({ title: '授权已取消', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全登录中...' });
    try {
      await sessionStore.login(detail.code);
      await sessionStore.fetchProfile();
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        if (getCurrentPages().length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({ url: '/pages/profile/index' });
        }
      }, 1200);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      console.error(error);
    }
  },

  async onDeveloperLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议与隐私政策', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '模拟手机号登录',
      content: '',
      editable: true,
      placeholderText: '请输入测试登录的手机号（11位数字）',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        const phone = result.content ? result.content.trim() : '';
        if (!/^\d{11}$/.test(phone)) {
          wx.showToast({ title: '请输入11位数字手机号', icon: 'none' });
          return;
        }

        wx.showLoading({ title: '安全登录中...' });
        try {
          await sessionStore.login(phone);
          await sessionStore.fetchProfile();
          wx.hideLoading();
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            if (getCurrentPages().length > 1) {
              wx.navigateBack();
            } else {
              wx.switchTab({ url: '/pages/profile/index' });
            }
          }, 1200);
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          console.error(error);
        }
      },
    });
  },
});
