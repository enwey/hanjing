const sessionStore = require('../../stores/session-store');

const PUBLIC_PAGES = [
  '/pages/auth/login',
  '/pages/auth/agreement/index',
  '/pages/auth/privacy/index',
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
  if (!canVisitWithoutLogin(url) && !sessionStore.isLoggedIn()) {
    wx.reLaunch({ url: buildLoginUrl(url) });
    return;
  }
  wx.switchTab({ url });
}

function goBackOrHome(fallbackUrl) {
  const pages = getCurrentPages();
  if (pages.length > 1) { wx.navigateBack(); return; }
  if (fallbackUrl) { wx.reLaunch({ url: fallbackUrl }); }
}

module.exports = { openPage, switchTab, goBackOrHome };
