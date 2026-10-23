# 现有已登记缺陷：第 7 轮独立回归

- 日期：2026-10-22；分支：20260930；对象：含未提交修改的当前工作区。
- 范围：BUG-01～13、BUG-02-A（14 项）；BIND-01～07、BIND-RISK-01；APT-01～07；POC-01～03；MALL-01～11，共 43 项确认缺陷，另复跑登录 RISK-01/02。
- 结果：43 项在已登记隔离模块路径回归通过；407 项隔离检查全部通过。18 项真实 HTTP 验证受阻，真机及真实交易未验收。
- 本轮未修改业务源码或测试断言，只更新报告；未操作开发者工具、未发起真实交易或业务数据库写入。

## 实际执行

| 脚本（tests/ 下） | 数量 | 通过 |
|---|---:|---:|
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
| mini-program/mall-order-round-02.cjs | 13 | 13 |
| backend-api/two-level-commission-regression.cjs | 25 | 25 |
| mini-program/login-comprehensive.cjs | 119 | 119 |
| mini-program/mall-order-round-03.cjs | 7 | 7 |
| mini-program/mall-order-regression-03.cjs | 14 | 14 |
| mini-program/mall-order-regression-04.cjs | 4 | 4 |
| 合计 | 407 | 407 |

重新执行 node tests/对应脚本，登录脚本前清空 LOGIN_TEST_FILTER；16 组均退出 0。没有用开发自测日志替代本轮执行。[完整输出与退出码](2026-10-22-regression-07-results.json)。

## 缺陷状态与验证范围

| 范围 | 当前状态 | 本轮验证范围 |
|---|---|---|
| BUG-01～13、BUG-02-A、登录 RISK-01/02 | 保持模块回归通过 | 登录、刷新并发、资料异常、生命周期、缓存隔离 |
| BIND-01～07、BIND-RISK-01 | 保持模块回归通过 | 绑定/改绑、去重、模拟回滚、动态两层归属及分佣 |
| APT-01～07 | 保持模块回归通过 | 预约选择、响应顺序、重复提交、支付调用 |
| POC-01～03 | 保持模块回归通过 | 分销开关、已知订单重试、推广订单响应顺序 |
| MALL-01～09、MALL-11 | 保持模块回归通过 | 数量/计价、退款入口、旧响应、鉴权、令牌刷新、卸载和会话切换 |
| MALL-10 | 待回归 → 回归通过（隔离模块） | 不确定结果防重、共享存储的页面重建、账号隔离、存储失败、迟到响应恢复 |

## MALL-10 原失败场景复核

1. 旧页创建请求未完成时卸载；新页提交并读到不确定记录；旧响应成功并保存 ID=9；新页再次提交：查询原订单 1 次，进入 ID=9 的详情，创建请求仍仅 1 次。通过。
2. 同样时序，旧请求明确返回模拟 HTTP 400 并删除持久记录；新页再次提交：允许第二次创建请求，不再被旧的不确定标记拦截。通过。
3. 结果仍未知、响应缺 ID、408/500：继续防重复；同页面及共享存储的页面重建保护通过。
4. 存储写入失败不发送创建；不同账号记录隔离；已取消订单可重新创建；已完成订单核对后清理记录、后续页面可再次购买。通过。
5. MALL-11 迟到支付参数、支付回调、确认响应期间会话变化仍受到保护；正常同账号流程对照通过。

本轮没有复现已登记缺陷；不表示已穷尽所有场景。模拟 HTTP 400 是隔离注入，不是本地真实接口成功连接。

## 真实接口：验证受阻

对 http://127.0.0.1:5005/api/v1 重新请求 18 项，均 ECONNREFUSED，没有 HTTP 响应：

- GET products、products/0、orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats。
- POST orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

无账号凭据，POST 空对象，未启动服务。不得记录为真实鉴权或业务通过。登录和管理端真实 HTTP 本轮未重新执行。

## 验收边界

- 实际源码搭配模拟 wx/API/SQL/存储执行；不证明微信真机视觉、真实存储持久性、数据库锁/并发、真实支付退款到账或有效账号越权验证通过。
- MALL-10 结论限于保留本地存储的已测场景，不覆盖跨设备或清除本地数据；未知结果没有自动解锁，未提供实际订单人工核对流程的端到端验收。
- 管理端仅覆盖已有绑定路由模块；推广员门户、未登记模块未全面测试。
- HTTP 受阻保留在本报告，不抵销已执行模块通过，也不能被模块结果替代。

## 状态历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 第 7 轮独立回归 | MALL-10 模块回归通过，其余 42 项保持；407 项通过，18 项 HTTP 受阻 |
