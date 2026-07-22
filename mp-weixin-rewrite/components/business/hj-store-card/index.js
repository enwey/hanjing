Component({
  properties: {
    store: { type: Object, value: {} },
    distance: { type: String, value: '' },
  },
  methods: {
    handleTap() {
      this.triggerEvent('click', this.data.store);
    },
  },
});
