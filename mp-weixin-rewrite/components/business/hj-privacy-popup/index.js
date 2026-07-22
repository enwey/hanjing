Component({
  data: {
    showPrivacy: false,
  },

  pageLifetimes: {
    show() {
      this.checkPrivacy();
    },
  },

  methods: {
    checkPrivacy() {
      if (!wx.getPrivacySetting) {
        return;
      }
      wx.getPrivacySetting({
        success: (result) => {
          this.setData({
            showPrivacy: Boolean(result.needAuthorization),
          });
        },
      });
    },

    handleAgree() {
      this.setData({ showPrivacy: false });
      this.triggerEvent('agree');
      if (wx.globalPrivacyResolve) {
        wx.globalPrivacyResolve({ event: 'agree', buttonId: 'agree-btn' });
        wx.globalPrivacyResolve = null;
      }
    },

    handleDisagree() {
      this.setData({ showPrivacy: false });
      this.triggerEvent('disagree');
      if (wx.globalPrivacyResolve) {
        wx.globalPrivacyResolve({ event: 'disagree' });
        wx.globalPrivacyResolve = null;
      }
      wx.showToast({
        title: '不同意隐私协议将无法正常使用部分功能',
        icon: 'none',
        duration: 2000,
      });
    },

    openPrivacyContract() {
      if (!wx.openPrivacyContract) {
        wx.showToast({ title: '当前环境暂不支持查看隐私指引', icon: 'none' });
        return;
      }
      wx.openPrivacyContract({
        fail: () => {
          wx.showToast({
            title: '打开隐私协议失败，请稍后重试',
            icon: 'none',
          });
        },
      });
    },
  },
});
