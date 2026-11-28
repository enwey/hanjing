module.exports = function confirmSensitiveData(title, content) {
  return new Promise(resolve => wx.showModal({
    title,
    content,
    confirmText: '同意',
    success: result => resolve(result.confirm),
    fail: () => resolve(false),
  }));
};
