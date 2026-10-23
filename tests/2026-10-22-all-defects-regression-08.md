# 现有已登记缺陷：第 8 轮独立回归

- 日期：2026-10-22；分支：20260930；对象：当前工作区及当前运行的本地 API。
- 范围：此前 43 项确认缺陷（BUG-01～13、BUG-02-A，BIND-01～07、BIND-RISK-01，APT-01～07，POC-01～03，MALL-01～11），新增 HOME-01～04，共 47 项；另复核 ENV-01 本地服务及登录 RISK-01/02。
- 结论：47 项在注明的模块或本地资源范围回归通过；445 项隔离检查、27 项真实 HTTP 检查全部符合预期。ENV-01 本地接口连接范围回归通过，真机端到端未验收。
- 只新增相关回归脚本、更新报告；未修改业务代码或原断言，未重启服务、操作开发者工具或发起真实交易。

## 执行清单

| 脚本（tests/ 下） | 数量 | 通过 |
|---|---:|---:|
| mini-program/login-comprehensive.cjs | 119 | 119 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 |
| mini-program/promoter-binding.cjs | 28 | 28 |
| mini-program/promoter-binding-additional.cjs | 21 | 21 |
| mini-program/appointment.cjs | 18 | 18 |
| mini-program/appointment-regression.cjs | 11 | 11 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 |
| backend-api/promotion-order-commission.cjs | 22 | 22 |
| mini-program/mall-order-regression.cjs | 21 | 21 |
| mini-program/mall-order.cjs | 25 | 25 |
| backend-api/two-level-commission.cjs | 24 | 24 |
| backend-api/two-level-commission-regression.cjs | 25 | 25 |
| mini-program/mall-order-round-02.cjs | 13 | 13 |
| mini-program/mall-order-round-03.cjs | 7 | 7 |
| mini-program/mall-order-regression-03.cjs | 14 | 14 |
| mini-program/mall-order-regression-04.cjs | 4 | 4 |
| mini-program/home.cjs | 32 | 32 |
| mini-program/home-regression.cjs | 6 | 6 |
| 合计 | 445 | 445 |

逐一重新执行 node tests/对应路径；登录前清空 LOGIN_TEST_FILTER；18 组均退出 0。新增 home-regression.cjs 检查 6 个首页修复边界。[完整输出及退出码](2026-10-22-regression-08-results.json)。没有把开发自测结果当成本轮回归。

## 缺陷状态

| 范围 | 本轮结论 |
|---|---|
| 此前 43 项 BUG/BIND/APT/POC/MALL 缺陷 | 保持回归通过（已登记隔离模块范围） |
| HOME-01 | 待回归 → 回归通过（隔离模块）：旧成功/失败不覆盖新结果，卸载后响应不更新 |
| HOME-02 | 待回归 → 回归通过（隔离模块）：部分失败有提示，后续成功清除提示 |
| HOME-03 | 待回归 → 回归通过（调用层）：重复点击仅一次导航；失败/同步异常可重试；返回 onShow 解锁；跳转期间其他普通入口受锁保护 |
| HOME-04 | 待回归 → 回归通过（本地资源）：四张演示头像均 HTTP 200 且 JPEG 文件头正确 |
| ENV-01（另计环境问题） | 待回归 → 回归通过（本地 HTTP 连接）：健康及首页/医生/门店/商品接口正常；小程序实际运行环境与真机未验收 |

登录 RISK-01/02 原隔离路径通过。首页游客档案登录入口保持原行为，不将普通业务导航去重结论扩展到所有页面所有入口。

## 真实 HTTP：27 项符合预期

- 5 项 HTTP 200：health/ready、api/v1/home/stats、doctors、stores、products。
- 1 项预期 HTTP 404：api/v1/products/0。
- 5 项未登录 GET 返回 401：orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats。
- 11 项未登录 POST 返回 401：orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。
- 4 项头像 GET 返回 200，JPEG 文件头正确：static/demo/doctor-1.jpg～doctor-4.jpg。
- 1 项限制检查：static/demo/server.js 返回预期 404。

全部目标为 127.0.0.1:5005，无凭据，POST 空对象；401/404 是负向用例通过，不是业务成功。未保存业务个人详情。本轮没有此前的连接拒绝现象。

## 边界

- 隔离用例使用实际源码和模拟 wx/API/SQL/存储，不证明真实数据库事务锁与并发、有效账号越权、微信原生交互和实际资金到账。
- HOME-04 使用项目已有演示素材，不证明是真实医生照片；未验收真机显示。
- HOME-02 文案逻辑通过，不等于视觉无遮挡；HOME-03 调用层通过，不等于实际微信页面栈验收。
- MALL-10 不覆盖清除本地存储/跨设备，不确定结果仍无自动过期解锁。
- 管理端仅覆盖已登记绑定路由；推广端及未登记模块未全面测试。实际登录、预约提交、支付、退款、提现未执行。
- 结论不等于整系统上线验收通过；此前失败及环境受阻记录保留为历史。

## 历史

| 日期 | 操作 | 结果 |
|---|---|---|
| 2026-10-22 | 第 8 轮独立回归 | HOME-01～04 限定范围通过；ENV-01 本地 HTTP 通过；其余 43 项保持模块通过；445 项隔离、27 项 HTTP 通过 |
