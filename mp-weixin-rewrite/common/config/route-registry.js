const routeRegistry = [
  {
    "path": "pages/index/index",
    "title": "鼾静健康"
  },
  {
    "path": "pages/assessment/index",
    "title": "睡眠评估"
  },
  {
    "path": "pages/treatment/index",
    "title": "打卡"
  },
  {
    "path": "pages/profile/index",
    "title": "我的"
  },
  {
    "path": "pages/auth/login",
    "title": "登录"
  },
  {
    "path": "pages/auth/agreement/index",
    "title": "用户协议"
  },
  {
    "path": "pages/auth/privacy/index",
    "title": "隐私政策"
  },
  {
    "path": "pages/assessment/questionnaire/index",
    "title": "ESS嗜睡量表"
  },
  {
    "path": "pages/assessment/result/index",
    "title": "评估结果"
  },
  {
    "path": "pages/assessment/recording/index",
    "title": "AI鼾声分析"
  },
  {
    "path": "pages/assessment/snore-result/index",
    "title": "鼾声分析报告"
  },
  {
    "path": "pages/treatment/calendar/index",
    "title": "打卡日历"
  },
  {
    "path": "pages/treatment/sleep-trend/index",
    "title": "睡眠趋势"
  },
  {
    "path": "pages/treatment/sleep-report/index",
    "title": "睡眠报告"
  },
  {
    "path": "pages/profile/family-members/index",
    "title": "家庭成员"
  },
  {
    "path": "pages/profile/family-members/add-member/index",
    "title": "添加成员"
  },
  {
    "path": "pages/profile/settings/index",
    "title": "设置"
  },
  {
    "path": "pages/profile/settings/personal-info/index",
    "title": "个人信息"
  },
  {
    "path": "pages/profile/settings/account-security/index",
    "title": "账号安全"
  },
  {
    "path": "pages/profile/notifications/index",
    "title": "消息通知"
  },
  {
    "path": "pages/community/index",
    "title": "睡眠社区"
  },
  {
    "path": "pages/community/detail/index",
    "title": "帖子详情"
  },
  {
    "path": "pages/community/publish/index",
    "title": "发帖"
  }
];

function getRouteTitle(routePath) {
  const route = routeRegistry.find((item) => item.path === routePath);
  return route ? route.title : '';
}

module.exports = {
  routeRegistry,
  getRouteTitle,
};
