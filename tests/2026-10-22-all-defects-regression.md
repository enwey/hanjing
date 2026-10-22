# 全部已登记缺陷独立回归

- 日期：2026-10-22；对象：当前工作区，包括未提交修复。
- 范围：登录 BUG-01～13 与 BUG-02-A（14 项）、推广绑定 BIND-01～07、预约 APT-01～07、推广下单分佣 POC-01～03，共 31 项确认缺陷；另包含登录两项风险及 BIND-RISK-01。
- 结论：31 项确认缺陷的已复现模块路径回归通过；BIND-RISK-01 保持待验证。不能表述为所有检查通过或全项目上线验收通过。
- 本轮重新执行源码隔离脚本，不引用开发自测作为回归证据；未修改业务代码、未操作开发者工具、未发起真实业务写入。

## 执行记录

| 脚本 | 总数 | 通过 | 未通过 |
|---|---:|---:|---:|
| mini-program/login-comprehensive.cjs（清空 LOGIN_TEST_FILTER） | 119 | 119 | 0 |
| mini-program/promoter-binding.cjs | 28 | 27 | 1 |
| mini-program/promoter-binding-regression.cjs | 49 | 49 | 0 |
| mini-program/promoter-binding-additional.cjs | 19 | 19 | 0 |
| mini-program/appointment.cjs | 18 | 18 | 0 |
| mini-program/appointment-regression.cjs | 11 | 11 | 0 |
| backend-api/promotion-order-commission.cjs | 22 | 22 | 0 |
| backend-api/promotion-order-commission-regression.cjs | 6 | 6 | 0 |
| 合计 | 272 | 271 | 1 |

命令均为 `node tests/<上表路径>`。基础绑定脚本因规则探测失败退出 1，其余退出 0。POC 两个脚本重复执行结果一致，合计不重复计数。[原始输出与退出码](2026-10-22-regression-results.json)。

## 缺陷状态

| 范围 | 结果 | 当前状态 |
|---|---|---|
| BUG-01～13、BUG-02-A | 登录、刷新并发、会话隔离、资料异常、生命周期及归档故障原断言通过 | 回归通过（隔离模块） |
| 登录 RISK-01、RISK-02 | 加载调用配对与模拟账号缓存隔离原断言通过 | 回归通过（已注明模块路径） |
| BIND-01～07 | 邀请解析、旧响应、去重、身份限制、循环、改绑及模拟回滚原断言通过 | 回归通过（隔离模块） |
| APT-01～07 | 预约支付 API、时序、患者选择、重复创建、错误提示及退出隔离断言通过 | 回归通过（隔离模块） |
| POC-01 | 分销关闭不产生新佣金；开启时金额计算原断言通过 | 待回归 → 回归通过（隔离模块） |
| POC-02 | 支付取消后复用原订单；原订单取消才新建；查询异常、查询中重复提交、会话变化检查通过 | 待回归 → 回归通过（隔离模块） |
| POC-03 | 旧成功/失败不覆盖新结果；隐藏和卸载后不接收旧响应 | 待回归 → 回归通过（隔离模块） |

### BIND-RISK-01：晚绑定上级不补齐下级二级关系

- 状态：待验证；风险：中；本轮再次复现，未登记为新增确认缺陷。
- 步骤：先让 B 绑定 A，再让 A 绑定 C，检查 B 的二级关系。
- 实际：有 C→A、A→B 一级关系，但没有 C→B 二级关系。
- 预期：若业务采用动态关系，应有 C→B；若采用首次绑定快照，则可能符合规则。业务口径尚未确认，不能把该断言失败直接等同已确认缺陷。

## 真实 HTTP：12 项验证受阻

目标 `http://127.0.0.1:5005/api/v1`，无凭证，POST 空对象。全部连接被拒绝（ECONNREFUSED），未收到 HTTP 状态码，不能记为鉴权通过。

- POST /orders、/orders/0/pay、/orders/0/refund。
- POST /distribution/bind、/distribution/withdraw。
- GET /distribution/orders、/distribution/commissions、/distribution/commission-stats。
- POST /appointments、/appointments/0/pay、/appointments/0/cancel、/appointments/0/reschedule。

没有启动环境或重启服务；既有模块回归状态保留，HTTP 层单独标为验证受阻。登录及管理端真实 HTTP 本轮未重新请求。

## 边界

- 真实微信授权、扫码、视觉交互、实际支付/退款/提现、有效账号越权验证、MySQL 事务并发和运行服务版本未验收。
- 管理端仅运行已有绑定路由隔离场景，推广员门户及其他未登记模块未做全量测试。
- 佣金脚本模拟财务配置和 SQL；配置读取与支付回调的真实数据库整链路未验证。
- POC-02 结论仅限同一页面实例内重试，不涵盖创建请求已提交但响应丢失、页面销毁后重复购买等端到端幂等情况。
- 原失败、修复记录保留；本轮没有发现新的已确认缺陷，不代表穷尽全部业务问题。

## 历史

- 2026-10-22：已登记缺陷全面模块复跑；POC-01～03 从待回归改为隔离模块回归通过，其余确认缺陷本轮保持通过；BIND-RISK-01 待验证；12 项 HTTP 验证受阻。
