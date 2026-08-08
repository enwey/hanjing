const { getStoreCoverUrl } = require('../../../common/utils/image-url');

Component({
  properties: {
    store: { type: Object, value: {} },
    distance: { type: String, value: '' },
  },
  data: {
    imageUrl: '',
    imageLoaded: false,
  },
  observers: {
    store(store) {
      const imageUrl = getStoreCoverUrl(store);
      const shouldKeepLoaded = imageUrl && imageUrl === this.data.imageUrl && this.data.imageLoaded;
      this.setData({
        imageUrl,
        imageLoaded: shouldKeepLoaded,
      });
    },
  },
  methods: {
    handleImageLoad() {
      if (this.data.imageUrl) {
        this.setData({ imageLoaded: true });
      }
    },
    handleImageError() {
      this.setData({ imageLoaded: false });
    },
    handleTap() {
      this.triggerEvent('click', this.data.store);
    },
  },
});
