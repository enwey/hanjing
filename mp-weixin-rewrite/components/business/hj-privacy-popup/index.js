Component({
  data: {
    showPrivacy: false,
  },

  lifetimes: {
    detached() {
      this.finishAuthorization({ event: 'disagree' });
    },
  },

  methods: {
    requestAuthorization(resolve) {
      this._pendingPrivacy = (this._pendingPrivacy || []).concat(resolve);
      this.setData({ showPrivacy: true });
    },

    finishAuthorization(result) {
      const pending = this._pendingPrivacy || [];
      this._pendingPrivacy = [];
      pending.forEach(resolve => resolve(result));
    },

    handleAgree() {
      this.setData({ showPrivacy: false });
      this.triggerEvent('agree');
      this.finishAuthorization({ event: 'agree', buttonId: 'agree-btn' });
    },

    handleDisagree() {
      this.setData({ showPrivacy: false });
      this.triggerEvent('disagree');
      this.finishAuthorization({ event: 'disagree' });
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
