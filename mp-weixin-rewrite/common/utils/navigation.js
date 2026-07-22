function openPage(url) { wx.navigateTo({ url }); }
function switchTab(url) { wx.switchTab({ url }); }
function goBackOrHome(fallbackUrl) {
  const pages = getCurrentPages();
  if (pages.length > 1) { wx.navigateBack(); return; }
  if (fallbackUrl) { wx.reLaunch({ url: fallbackUrl }); }
}
module.exports = { openPage, switchTab, goBackOrHome };
