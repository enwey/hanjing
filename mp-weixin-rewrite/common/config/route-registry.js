const routeRegistry = [
  {
    "path": "pages/index/index",
    "title": "鼾静健康诊所"
  },
  {
    "path": "pages/appointment/index",
    "title": "预约挂号"
  },
  {
    "path": "pages/assessment/index",
    "title": "睡眠评估"
  },
  {
    "path": "pages/treatment/index",
    "title": "治疗追踪"
  },
  {
    "path": "pages/product/index",
    "title": "健康商城"
  },
  {
    "path": "pages/profile/index",
    "title": "我的"
  },
  {
    "path": "pages/auth/login",
    "title": "微信授权登录"
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
    "path": "pages/appointment/store-select",
    "title": "选择门店"
  },
  {
    "path": "pages/appointment/doctor-detail",
    "title": "医生详情"
  },
  {
    "path": "pages/appointment/doctor-list",
    "title": "选择医生"
  },
  {
    "path": "pages/appointment/time-select",
    "title": "选择时段"
  },
  {
    "path": "pages/appointment/confirm",
    "title": "预约确认"
  },
  {
    "path": "pages/appointment/success",
    "title": "预约成功"
  },
  {
    "path": "pages/appointment/detail",
    "title": "预约详情"
  },
  {
    "path": "pages/appointment/map",
    "title": "门店地图"
  },
  {
    "path": "pages/appointment/reschedule",
    "title": "改约"
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
    "path": "pages/treatment/timeline/index",
    "title": "治疗时间线"
  },
  {
    "path": "pages/treatment/doctor-advice/index",
    "title": "医嘱建议"
  },
  {
    "path": "pages/treatment/adjust-detail/index",
    "title": "设备调整"
  },
  {
    "path": "pages/treatment/sleep-report/index",
    "title": "睡眠报告"
  },
  {
    "path": "pages/product/detail",
    "title": "商品详情"
  },
  {
    "path": "pages/profile/medical-records/index",
    "title": "病历档案"
  },
  {
    "path": "pages/profile/device-manage/index",
    "title": "阻鼾器管理"
  },
  {
    "path": "pages/profile/device-manage/wearing-data/index",
    "title": "佩戴数据"
  },
  {
    "path": "pages/profile/device-manage/maintenance/index",
    "title": "维护记录"
  },
  {
    "path": "pages/profile/device-manage/feedback/index",
    "title": "使用反馈"
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
    "path": "pages/profile/member-benefits/index",
    "title": "会员权益"
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
    "path": "pages/profile/online-service/index",
    "title": "在线客服"
  },
  {
    "path": "pages/order/index",
    "title": "我的订单"
  },
  {
    "path": "pages/order/detail",
    "title": "订单详情"
  },
  {
    "path": "pages/distribution/center/index",
    "title": "分销中心"
  },
  {
    "path": "pages/distribution/commission/index",
    "title": "佣金明细"
  },
  {
    "path": "pages/distribution/orders/index",
    "title": "推广订单"
  },
  {
    "path": "pages/distribution/withdraw/index",
    "title": "提现申请"
  },
  {
    "path": "pages/distribution/withdraw-records/index",
    "title": "提现记录"
  },
  {
    "path": "pages/distribution/team/index",
    "title": "团队成员"
  },
  {
    "path": "pages/distribution/invite/index",
    "title": "邀请好友"
  },
  {
    "path": "pages/distribution/products/index",
    "title": "推广商品"
  },
  {
    "path": "pages/distribution/rules/index",
    "title": "分销规则"
  },
  {
    "path": "pages/live/list/index",
    "title": "直播中心"
  },
  {
    "path": "pages/live/playback/index",
    "title": "直播详情"
  },
  {
    "path": "pages/community/index",
    "title": "医患社区"
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
