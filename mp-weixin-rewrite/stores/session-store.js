const api = require('../api/index');

async function bindPendingInviteCode() {
  const pendingInviteCode = wx.getStorageSync('pending_invite_code');
  if (!pendingInviteCode) {
    return;
  }
  try {
    const response = await api.bindDistribution(pendingInviteCode);
    const status = (response && response.data && response.data.status) || response.status || 'bound';
    if (status === 'bound' || status === 'already_bound' || status === 'ignored_self') {
      wx.removeStorageSync('pending_invite_code');
    }
  } catch (error) {
    if (error && (error.message === '无效的邀请码' || error.message === '邀请码不能为空')) {
      wx.removeStorageSync('pending_invite_code');
    }
  }
}

const sessionStore = {
  state: {
    accessToken: wx.getStorageSync('access_token') || '',
    profile: null,
    currentPatientId: wx.getStorageSync('current_patient_id') || '',
  },

  isLoggedIn() { return Boolean(this.state.accessToken); },
  setAccessToken(accessToken) {
    this.state.accessToken = accessToken || '';
    if (accessToken) { wx.setStorageSync("access_token", accessToken); } else { wx.removeStorageSync("access_token"); }
  },
  setCurrentPatientId(patientId) {
    this.state.currentPatientId = patientId || '';
    if (patientId) { wx.setStorageSync("current_patient_id", patientId); } else { wx.removeStorageSync("current_patient_id"); }
  },
  async fetchProfile() {
    const response = await api.getUserProfile();
    this.state.profile = response.data || response;
    return this.state.profile;
  },
  async login(phoneCode) {
    const loginResponse = await new Promise((resolve, reject) => { wx.login({ success: resolve, fail: reject }); });
    const response = await api.wxLogin(loginResponse.code, phoneCode);
    const payload = response.data || response;
    this.setAccessToken(payload.access_token || '');
    this.state.profile = payload.user || null;
    await bindPendingInviteCode();
    return payload;
  },
  logout() {
    this.setAccessToken('');
    this.state.profile = null;
    this.setCurrentPatientId('');
  },
};

module.exports = sessionStore;
