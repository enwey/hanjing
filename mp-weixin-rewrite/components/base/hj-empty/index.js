Component({
  properties: {
    title: { type: String, value: '暂无数据' },
    description: { type: String, value: '' },
    text: { type: String, value: '' },
    icon: { type: String, value: '' },
  },
  data: {
    displayTitle: '暂无数据',
    displayDescription: '',
    displayIcon: '',
  },
  observers: {
    'title, description, text, icon': function syncDisplay(title, description, text, icon) {
      this.setData({
        displayTitle: text || title || '暂无数据',
        displayDescription: description || '',
        displayIcon: icon || '',
      });
    },
  },
});
