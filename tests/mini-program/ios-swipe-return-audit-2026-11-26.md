# 小程序返回手势与左上角返回检查

检查日期：2026-11-26。状态：验证受阻（保留风险待验证）。

## 范围和方法

静态检查重写版 app.json 的 61 个注册页面、每个页面的导航栏声明、公共导航组件、应用跳转和分享及订阅消息目标。没有操作业务数据或修改业务代码。iOS 真机和微信模拟器手势未执行；无法将静态风险记为真机已复现。

## 发现

1. 54 个普通非 Tab 页面在有上一级时，公共导航栏调用 navigateBack；在单页栈时，左上角返回失败后切换首页。iOS 侧滑在单页栈的实际表现需真机确认，存在与回首页不同的风险。列表中 5 个使用 show-back 简写，组件绑定实际表现亦需真机确认。
2. 登录页使用自定义返回：有栈调用 navigateBack；单页栈时根据 back、上一记录或首页决定目标。单页栈的系统侧滑无法依据静态检查确认相同。
3. 已知外部入口：社区帖子详情由帖子分享进入；预约详情、订单详情、提现记录、分销中心被用作微信订阅通知页面。是否由具体微信入口创建单页栈取决于微信运行环境，需测试。
4. 预约成功、预约记录及登录后非 Tab 页面当前本地代码的应用内跳转使用 openFromHome 建立首页及目标两层栈；侧滑真机仍未验证，部署版本未核实。
5. 5 个 Tab 首页和睡眠评估页无固定左上角返回；不作为有返回按钮的逐页比较对象。其他页面的明确导航按钮在正常多页栈下共用相同 navigateBack 行为。

## 单页栈条件下的风险页面

下列不是已逐页复现缺陷；左上角返回在单页栈时目标与系统侧滑可能不同。

| 页面 | 路径 |
| --- | --- |
| 预约记录 | `pages/appointment/booking/index` |
| 手机号快捷登录 | `pages/auth/login` |
| 用户协议 | `pages/auth/agreement/index` |
| 隐私政策 | `pages/auth/privacy/index` |
| 选择门店 | `pages/appointment/store-select` |
| 医生详情 | `pages/appointment/doctor-detail` |
| 选择医生 | `pages/appointment/doctor-list` |
| 选择时段 | `pages/appointment/time-select` |
| 预约确认 | `pages/appointment/confirm` |
| 预约成功 | `pages/appointment/success` |
| 预约详情 | `pages/appointment/detail` |
| 门店地图 | `pages/appointment/map` |
| 改约 | `pages/appointment/reschedule` |
| ESS嗜睡量表 | `pages/assessment/questionnaire/index` |
| 评估结果 | `pages/assessment/result/index` |
| AI鼾声分析 | `pages/assessment/recording/index` |
| 鼾声分析报告 | `pages/assessment/snore-result/index` |
| 打卡日历 | `pages/treatment/calendar/index` |
| 睡眠趋势 | `pages/treatment/sleep-trend/index` |
| 治疗时间线 | `pages/treatment/timeline/index` |
| 医嘱建议 | `pages/treatment/doctor-advice/index` |
| 设备调整 | `pages/treatment/adjust-detail/index` |
| 睡眠报告 | `pages/treatment/sleep-report/index` |
| 商品详情 | `pages/product/detail` |
| 病历档案 | `pages/profile/medical-records/index` |
| 阻鼾器管理 | `pages/profile/device-manage/index` |
| 佩戴数据 | `pages/profile/device-manage/wearing-data/index` |
| 维护记录 | `pages/profile/device-manage/maintenance/index` |
| 使用反馈 | `pages/profile/device-manage/feedback/index` |
| 家庭成员 | `pages/profile/family-members/index` |
| 添加成员 | `pages/profile/family-members/add-member/index` |
| 会员权益 | `pages/profile/member-benefits/index` |
| 设置 | `pages/profile/settings/index` |
| 个人信息 | `pages/profile/settings/personal-info/index` |
| 账号安全 | `pages/profile/settings/account-security/index` |
| 消息通知 | `pages/profile/notifications/index` |
| 在线客服 | `pages/profile/online-service/index` |
| 通知详情 | `pages/profile/notifications/detail` |
| 我的订单 | `pages/order/index` |
| 订单详情 | `pages/order/detail` |
| 分销中心 | `pages/distribution/center/index` |
| 佣金明细 | `pages/distribution/commission/index` |
| 推广订单 | `pages/distribution/orders/index` |
| 提现申请 | `pages/distribution/withdraw/index` |
| 提现记录 | `pages/distribution/withdraw-records/index` |
| 团队成员 | `pages/distribution/team/index` |
| 邀请好友 | `pages/distribution/invite/index` |
| 推广商品 | `pages/distribution/products/index` |
| 分销规则 | `pages/distribution/rules/index` |
| 直播中心 | `pages/live/list/index` |
| 直播详情 | `pages/live/playback/index` |
| 医患社区 | `pages/community/index` |
| 帖子详情 | `pages/community/detail/index` |
| 发帖 | `pages/community/publish/index` |
| 我的社区 | `pages/community/my-activity/index` |

## 验证历史

- 2026-11-26：静态盘点 61 个页面、55 个声明返回按钮的非 Tab 页面；真机未验证。
