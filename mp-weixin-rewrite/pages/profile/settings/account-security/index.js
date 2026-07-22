const userApi = require('../../../../api/modules/user-api');
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
    codeCountdown: 0,
  },

  async onShow() {
    await this.loadInfo();
  },

  async loadInfo() {
    try {
      const response = await userApi.getAccountSecurity();
      this.setData({
        loading: false,
        info: (response && response.data) || response || null,
      });
    } catch (error) {
      this.setData({ loading: false, info: null });
    }
  },

  onUnload() {
    this.clearCodeTimer();
  },

  onPhoneInput(event) { this.setData({ inputPhone: event.detail.value || '' }); },
  onCodeInput(event) { this.setData({ inputCode: event.detail.value || '' }); },
  onRealNameInput(event) { this.setData({ inputRealName: event.detail.value || '' }); },
  onIdCardInput(event) { this.setData({ inputIdCard: event.detail.value || '' }); },

  openPhoneModal() { this.setData({ showPhoneModal: true, inputPhone: '', inputCode: '', codeCountdown: 0 }); },
  closePhoneModal() { this.setData({ showPhoneModal: false }); },
  openRealnameModal() { this.setData({ showRealnameModal: true, inputRealName: '', inputIdCard: '' }); },
  closeRealnameModal() { this.setData({ showRealnameModal: false }); },

  async getCode() {
    if (!/^1\d{10}$/.test(String(this.data.inputPhone || ''))) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (this.data.codeCountdown > 0) {
      return;
    }
    try {
      await userApi.sendPhoneCode(this.data.inputPhone);
      wx.showToast({ title: '验证码已发送', icon: 'success' });
      this.startCodeCountdown();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '发送失败', icon: 'none' });
    }
  },

  startCodeCountdown() {
    this.clearCodeTimer();
    this.setData({ codeCountdown: 60 });
    this.codeTimer = setInterval(() => {
      const nextValue = this.data.codeCountdown - 1;
      if (nextValue <= 0) {
        this.clearCodeTimer();
        this.setData({ codeCountdown: 0 });
        return;
      }
      this.setData({ codeCountdown: nextValue });
    }, 1000);
  },

  clearCodeTimer() {
    if (this.codeTimer) {
      clearInterval(this.codeTimer);
      this.codeTimer = null;
    }
  },

  async submitPhone() {
    if (!/^1\d{10}$/.test(String(this.data.inputPhone || ''))) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!String(this.data.inputCode || '').trim()) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }
    try {
      await userApi.changePhone(this.data.inputPhone, this.data.inputCode);
      this.setData({ showPhoneModal: false });
      wx.showToast({ title: '手机换绑成功', icon: 'success' });
      await this.loadInfo();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '修改失败', icon: 'none' });
    }
  },

  async submitRealname() {
    if (!String(this.data.inputRealName || '').trim()) {
      wx.showToast({ title: '请输入真实姓名', icon: 'none' });
      return;
    }
    if (!/^\d{17}[\dXx]$/.test(String(this.data.inputIdCard || ''))) {
      wx.showToast({ title: '请输入正确的身份证号', icon: 'none' });
      return;
    }
    try {
      await userApi.verifyRealName(this.data.inputRealName, this.data.inputIdCard);
      this.setData({ showRealnameModal: false });
      wx.showToast({ title: '实名认证成功', icon: 'success' });
      await this.loadInfo();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '认证失败', icon: 'none' });
    }
  },

  logout() {
    sessionStore.logout();
    wx.removeStorageSync('selected_treatment_patient_id');
    wx.removeStorageSync('selected_medical_record_patient_id');
    wx.removeStorageSync('rewrite_current_patient_id');
    wx.switchTab({ url: '/pages/profile/index' });
  },
});
