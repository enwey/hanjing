Component({
  data: {
    showPrivacy: false
  },
  pageLifetimes: {
    show() {
      this.checkPrivacy();
    }
  },
  methods: {
    checkPrivacy() {
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: (res) => {
            console.log("[PrivacyPopup] getPrivacySetting success:", res);
            if (res.needAuthorization) {
              this.setData({
                showPrivacy: true
              });
            } else {
              this.setData({
                showPrivacy: false
              });
            }
          },
          fail: (err) => {
            console.error("[PrivacyPopup] getPrivacySetting fail:", err);
          }
        });
      }
    },
    handleAgree(e) {
      console.log("[PrivacyPopup] User agreed privacy.");
      this.setData({
        showPrivacy: false
      });
      this.triggerEvent("agree");
      
      if (wx.globalPrivacyResolve) {
        wx.globalPrivacyResolve({ event: "agree", buttonId: "agree-btn" });
        wx.globalPrivacyResolve = null;
      }
    },
    handleDisagree() {
      console.log("[PrivacyPopup] User disagreed privacy.");
      this.setData({
        showPrivacy: false
      });
      this.triggerEvent("disagree");
      
      if (wx.globalPrivacyResolve) {
        wx.globalPrivacyResolve({ event: "disagree" });
        wx.globalPrivacyResolve = null;
      }
      
      wx.showToast({
        title: "不同意隐私协议将无法正常使用部分功能",
        icon: "none",
        duration: 2000
      });
    },
    openPrivacyContract() {
      wx.openPrivacyContract({
        fail: (err) => {
          wx.showToast({
            title: "打开隐私协议失败，请稍后重试",
            icon: "none"
          });
        }
      });
    }
  }
});
