const distributionApi = require('./api/index');
const sessionStore = require('./stores/session-store');

const originalPage = Page;
const nativeNavigateTo = wx.navigateTo;
const nativeRedirectTo = wx.redirectTo;
const nativeReLaunch = wx.reLaunch;
const nativeSwitchTab = wx.switchTab;

function stringifyQueryValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function buildQueryString(options) {
  const query = options && typeof options === 'object' ? options : {};
  const keys = Object.keys(query).filter((key) => key && query[key] !== undefined);
  if (!keys.length) {
    return '';
  }
  return keys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(stringifyQueryValue(query[key]))}`)
    .join('&');
}

function joinRouteAndQuery(route, queryString) {
  const pageUrl = buildPageUrl(route);
  return queryString ? `${pageUrl}?${queryString}` : pageUrl;
}

Page = function registerTrackedPage(pageOptions) {
  const config = pageOptions || {};
  const originalOnLoad = config.onLoad;
  const originalOnShow = config.onShow;
  const originalOnHide = config.onHide;
  const originalOnUnload = config.onUnload;

  config.onLoad = function trackedOnLoad(options = {}, ...args) {
    const app = getApp();
    const queryString = buildQueryString(options);
    this.__routeQueryString = queryString;
    if (app && app.globalData) {
      app.globalData.currentRoute = this.route || '';
      app.globalData.currentUrl = joinRouteAndQuery(this.route || '', queryString);
    }
    if (typeof originalOnLoad === 'function') {
      return originalOnLoad.call(this, options, ...args);
    }
    return undefined;
  };

  config.onShow = function trackedOnShow(...args) {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.currentRoute = this.route || '';
      app.globalData.currentUrl = joinRouteAndQuery(this.route || '', this.__routeQueryString || buildQueryString(this.options || {}));
    }
    if (typeof originalOnShow === 'function') {
      return originalOnShow.apply(this, args);
    }
    return undefined;
  };

  config.onHide = function trackedOnHide(...args) {
    const app = getApp();
    if (app && app.globalData && this.route) {
      app.globalData.lastRoute = this.route;
      app.globalData.lastUrl = joinRouteAndQuery(this.route, this.__routeQueryString || buildQueryString(this.options || {}));
    }
    if (typeof originalOnHide === 'function') {
      return originalOnHide.apply(this, args);
    }
    return undefined;
  };

  config.onUnload = function trackedOnUnload(...args) {
    const app = getApp();
    if (app && app.globalData && this.route) {
      app.globalData.lastRoute = this.route;
      app.globalData.lastUrl = joinRouteAndQuery(this.route, this.__routeQueryString || buildQueryString(this.options || {}));
    }
    if (typeof originalOnUnload === 'function') {
      return originalOnUnload.apply(this, args);
    }
    return undefined;
  };

  return originalPage(config);
};

const PUBLIC_ROUTES = [
  'pages/auth/login',
  'pages/auth/agreement/index',
  'pages/auth/privacy/index',
];

const TAB_ROUTES = [
  '/pages/index/index',
  '/pages/appointment/index',
  '/pages/treatment/index',
  '/pages/product/index',
  '/pages/profile/index',
];

function normalizeRoute(route) {
  return String(route || '').replace(/^\//, '').split('?')[0];
}

function isPublicRoute(route) {
  return PUBLIC_ROUTES.includes(normalizeRoute(route));
}

function buildPageUrl(route) {
  const normalized = normalizeRoute(route);
  return normalized ? `/${normalized}` : '/pages/index/index';
}

function getPageUrl(page) {
  if (!page || !page.route) {
    return '/pages/index/index';
  }
  const queryString = buildQueryString(page.options || {});
  return joinRouteAndQuery(page.route, queryString);
}

function buildLoginRedirectUrl(targetUrl) {
  const app = getApp();
  const normalizedTarget = String(targetUrl || '').trim() || '/pages/index/index';
  const backUrl = app && app.globalData ? app.globalData.lastUrl || buildPageUrl(app.globalData.lastRoute) : '';
  const redirect = `redirect=${encodeURIComponent(normalizedTarget)}`;
  const back = backUrl && !isPublicRoute(backUrl)
    ? `&back=${encodeURIComponent(backUrl)}`
    : '';
  return `/pages/auth/login?${redirect}${back}`;
}

function navigateToLogin(loginUrl) {
  nativeReLaunch({
    url: loginUrl,
    complete() {
      setTimeout(() => {
        const app = getApp();
        if (app) {
          app.__redirectingToLogin = false;
        }
      }, 300);
    },
  });
}

function enforceLoginGuard() {
  if (sessionStore.isLoggedIn()) {
    return;
  }
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const currentUrl = getPageUrl(currentPage);
  if (isPublicRoute(currentUrl)) {
    return;
  }
  const app = getApp();
  const loginUrl = buildLoginRedirectUrl(currentUrl);
  if (app.__redirectingToLogin) {
    return;
  }
  app.__redirectingToLogin = true;
  navigateToLogin(loginUrl);
}

function patchNavigationApis() {
  if (wx.__loginGuardPatched) {
    return;
  }

  function guardNavigation(methodName, nativeMethod) {
    wx[methodName] = function wrappedNavigation(options = {}) {
      const request = options || {};
      const url = String(request.url || '').trim();
      if (!url || sessionStore.isLoggedIn() || isPublicRoute(url)) {
        return nativeMethod.call(wx, request);
      }

      const app = getApp();
      if (app && app.__redirectingToLogin) {
        return nativeMethod.call(wx, request);
      }

      if (app) {
        app.__redirectingToLogin = true;
      }

      const loginUrl = buildLoginRedirectUrl(url);
      return navigateToLogin(loginUrl);
    };
  }

  guardNavigation('navigateTo', nativeNavigateTo);
  guardNavigation('redirectTo', nativeRedirectTo);
  guardNavigation('reLaunch', nativeReLaunch);
  guardNavigation('switchTab', nativeSwitchTab);
  wx.__loginGuardPatched = true;
}

function clearLegacyObfuscatedAccessToken() {
  const token = wx.getStorageSync('access_token');
  if (typeof token === 'string' && token.indexOf('obf:') === 0) {
    wx.removeStorageSync('access_token');
  }
}

patchNavigationApis();

function parseInviteCodeFromLaunchOptions(options) {
  if (!options || !options.query) return "";
  const query = options.query;
  let inviteCode = query.inviteCode || query.invite_code || '';
  if (query.scene) {
    const sceneText = decodeURIComponent(query.scene);
    if (sceneText.indexOf("=") > -1) {
      sceneText.split("&").forEach((entry) => {
        const parts = entry.split("=");
        const key = parts[0];
        const value = parts.slice(1).join("=");
        if (key === "inviteCode" || key === "invite_code" || key === "code") inviteCode = value;
      });
    } else { inviteCode = sceneText; }
  }
  return String(inviteCode || "").trim();
}

async function tryBindPendingInvite() {
  const inviteCode = wx.getStorageSync("pending_invite_code");
  const token = wx.getStorageSync("access_token");
  if (!inviteCode || !token) return;
  try {
    const response = await distributionApi.bindDistribution(inviteCode);
    const status = (response && response.data && response.data.status) || response.status || "bound";
    if (status === "bound" || status === "already_bound" || status === "ignored_self") {
      wx.removeStorageSync("pending_invite_code");
    }
  } catch (error) {
    if (error && (error.message === "无效的邀请码" || error.message === "邀请码不能为空")) {
      wx.removeStorageSync("pending_invite_code");
    }
  }
}

App({
  globalData: { appName: "鼾静健康诊所", currentRoute: '', currentUrl: '', lastRoute: '', lastUrl: '' },
  __redirectingToLogin: false,
  onLaunch(options) {
    clearLegacyObfuscatedAccessToken();
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
    if (wx.onError) {
      wx.onError((error) => {
        console.error('[Global Error Catch]', error);
        const realtimeLogManager = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
        if (realtimeLogManager) {
          realtimeLogManager.error('[JS Error]', error);
        }
      });
    }
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        wx.globalPrivacyResolve = resolve;
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        if (currentPage) {
          const popup = currentPage.selectComponent ? currentPage.selectComponent('#privacyPopup') : null;
          if (popup) {
            popup.setData({ showPrivacy: true });
            return;
          }
        }
        wx.showModal({
          title: '隐私保护指引提示',
          content: '为了向您提供就近门店选择、挂号预约，以及睡眠鼾声录制与评估服务，我们需要在必要时申请您的地理位置与麦克风录音权限。请阅读并同意《隐私保护指引》后继续使用。',
          cancelText: '拒绝',
          confirmText: '同意并授权',
          success(result) {
            if (result.confirm) {
              resolve({ event: 'agree', buttonId: 'agree-btn' });
            } else {
              resolve({ event: 'disagree' });
            }
          },
          fail() {
            resolve({ event: 'disagree' });
          },
        });
      });
    }
    setTimeout(() => {
      enforceLoginGuard();
    }, 0);
  },
  onShow(options) {
    clearLegacyObfuscatedAccessToken();
    const inviteCode = parseInviteCodeFromLaunchOptions(options);
    if (inviteCode) wx.setStorageSync("pending_invite_code", inviteCode);
    tryBindPendingInvite();
    setTimeout(() => {
      enforceLoginGuard();
    }, 0);
  },
});
