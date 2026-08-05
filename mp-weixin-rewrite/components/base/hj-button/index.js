Component({
  properties: {
    text: { type: String, value: '' },
    type: { type: String, value: 'primary' },
    size: { type: String, value: 'md' },
    block: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    openType: { type: String, value: '' },
  },

  methods: {
    handleTap() {
      if (this.data.disabled || this.data.loading) {
        return;
      }
      this.triggerEvent('tap');
      this.triggerEvent('click');
    },
  },
});
