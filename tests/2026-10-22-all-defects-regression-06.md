# 现有已登记缺陷：第 6 轮独立回归

- 日期：2026-10-22；分支：20260930；对象：当前工作区，包含未提交修改。
- 范围：BUG-01～13、BUG-02-A 共 14 项；BIND-01～07、BIND-RISK-01；APT-01～07；POC-01～03；MALL-01～11，共 43 项确认缺陷，另复跑登录 RISK-01/02。
- 结论：42 项保持隔离模块回归通过；MALL-10 待回归 → 回归不通过（异步结果恢复遗漏）。共 407 项隔离检查，405 通过、2 失败；另 18 项 HTTP 验证受阻。
- 仅新增测试与更新报告，未修改业务代码或既有断言，未操作开发者工具、未发起真实交易、未写业务数据库。

## 执行结果

| 脚本（tests/ 下） | 数量 | 通过 | 失败 |
|---|---:|---:|---:|
| mini-program/promoter-binding.cjs | 28 | 28 | 0 |
| mini-program/login-comprehensive.cjs | 119 | 119 | 0 |
| mini-program/appointment.cjs | 18 | 18 | 0 |
| mini-program/appointment-regression.cjs | 11 | 11 | 0 |
| mini-program/promoter-binding-additional.cjs | 21 | 21 | 0 |
| backend-api/promotion-order-commission.cjs | 22 | 22 | 0 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 | 0 |
| mini-program/mall-order.cjs | 25 | 25 | 0 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 | 0 |
| mini-program/mall-order-regression.cjs | 21 | 21 | 0 |
| backend-api/two-level-commission.cjs | 24 | 24 | 0 |
| backend-api/two-level-commission-regression.cjs | 25 | 25 | 0 |
| mini-program/mall-order-round-02.cjs | 13 | 13 | 0 |
| mini-program/mall-order-round-03.cjs | 7 | 7 | 0 |
| mini-program/mall-order-regression-03.cjs | 14 | 14 | 0 |
| mini-program/mall-order-regression-04.cjs | 4 | 2 | 2 |
| 合计 | 407 | 405 | 2 |

全部重新执行 node tests/对应路径；登录执行前清空 LOGIN_TEST_FILTER。15 组已有脚本退出 0；新增 mall-order-regression-04.cjs 退出 1。使用本轮完整输出，不引用开发自测代替回归。[原始输出与退出码](2026-10-22-regression-06-results.json)。

## MALL-10：结果已明确，新页面仍无法恢复（中风险）

- 当前状态：回归不通过。此前页面重建重复创建已通过；本次失败是该修复的异步恢复边界，两项失败断言归于同一缺陷，不重复编号。
- 现象：旧页面创建请求未返回时，用户退出并重新进入商品页提交；新页面读取到不确定记录，之后旧请求虽已成功或明确拒绝，新页面仍固定跳往订单列表并提示结果待确认。
- 预期：已有有效订单编号时可核对并进入原订单；服务端已明确拒绝且持久保护已删除时，可正常重新提交。
- 实际一：旧请求成功返回 ID=9，已验证共享存储记录含 ID=9；新页面再次提交，订单查询次数仍为 0（预期 1），未进入原订单详情。
- 实际二：旧请求返回 HTTP 400，已验证持久保护记录已删除；新页面再次提交，创建次数仍为 1（预期允许第二次请求）。
- 复现步骤：
  1. 实例化商品详情，填写有效商品、数量、地址，延迟创建响应。
  2. 提交后卸载旧页，保留同一模拟设备存储。
  3. 新建相同商品页并提交一次，使其读取不确定记录。
  4. 返回旧请求成功响应或明确 400 拒绝，等待其处理完成。
  5. 在同一个新页面再次提交，观察订单查询/创建次数与导航。
- 证据：mini-program/mall-order-regression-04.cjs 前两个断言；商品详情 submitOrder 首部的 _checkoutUncertain 分支在重新读取持久结果前直接返回。测试运行实际页面与会话源码，使用模拟 API/wx 和共享存储。
- 影响：当前新页面误判已明确的下单结果，阻碍进入原订单或重新下单；不等同真实重复扣款。再次彻底重建页面可能恢复，本轮不宣称应用永久锁死。
- 没有实际服务端写入、微信弹窗或真实资金变化；此处 HTTP 400 是故障注入，不是本地真实接口返回。

## 已通过与状态

| 范围 | 当前状态 | 本轮覆盖 |
|---|---|---|
| BUG-01～13、BUG-02-A、登录 RISK-01/02 | 保持模块回归通过 | 登录、刷新并发、资料错误、缓存隔离和生命周期 |
| BIND-01～07、BIND-RISK-01 | 保持模块回归通过 | 绑定/改绑、去重、模拟回滚、动态两层归属及分佣 |
| APT-01～07 | 保持模块回归通过 | 预约选择、请求顺序、重复提交、支付调用 |
| POC-01～03、MALL-01～09、MALL-11 | 保持模块回归通过 | 分销开关、已知订单重试、计价/数量、退款入口、响应顺序、鉴权、会话变化、卸载 |
| MALL-10 | 回归不通过 | 持久保护通过，但新页面读取过不确定状态后的恢复失败 |

MALL-10 已通过：共享存储的页面重建不重复创建；明确拒绝允许重试；存储失败不发送；账号隔离；旧页先返回成功再重建可恢复原订单；已取消持久订单允许重新创建；已完成订单核对后清除记录，下次新页面允许重新购买。未否定已通过的修复内容。

## HTTP：验证受阻

本轮重新请求 http://127.0.0.1:5005/api/v1，18 项均 ECONNREFUSED，未收到 HTTP 响应：

- GET products、products/0、orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats。
- POST orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

无账号凭据，POST 空对象；未启动环境。HTTP 受阻保留此前模块状态，不记为真实鉴权或业务通过。登录、管理端真实 HTTP 本轮未重新执行。

## 验收边界及历史

- 隔离执行实际源码，模拟 SQL/API/wx/持久存储；不等于微信真实存储、真机视觉、支付与退款到账、数据库事务/锁/并发验收。
- 未完成跨设备或清除本地数据后的重复订单验证；不确定记录永不自动过期的产品限制保留，不能将本轮结果当作全系统上线验收。
- 管理端仅覆盖已有绑定路由模块，推广员门户和未登记模块未全面测试。
- 2026-10-22 第 6 轮：MALL-10 回归不通过（恢复边界），其余 42 项保持模块通过；18 项 HTTP 受阻。此前失败与开发历史保留。
