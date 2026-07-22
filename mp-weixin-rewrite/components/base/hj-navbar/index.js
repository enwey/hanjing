Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    textColor: { type: String, value: '#1f2937' },
    backgroundColor: { type: String, value: '#ffffff' },
    transparent: { type: Boolean, value: false },
    sticky: { type: Boolean, value: true },
  },
  methods: {
    handleBackTap() {
      this.triggerEvent('back');
      if (getCurrentPages().length > 1) wx.navigateBack();
    },
  },
});
