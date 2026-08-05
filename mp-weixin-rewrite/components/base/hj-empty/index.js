Component({
  properties: {
    title: { type: String, value: '暂无数据' },
    description: { type: String, value: '' },
    text: { type: String, value: '' },
    icon: { type: String, value: '' },
  },
  data: {
    displayText: '暂无数据',
    displayIcon: '📭',
    isImageIcon: false,
  },
  observers: {
    'title, text, icon': function syncDisplay(title, text, icon) {
      const displayIcon = icon || '📭';
      this.setData({
        displayText: text || title || '暂无数据',
        displayIcon,
        isImageIcon: /^\/.*\.(svg|png|jpg|jpeg|webp)$/i.test(displayIcon),
      });
    },
  },
});
