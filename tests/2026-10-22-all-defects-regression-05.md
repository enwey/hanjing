# 全部已登记缺陷：第 5 轮独立回归

- 日期：2026-10-22；分支：20260930；对象：含未提交修改的当前工作区。
- 范围：登录 BUG-01～13、BUG-02-A（14 项），BIND-01～07，APT-01～07，POC-01～03，MALL-01～11，BIND-RISK-01，共 43 项确认缺陷；另复跑登录 RISK-01/02。
- 结论：42 项在注明的隔离模块范围内回归通过，MALL-10 回归不通过。400 项隔离检查中 399 通过、1 失败；18 项 HTTP 验证受阻。
- 本轮只新增测试与记录，未修改业务代码、未调整既有断言；未操作开发者工具、未创建真实交易或写入业务数据库。

## 本轮执行

| 脚本（tests/ 下） | 数量 | 通过 | 失败 |
|---|---:|---:|---:|
| mini-program/appointment.cjs | 18 | 18 | 0 |
| mini-program/appointment-regression.cjs | 11 | 11 | 0 |
| mini-program/login-comprehensive.cjs | 119 | 119 | 0 |
| backend-api/promotion-order-commission.cjs | 22 | 22 | 0 |
| mini-program/promoter-binding-additional.cjs | 21 | 21 | 0 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 | 0 |
| mini-program/mall-order.cjs | 25 | 25 | 0 |
| mini-program/mall-order-regression.cjs | 21 | 21 | 0 |
| mini-program/promoter-binding.cjs | 28 | 28 | 0 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 | 0 |
| backend-api/two-level-commission.cjs | 24 | 24 | 0 |
| backend-api/two-level-commission-regression.cjs | 25 | 25 | 0 |
| mini-program/mall-order-round-02.cjs | 13 | 13 | 0 |
| mini-program/mall-order-round-03.cjs | 7 | 7 | 0 |
| mini-program/mall-order-regression-03.cjs | 11 | 10 | 1 |
| 合计 | 400 | 399 | 1 |

逐一重新执行 node tests/对应脚本，登录脚本执行前清空 LOGIN_TEST_FILTER。14 组已有脚本退出 0；新增 mall-order-regression-03.cjs 退出 1。没有以此前开发自测替代本次执行。[原始输出及退出码](2026-10-22-regression-05-results.json)。

## 缺陷状态

| 缺陷范围 | 当前状态 | 本轮范围 |
|---|---|---|
| BUG-01～13、BUG-02-A | 保持回归通过（隔离模块） | 登录、刷新并发、资料异常、生命周期、缓存隔离 |
| BIND-01～07、BIND-RISK-01 | 保持回归通过（隔离模块） | 绑定限制、改绑、模拟事务回滚、动态两层关系及佣金归属 |
| APT-01～07 | 保持回归通过（隔离模块） | 选择、请求顺序、支付调用、重复提交 |
| POC-01～03 | 保持回归通过（隔离模块） | 分销开关、已知订单重试、推广订单响应顺序 |
| MALL-01～09 | 保持回归通过（隔离模块） | 数量、退款入口、旧响应、鉴权、令牌刷新、页面卸载 |
| MALL-10 | 待回归 → 回归不通过 | 同一页保护通过，页面重建后仍重复创建请求 |
| MALL-11 | 待回归 → 回归通过（隔离模块） | 支付参数等待、原生支付回调等待、状态同步等待期间会话改变；正常流程对照 |

登录 RISK-01/02 原模块用例通过；不表示真机和真实账号集成验收完成。

## 未通过问题：MALL-10（中风险）

- 现象：创建结果不明确后，退出商品详情再进入同一商品，重新提交仍会发送另一笔创建请求。
- 预期：同一购买的前一次创建结果未确认时，不应仅因页面重建而失去重复创建保护。
- 实际：模拟第一次服务端提交后响应丢失；重建页面再提交，创建请求累计 2 次，模拟提交计数 2，预期 1。
- 复现步骤：配置有效商品、数量、地址；createOrder 注入“已提交后丢失响应”；执行 submitOrder；执行 onUnload；重新实例化同一商品页并填入相同购买信息；再次 submitOrder；检查请求次数。
- 证据：mini-program/mall-order-regression-03.cjs 的 reopening same checkout 断言失败；页面状态 _checkoutUncertain 不跨页面实例保留。
- 风险：重复订单及额外库存占用风险。动态证据只证明模拟页面重建后再次调用创建 API；真实数据库重复订单、真实扣款未验证。
- 已通过：原同页面响应丢失、缺 ID 场景不再重复创建；408/500 阻止重试并进入订单列表；400/401/403/404/422 明确拒绝后允许再次提交。
- 开发记录已声明仅保护当前页。本轮将页面重建作为同一缺陷的残留边界记录，不重复新增编号，也不否定同页面已修复事实。

## MALL-11 重点证据

- 等待支付参数时新登录/退出，旧订单不调用 wx.requestPayment。
- 已调用模拟原生支付后切换账号，随后 success 回调不触发订单付款确认。
- 等待付款确认时退出，迟到确认响应不显示成功、不刷新旧订单。
- 同一账号正常支付能完成确认与刷新；同账号令牌刷新、并发付款锁及卸载场景保持通过。
- 测试没有实际唤起微信支付，也不能证明已经发出的真实支付可撤销。

## 真实 HTTP 与验收边界

本轮对 http://127.0.0.1:5005/api/v1 重新请求 18 项，均 ECONNREFUSED，状态为验证受阻。GET：products、products/0、orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats。POST：orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

请求无账号凭据，POST 空对象；未启动环境或发起真实交易。HTTP 受阻不改写此前缺陷模块状态。登录及管理端真实 HTTP 本轮未重新请求。

所有自动化为实际源码搭配模拟 wx/API/SQL，不验证数据库真实语法、锁与并发；未完成真机视觉、真实支付/退款到账、库存/券竞争或有效身份越权验收。管理端仅复跑绑定路由隔离场景，推广员门户及未登记模块未全面测试。不可将 399 项通过等同全系统验收通过。

## 历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 第 5 轮独立回归 | MALL-10 回归不通过；MALL-11 模块回归通过；其余 41 项保持模块回归通过；18 项 HTTP 受阻 |
