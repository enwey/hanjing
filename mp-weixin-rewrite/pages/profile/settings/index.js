const userApi = require('../../../api/modules/user-api');
const sessionStore = require('../../../stores/session-store');

const SETTING_SECTIONS = [
  {
    title: '账号与资料',
    items: [
      { key: 'profile', label: '个人信息', description: '查看昵称、身份证号和就诊卡号', icon: '/static/icons/profile-settings.svg', url: '/pages/profile/settings/personal-info/index' },
      { key: 'security', label: '账号安全', description: '修改手机号、实名与账号安全信息', icon: '/static/icons/lock-settings.svg', url: '/pages/profile/settings/account-security/index' },
    ],
  },
  {
    title: '服务与通知',
    items: [
      { key: 'family', label: '家庭成员', description: '管理关联成员与就诊人信息', icon: '/static/icons/tab-profile-active.png', url: '/pages/profile/family-members/index' },
      { key: 'notifications', label: '消息通知', description: '查看预约、订单、社区与系统通知', icon: '/static/icons/bell.svg', url: '/pages/profile/notifications/index' },
      { key: 'service', label: '在线客服', description: '继续与客服沟通并查看会话记录', icon: '/static/icons/chat.svg', url: '/pages/profile/online-service/index' },
      { key: 'benefits', label: '会员权益', description: '查看等级、消费累计与当前权益', icon: '/static/icons/fee.svg', url: '/pages/profile/member-benefits/index' },
    ],
  },
];

Page({
  data: {
    loading: true,
    nickname: '',
    phoneMasked: '',
    sections: SETTING_SECTIONS,
  },

  async onShow() {
    await this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const response = await userApi.getUserProfile();
      const profile = (response && response.data) || response || {};
      const phone = String(profile.phone || profile.mobile || '');
      this.setData({
        loading: false,
        nickname: profile.nickname || profile.name || '',
        phoneMasked: phone ? phone.slice(0, 3) + '****' + phone.slice(-4) : '',
      });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  goItem(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      return;
    }
    wx.navigateTo({ url });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (result) => {
        if (!result.confirm) {
          return;
        }
        sessionStore.logout();
        wx.removeStorageSync('selected_treatment_patient_id');
        wx.removeStorageSync('selected_medical_record_patient_id');
        wx.removeStorageSync('rewrite_current_patient_id');
        wx.showToast({ title: '已退出登录', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/profile/index' });
        }, 300);
      },
    });
  },
});
