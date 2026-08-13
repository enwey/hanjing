Page({
  data: {
    sections: [
      {
        key: 'account',
        title: '账号与资料',
        items: [
          {
            key: 'personal',
            icon: '/static/icons/profile-settings.svg',
            label: '个人信息',
            desc: '查看并修改头像、昵称、身份证号等资料',
            url: '/pages/profile/settings/personal-info/index',
          },
          {
            key: 'security',
            icon: '/static/icons/lock-settings.svg',
            label: '账号安全',
            desc: '修改手机号、密码与登录安全信息',
            url: '/pages/profile/settings/account-security/index',
          },
        ],
      },
    ],
  },

  goItem(event) {
    const { url } = event.currentTarget.dataset;
    if (!url) return;
    wx.navigateTo({ url });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('selected_treatment_patient_id');
        wx.removeStorageSync('selected_medical_record_patient_id');
        wx.showToast({ title: '已退出登录', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/profile/index' });
        }, 300);
      },
    });
  },
});
