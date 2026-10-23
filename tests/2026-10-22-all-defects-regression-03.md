# 全部已登记缺陷：第 3 轮独立回归

- 日期：2026-10-22；对象：含尚未提交修复的当前工作区。
- 范围：登录 BUG-01～13、BUG-02-A（14 项），绑定 BIND-01～07，预约 APT-01～07，分佣 POC-01～03，商城 MALL-01～05，以及已确认的 BIND-RISK-01，共 37 项确认缺陷。另包含登录 RISK-01/02。
- 结论：37 项确认缺陷的已复现模块路径回归通过；369 项隔离检查全部通过。18 项真实 HTTP 验证受阻；不等同整端上线验收。
- 未修改业务代码，未操作开发者工具、真实账号、数据库或资金；新增测试脚本并更新记录。

## 执行记录

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
| backend-api/two-level-commission-regression.cjs（新增） | 25 | 25 |
| 合计 | 369 | 369 |

均重新执行 `node tests/<脚本>`，登录执行前清空 LOGIN_TEST_FILTER，所有最终执行退出 0 且具有完整结果输出。[完整输出与退出码](2026-10-22-regression-03-results.json)。

新增脚本首次截取依赖源码时误匹配字符串内标记，出现测试脚本 SyntaxError；更正截取边界后重新执行 25 项通过，未改变业务或结果断言。首次脚本错误在原始输出中保留，不计入业务用例通过数。

## 逐模块状态

| 缺陷范围 | 本轮验证 | 当前状态 |
|---|---|---|
| BUG-01～13、BUG-02-A、登录 RISK-01/02 | 登录、刷新并发、资料异常、生命周期和模拟存储隔离原场景通过 | 保持回归通过（隔离模块） |
| BIND-01～07 | 解析、迟到响应、去重、停用身份、循环、改绑、模拟回滚原场景通过 | 保持回归通过（隔离模块） |
| APT-01～07 | 预约支付调用、选择、响应顺序、重复创建等 29 项通过 | 保持回归通过（隔离模块） |
| POC-01～03 | 分销开关、支付取消重试和推广列表响应等场景通过 | 保持回归通过（隔离模块） |
| MALL-01～05 | 数量统计、退款入口、过期响应、鉴权清理、数量限制原场景及边界通过 | 保持回归通过（隔离模块，视觉未验收） |
| BIND-RISK-01 | 后补上级关系及新订单二级佣金正确，见下文 | 待回归 → 回归通过（隔离模块） |

## BIND-RISK-01 重点证据

- 实际绑定路由生成关系，随后执行实际佣金函数；不手工补齐期望关系。
- A 无上级，B→A、C→B、D→C：B 分给 A；C 分给 B/A；D 分给 C/B，A 不得佣金。
- A 后绑定 E：B 分给 A/E；C 仍分给 B/A，E 不得佣金；D 仍分给 C/B，A/E 不得佣金。
- 24 种绑定顺序排列均得到同一最终两层关系和 B/C/D 新佣金对象；重复绑定未新增或改写关系。此为顺序排列测试，不是并发测试。
- 二级缓存缺失及错误时，新佣金读取当前两条一级关系，不采用错误缓存。
- 管理端改绑更新直接下级二级关系、不改变更深层关系；同步写入失败还原模拟事务。
- 独立商品比例、混合商品、商品开关、全局开关、零比例、数量及实付折扣计算检查通过。
- 没有执行历史佣金重算、补发或真实资金转移。

## 真实 HTTP：18 项验证受阻

目标 `http://127.0.0.1:5005/api/v1`；全部 ECONNREFUSED，未取得 HTTP 状态码：

- GET products、products/0、orders、orders/0。
- POST orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt。
- POST distribution/bind、distribution/withdraw。
- GET distribution/orders、distribution/commissions、distribution/commission-stats。
- POST appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。

无有效凭证，POST 空对象；未启动环境。登录/管理端真实 HTTP 本轮未执行，不能引用旧轮通过作为本轮真实接口通过。

## 验收边界和历史

- 测试采用实际源码加模拟 SQL/API/wx。SQL 联表与 upsert 由测试模拟语义处理，未在 MySQL 执行；真实唯一约束、事务隔离、死锁/锁竞争及并发绑定未验收。
- 现有 POC 基础脚本的关系查询返回模拟记录；动态链路以专项脚本为补充证据，不将该模拟器当作数据库执行器。
- 真实微信授权、页面视觉、有效身份越权、支付回调、退款、提现到账以及历史二级缓存展示未验收。管理端只验证既有绑定路由场景，推广员门户未全面测试。
- 本轮没有发现新增已确认缺陷，不代表穷尽全项目问题。
- 2026-10-22：BIND-RISK-01 从待回归改为模块回归通过，其余确认缺陷保持通过；18 项 HTTP 受阻；失败历史及开发记录保留。
