// Rebuild a safe root before opening a result page, so native swipe-back and
// the navbar both lead to the home tab instead of exposing an empty stack.
function openFromHome(url, fail) {
  let failed = false;
  const onFailure = (error) => {
    if (failed) return;
    failed = true;
    if (typeof fail === 'function') fail(error);
    else wx.showToast({ title: '页面跳转失败，请返回首页重试', icon: 'none' });
  };
  wx.switchTab({
    url: '/pages/index/index',
    success: () => wx.navigateTo({ url, fail: onFailure }),
    fail: onFailure,
  });
}

module.exports = { openFromHome };
