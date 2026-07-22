Component({
  properties: {
    text: { type: String, value: '' },
    type: { type: String, value: 'default' },
    size: { type: String, value: 'sm' },
  },
  data: {
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
  },
  observers: {
    'type': function updateType(type) {
      const typeStyles = {
        primary: { color: '#3B6BF5', backgroundColor: '#EEF4FF' },
        success: { color: '#16A34A', backgroundColor: '#D3F5E3' },
        warning: { color: '#D97706', backgroundColor: '#FFFBEB' },
        danger: { color: '#DC2626', backgroundColor: '#FEF2F2' },
        default: { color: '#6B7280', backgroundColor: '#F3F4F6' },
        gold: { color: '#E8960A', backgroundColor: '#FFF9E6' },
      };
      const nextStyle = typeStyles[type] || typeStyles.default;
      this.setData(nextStyle);
    },
  },
});
