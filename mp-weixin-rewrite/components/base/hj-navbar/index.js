const TABBAR_PAGES = [
  'pages/index/index',
  'pages/appointment/index',
  'pages/treatment/index',
  'pages/product/index',
  'pages/profile/index',
];

const ROUTE_TITLES = {
  'pages/profile/device-manage/index': '阻鼾器管理',
  'pages/profile/settings/index': '设置',
  'pages/distribution/center/index': '分销中心',
  'pages/distribution/commission/index': '佣金明细',
  'pages/distribution/orders/index': '推广订单',
  'pages/distribution/invite/index': '邀请好友',
  'pages/distribution/products/index': '推广商品',
  'pages/distribution/rules/index': '分销规则',
  'pages/distribution/team/index': '团队成员',
  'pages/distribution/withdraw-records/index': '提现记录',
  'pages/distribution/withdraw/index': '提现申请',
  'pages/live/list/index': '直播中心',
  'pages/live/playback/index': '直播详情',
};

function getStatusBarHeight() {
  try {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return windowInfo.statusBarHeight || 20;
  } catch (error) {
    return 20;
  }
}

function getCapsuleInfo() {
  try {
    return wx.getMenuButtonBoundingClientRect();
  } catch (error) {
    return null;
  }
}

Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    hideBack: { type: Boolean, value: false },
    customBack: { type: Boolean, value: false },
    textColor: { type: String, value: '#1F2937' },
    bgColor: { type: String, value: '' },
    backgroundColor: { type: String, value: '#FFFFFF' },
    fixed: { type: Boolean, value: true },
    transparent: { type: Boolean, value: false },
    sticky: { type: Boolean, value: true },
  },

  data: {
    showNavbar: false,
    statusBarHeight: 20,
    capsuleHeight: 44,
    totalHeight: 64,
    spacerHeight: 64,
    shouldShowBack: false,
    navbarTitle: '',
    navbarBackgroundColor: '#FFFFFF',
    isFixed: true,
  },

  lifetimes: {
    attached() {
      this.syncLayout();
    },
  },

  observers: {
    'title, showBack, hideBack, sticky, fixed, backgroundColor, bgColor, transparent'() {
      this.syncVisualState();
      this.syncRouteMeta(this.data.title, this.data.showBack, this.data.hideBack, this.getStickyValue());
    },
  },

  methods: {
    getStickyValue() {
      return typeof this.data.sticky === 'boolean' ? this.data.sticky : this.data.fixed;
    },

    getBackgroundColorValue() {
      return this.data.bgColor || this.data.backgroundColor || '#FFFFFF';
    },

    syncLayout() {
      const statusBarHeight = getStatusBarHeight();
      const capsule = getCapsuleInfo();
      let capsuleHeight = 44;
      if (capsule && capsule.top && capsule.height) {
        const gap = capsule.top - statusBarHeight;
        capsuleHeight = gap * 2 + capsule.height;
      }
      const totalHeight = statusBarHeight + capsuleHeight;

      this.setData({
        statusBarHeight,
        capsuleHeight,
        totalHeight,
        spacerHeight: this.getStickyValue() ? totalHeight : 0,
        showNavbar: true,
      });

      this.syncVisualState();
      this.syncRouteMeta(this.data.title, this.data.showBack, this.data.hideBack, this.getStickyValue());
    },

    syncVisualState() {
      const isFixed = this.getStickyValue();
      this.setData({
        isFixed,
        navbarBackgroundColor: this.getBackgroundColorValue(),
        spacerHeight: isFixed ? this.data.totalHeight : 0,
      });
    },

    syncRouteMeta(title, showBack, hideBack, sticky) {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1] || null;
      const route = currentPage ? currentPage.route : '';
      const isTabbarPage = TABBAR_PAGES.includes(route);
      const shouldShowBack = hideBack ? false : (showBack || (pages.length > 1 && !isTabbarPage));
      const navbarTitle = title || ROUTE_TITLES[route] || '';

      this.setData({
        shouldShowBack,
        navbarTitle,
        spacerHeight: sticky ? this.data.totalHeight : 0,
      });
    },

    handleBackTap() {
      this.triggerEvent('back');
      if (this.data.customBack) {
        return;
      }
      wx.navigateBack({
        delta: 1,
        fail() {
          wx.switchTab({ url: '/pages/index/index' });
        },
      });
    },
  },
});
