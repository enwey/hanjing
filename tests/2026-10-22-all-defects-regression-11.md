# 现有缺陷第 11 轮独立回归

- 日期：2026-10-22；角色：测试；当前工作区（macOS）。
- 40 个测试套件重新执行：713 项隔离/静态/MySQL断言全部通过；33 项本地 HTTP 接口符合预期响应。
- 发现新缺陷 `ADMIN-ENV-01`（高）：管理后台 3 个 CDP 浏览器测试脚本（`auth-browser-regression.mjs`、`appointment-functional.mjs`、`dashboard-functional.mjs`）硬编码 Windows 路径，导致 macOS 环境下浏览器无法启动，相关 UI 链路验证受阻。
- 真实服务链路阻碍保持：`ASMT-08/09`（缺少有效微信会话）、`PROM-LOGIN-02`（推广端数据库鉴权）真实链路保持【验证受阻】。
- 未编写任何业务修复代码，未修改项目生产实现。

## 缺陷状态

| 范围 / 编号 | 结论与边界 |
|---|---|
| 原 50 项基础缺陷 (BUG/BIND/APT/POC/MALL/HOME) | 回归通过：隔离与逻辑断言全部通过；不等于真机验收 |
| COMM-01～16（社区发帖/互动/举报） | 回归通过：2 轮 22 项页面/数据库检查与 13 项 HTTP 接口通过 |
| FLOW-01～05（AI鼾声流程） | 回归通过：13 项隔离断言通过；真机麦克风与微信后台未验收 |
| SNORE-01～04（AI鼾声分析） | 回归通过：MySQL 12 并发、幂等、边界均通过 |
| RESULT-01～04（结果评级与分数一致性） | 回归通过：33 项断言通过，0分及 100 分边界处理正常 |
| ASMT-01～07、10～17 | 回归通过：隔离逻辑断言全部通过 |
| ASMT-08、09 | 验证受阻：真实服务 5005 缺乏有效微信账号会话，端到端越权验证受阻 |
| PROM-LOGIN-01、03～06 | 回归通过：限流、防重、样式规格断言通过 |
| PROM-LOGIN-02 | 保持验证受阻：真实数据库端到端鉴权未验收 |
| ADMIN-AUTH-01～05 | 回归通过：接口鉴权、锁定策略、旧Token复用拦截等通过 |
| ADMIN-APPT-01～05 | 回归通过：接口非法分页/状态400、单号搜索精准匹配等通过 |
| DASH-02～05 | 回归通过：持久化校验、空态与独立错误注入通过 |
| ADMIN-ENV-01（新增） | 待修复：管理端 3 个自动化脚本硬编码 Windows 路径，macOS 下无法运行 |

## 执行明细

| tests/ 下测试脚本 | 检查项 | 结果 |
|---|---:|:---:|
| mini-program/promoter-binding-regression.cjs | 49 | PASS |
| mini-program/promoter-binding.cjs | 28 | PASS |
| mini-program/promoter-binding-additional.cjs | 21 | PASS |
| mini-program/login-comprehensive.cjs | 133 | PASS |
| mini-program/appointment-regression.cjs | 11 | PASS |
| mini-program/appointment.cjs | 18 | PASS |
| backend-api/promotion-order-commission.cjs | 22 | PASS |
| backend-api/promotion-order-commission-regression.cjs | 6 | PASS |
| mini-program/mall-order.cjs | 25 | PASS |
| mini-program/mall-order-regression.cjs | 21 | PASS |
| backend-api/two-level-commission.cjs | 24 | PASS |
| backend-api/two-level-commission-regression.cjs | 25 | PASS |
| mini-program/mall-order-round-02.cjs | 13 | PASS |
| mini-program/mall-order-round-03.cjs | 7 | PASS |
| mini-program/mall-order-regression-03.cjs | 14 | PASS |
| mini-program/mall-order-regression-04.cjs | 4 | PASS |
| mini-program/home-regression.cjs | 6 | PASS |
| mini-program/home.cjs | 32 | PASS |
| mini-program/home-round-02.cjs | 18 | PASS |
| mini-program/home-fix-02-check.cjs | 5 | PASS |
| mini-program/home-regression-02.cjs | 3 | PASS |
| mini-program/assessment.cjs | 29 | PASS |
| mini-program/assessment-fix-01-check.cjs | 8 | PASS |
| mini-program/assessment-round-02.cjs | 11 | PASS |
| mini-program/assessment-regression-03.cjs | 8 | PASS |
| mini-program/ess-functional.cjs | 7 | PASS |
| mini-program/ess-regression-01.cjs | 6 | PASS |
| mini-program/snore-functional.cjs | 17 | PASS |
| mini-program/snore-fix-01-check.cjs | 5 | PASS |
| mini-program/snore-flow.cjs | 12 | PASS |
| mini-program/snore-flow-fix-01-check.cjs | 10 | PASS |
| mini-program/snore-flow-regression-01.cjs | 13 | PASS |
| mini-program/snore-result-functional.cjs | 17 | PASS |
| mini-program/snore-result-regression-01.cjs | 33 | PASS |
| mini-program/snore-mysql-regression-02.mjs | 10 | PASS |
| mini-program/community-functional.cjs | 10 | PASS |
| mini-program/community-api-functional.mjs | 14 | PASS |
| mini-program/community-round-02.cjs | 5 | PASS |
| mini-program/community-api-round-02.mjs | 7 | PASS |
| promoter/login-regression.cjs | 6 | PASS |
| **通过检查项合计** | **713** | **PASS** |

### 执行受阻脚本（因 ADMIN-ENV-01）
* `tests/admin/auth-browser-regression.mjs`：超时中断（Windows 路径无法在 macOS 启动）
* `tests/admin/appointment-functional.mjs`：超时中断（Windows 路径无法在 macOS 启动）
* `tests/admin/dashboard-functional.mjs`：超时中断（Windows 路径无法在 macOS 启动）
