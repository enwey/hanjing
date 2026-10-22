# 全部已登记缺陷：第 2 轮独立回归

- 日期：2026-10-22；针对当前工作区（含未提交修复），非开发自测结果复用。
- 范围：登录 14 项（BUG-01～13、BUG-02-A）、绑定 BIND-01～07、预约 APT-01～07、推广下单分佣 POC-01～03、商城订单 MALL-01～05，共 36 项确认缺陷；另复查登录 RISK-01/02 及 BIND-RISK-01。
- 结论：36 项已确认缺陷的已复现模块路径回归通过。318 项隔离检查中 317 通过、1 项业务规则探测未通过；不能认定所有检查通过。18 项本地 HTTP 验证受阻。
- 未修改业务代码，不操作开发者工具，不进行真实订单、支付、退款、提现、短信或数据库写入。

## 执行证据

| 脚本（tests/ 下） | 数量 | 通过 | 未通过 |
|---|---:|---:|---:|
| mini-program/login-comprehensive.cjs | 119 | 119 | 0 |
| mini-program/promoter-binding.cjs | 28 | 27 | 1 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 | 0 |
| mini-program/promoter-binding-additional.cjs | 19 | 19 | 0 |
| mini-program/appointment.cjs | 18 | 18 | 0 |
| mini-program/appointment-regression.cjs | 11 | 11 | 0 |
| backend-api/promotion-order-commission.cjs | 22 | 22 | 0 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 | 0 |
| mini-program/mall-order.cjs | 25 | 25 | 0 |
| mini-program/mall-order-regression.cjs（本轮新增） | 21 | 21 | 0 |
| 合计 | 318 | 317 | 1 |

均使用 `node tests/<脚本路径>`，登录执行前清空 LOGIN_TEST_FILTER。基础绑定脚本退出 1，其余退出 0，均取得完整结果输出。[原始输出及退出码](2026-10-22-regression-02-results.json)。未修改原测试断言以消除失败。

## 状态与本轮重点

| 范围 | 本轮结果 | 状态 |
|---|---|---|
| BUG-01～13、BUG-02-A，登录 RISK-01/02 | 原 119 项登录、会话刷新、生命周期与缓存故障场景通过 | 保持回归通过（隔离模块） |
| BIND-01～07 | 解析、补绑去重、身份限制、循环、改绑和模拟回滚检查通过 | 保持回归通过（隔离模块） |
| APT-01～07 | 预约接口调用、选择与时序、重复创建等 29 项检查通过 | 保持回归通过（隔离模块） |
| POC-01～03 | 开关、取消支付复用、订单状态及请求乱序等 28 项检查通过 | 保持回归通过（隔离模块） |
| MALL-01 | 两行数量 3、2 汇总为 5 件 | 待回归 → 回归通过（隔离模块） |
| MALL-02 | paid/processing/shipping/shipped 允许退款；pending/completed/refunding/refunded 不允许 | 待回归 → 回归通过（逻辑层，视觉未验证） |
| MALL-03 | 三页旧成功/错误响应不覆盖新结果；卸载后不更新；详情旧物流不带回旧订单 | 待回归 → 回归通过（隔离模块） |
| MALL-04 | 401/403 清空缓存订单；500 保留现有列表 | 待回归 → 回归通过（隔离模块） |
| MALL-05 | 99 不再递增；0、负数、小数、100 提交前阻止且不调用创建 API | 待回归 → 回归通过（隔离模块） |

### 仍保留 BIND-RISK-01

- 风险：中；状态：待验证。
- 复现：先 B 绑定 A，再 A 绑定 C，检查 B 的二级关系。
- 实际：C→A、A→B 一级链存在，缺少 C→B 二级关系。
- 预期未定：动态关系应补齐，首次绑定快照可能不补齐；业务口径尚未确认。探测断言仍失败，不作为新增确认缺陷，也不改为通过。

## HTTP：验证受阻

目标 `http://127.0.0.1:5005/api/v1`，18 项均 ECONNREFUSED，无 HTTP 响应：

- GET products、products/0、orders、orders/0。
- POST orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt。
- POST distribution/bind、distribution/withdraw。
- GET distribution/orders、distribution/commissions、distribution/commission-stats。
- POST appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

请求不携带有效凭证，POST 空对象。未启动环境；不能标记接口鉴权或真实业务通过。登录及管理端真实 HTTP 本轮未执行。

## 限制及历史

- 模拟 wx/API/SQL 执行实际源码，不等于真机或真实数据库集成。真实支付/退款/提现、有效账号权限、库存并发、事务约束与生产运行版本仍未验收。
- 新退款入口与确认收货按钮并排后的视觉、布局、点击体验未核验；MALL-02 的“回归通过”仅指逻辑入口，不代表视觉验收。
- 管理端仅执行既有绑定路由隔离场景，推广员门户及未登记模块未全面测试。
- 本轮未发现新增已确认缺陷，不代表穷尽业务问题。
- 2026-10-22：MALL-01～05 从待回归更新为模块范围回归通过，其余确认缺陷保持；BIND-RISK-01 待验证；18 项 HTTP 受阻。首轮失败与开发记录全部保留。
