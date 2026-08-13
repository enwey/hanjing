const sessionStore = require('../../stores/session-store');

const PUBLIC_PAGES = [
  '/pages/index/index',
  '/pages/appointment/index',
  '/pages/assessment/index',
  '/pages/treatment/index',
  '/pages/product/index',
  '/pages/profile/index',
  '/pages/auth/login',
  '/pages/auth/agreement/index',
  '/pages/auth/privacy/index',
  '/pages/appointment/doctor-list',
  '/pages/appointment/doctor-detail',
  '/pages/appointment/map',
  '/pages/product/detail',
  '/pages/community/index',
  '/pages/community/detail/index',
  '/pages/live/list/index',
  '/pages/live/playback/index',
];

function normalizeUrl(url) {
  return String(url || '').split('?')[0];
}

function buildLoginUrl(targetUrl) {
  const encoded = encodeURIComponent(String(targetUrl || ''));
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const currentRoute = currentPage && currentPage.route ? `/${currentPage.route}` : '';
  const back = currentRoute && !canVisitWithoutLogin(currentRoute)
    ? '&back=' + encodeURIComponent(currentRoute)
    : '';
  return '/pages/auth/login?redirect=' + encoded + back;
}

function canVisitWithoutLogin(url) {
  const pagePath = normalizeUrl(url);
  return PUBLIC_PAGES.includes(pagePath);
}

function openPage(url) {
  if (!canVisitWithoutLogin(url) && !sessionStore.isLoggedIn()) {
    wx.navigateTo({ url: buildLoginUrl(url) });
    return;
  }
  wx.navigateTo({ url });
}

function switchTab(url) {
  wx.switchTab({ url });
}

function goBackOrHome(fallbackUrl) {
  const pages = getCurrentPages();
  if (pages.length > 1) { wx.navigateBack(); return; }
  if (fallbackUrl) { wx.reLaunch({ url: fallbackUrl }); }
}

module.exports = { openPage, switchTab, goBackOrHome };
