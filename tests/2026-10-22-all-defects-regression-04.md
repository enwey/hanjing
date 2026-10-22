# 全部已登记缺陷：第 4 轮独立回归

- 日期：2026-10-22；对象：含未提交修复的当前工作区。
- 范围：登录 BUG-01～13、BUG-02-A（14 项），BIND-01～07，APT-01～07，POC-01～03，MALL-01～09，以及 BIND-RISK-01，共 41 项确认缺陷；另复跑登录 RISK-01/02。
- 结果：41 项确认缺陷在已登记的隔离模块路径回归通过；382 项隔离检查全部通过。18 项 HTTP 验证受阻，不能视为全链路或上线验收通过。
- 本轮只新增记录，未修改业务代码或测试断言；没有操作开发者工具、创建真实订单、支付、退款、提现或数据库业务写入。

## 执行证据

| 脚本（tests/ 下） | 数量 | 通过 |
|---|---:|---:|
| mini-program/login-comprehensive.cjs | 119 | 119 |
| mini-program/promoter-binding.cjs | 28 | 28 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 |
| mini-program/promoter-binding-additional.cjs | 21 | 21 |
| mini-program/appointment.cjs | 18 | 18 |
| mini-program/appointment-regression.cjs | 11 | 11 |
| backend-api/promotion-order-commission.cjs | 22 | 22 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 |
| mini-program/mall-order.cjs | 25 | 25 |
| mini-program/mall-order-regression.cjs | 21 | 21 |
| backend-api/two-level-commission.cjs | 24 | 24 |
| backend-api/two-level-commission-regression.cjs | 25 | 25 |
| mini-program/mall-order-round-02.cjs | 13 | 13 |
| 合计 | 382 | 382 |

均重新执行 `node tests/<路径>`，登录前清空 LOGIN_TEST_FILTER；13 组均退出 0 且取得完整输出。[原始结果及退出码](2026-10-22-regression-04-results.json)。没有以开发自测日志代替本轮执行。

## 状态与重点证据

| 范围 | 本轮结果 | 状态 |
|---|---|---|
| BUG-01～13、BUG-02-A、登录 RISK-01/02 | 登录与刷新并发、资料异常、生命周期、缓存隔离原场景通过 | 保持回归通过（隔离模块） |
| BIND-01～07、BIND-RISK-01 | 绑定限制、去重、改绑、模拟回滚、动态两层归属及绑定顺序原场景通过 | 保持回归通过（隔离模块） |
| APT-01～07 | 预约支付调用、选择、请求顺序和重复创建等检查通过 | 保持回归通过（隔离模块） |
| POC-01～03、MALL-01～05 | 分销开关、支付重试、数量、退款入口、响应顺序及列表鉴权检查通过 | 保持回归通过（隔离模块） |
| MALL-06 | 同账号刷新不阻断创建后的付款或取消后的重试；新登录仍阻断旧结算 | 待回归 → 回归通过（隔离模块） |
| MALL-07 | 两个详情页卸载后，迟到支付参数不再触发 wx.requestPayment | 待回归 → 回归通过（隔离模块） |
| MALL-08 | 商品旧成功/失败响应不覆盖新结果 | 待回归 → 回归通过（隔离模块） |
| MALL-09 | 静默 401/403 清空详情，500 保留缓存；再次 onShow 可重新请求 | 待回归 → 回归通过（隔离模块） |

本轮未发现新的已确认缺陷；结论只覆盖已执行场景，不表示已穷尽所有异步边界或所有业务问题。

## 真实接口：验证受阻

目标 `http://127.0.0.1:5005/api/v1`，18 项均 ECONNREFUSED，未收到 HTTP 响应：

- GET products、products/0、orders、orders/0。
- POST orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt。
- POST distribution/bind、distribution/withdraw。
- GET distribution/orders、distribution/commissions、distribution/commission-stats。
- POST appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

请求无有效凭证，POST 空对象；没有启动环境。不能记录为鉴权通过或真实业务成功。登录和管理端真实 HTTP 本轮未重新请求。

## 验收边界

- 执行实际源码并模拟 SQL/API/wx；不验证 MySQL 真实语法执行、索引、事务锁或并发。绑定排列是顺序测试，不是并发测试。
- MALL-06 使用实际 session-store 的刷新代次逻辑及模拟 API，不是认证服务真实刷新。MALL-07 验证支付调用是否发生，不是微信原生 UI 验证，也不意味着已发出的支付能被撤销。
- 真机视觉、支付弹窗、真实资金到账、有效身份越权、库存/券竞争和渠道回调尚未验收。
- 管理端仅覆盖已有绑定路由隔离场景；推广员门户及未登记模块未全面测试。

## 历史

- 2026-10-22 第 4 轮：MALL-06～09 更新为模块回归通过，其余确认缺陷保持；18 项 HTTP 受阻。原失败和开发记录全部保留。
