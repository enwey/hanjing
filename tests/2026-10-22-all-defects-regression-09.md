# 现有缺陷第 9 轮独立回归

- 日期：2026-10-22；角色：测试；对象：当前工作区。
- 50 项已登记缺陷在对应隔离模块/模板逻辑/本地资源范围回归通过；未复现原缺陷，不等于真机或上线验收通过。
- 此前 47 项加 HOME-05～07；ENV-01 另计环境问题，本地 HTTP 连接范围保持通过。
- 本轮重新执行 21 个脚本，471 项隔离/静态检查全部通过；27 项本地 HTTP 全部符合预期。不是复用开发自测结果。
- 仅新增相关回归脚本与更新报告；未修改业务代码、未操作开发者工具、未重启服务、未发起真实登录或交易。

## 状态及重点验证

| 缺陷 | 本轮状态 | 证据范围 |
|---|---|---|
| BUG-01～13、BUG-02-A | 保持回归通过 | 登录原隔离模块用例，含原 RISK-01/02 |
| BIND-01～07、BIND-RISK-01 | 保持回归通过 | 绑定、动态两层关系及相关管理路由隔离执行 |
| APT-01～07 | 保持回归通过 | 预约隔离模块 |
| POC-01～03 | 保持回归通过 | 下单、分佣隔离模块 |
| MALL-01～11 | 保持回归通过 | 商城与订单隔离模块 |
| HOME-01～03 | 保持回归通过 | 旧响应隔离、部分失败提示、普通导航调用层 |
| HOME-04 | 保持回归通过 | 四张本地演示头像 HTTP 200、JPEG 文件头正确 |
| HOME-05 | 待回归 → 回归通过（调用层） | 连点只一次登录导航、与其他入口互斥、失败反馈与再次尝试、返回解锁、卸载拦截、redirect 保留 |
| HOME-06 | 待回归 → 回归通过（逻辑/模板绑定） | 错误区重试绑定、重复点击拦截、恢复成功、异常结束 loading、卸载后不重试 |
| HOME-07 | 待回归 → 回归通过（逻辑/模板条件） | 加载提示绑定；真实空状态表达式在初始/加载/空成功/失败/有数据/部分失败状态下分别求值符合预期 |
| ENV-01 | 保持回归通过（本地连接范围） | 健康及公共数据接口可访问 |

HOME-06/07 的实际视觉、触摸验证仍受阻，未操作微信开发者工具，无原生渲染截图；通过仅限上表范围。

## 脚本执行明细

命令均为 node tests/下列路径，退出码均为 0；登录用例执行前清空 LOGIN_TEST_FILTER。

| tests/ 下脚本 | 检查数 | 通过 |
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
| mini-program/mall-order-round-03.cjs | 7 | 7 |
| mini-program/mall-order-regression-03.cjs | 14 | 14 |
| mini-program/mall-order-regression-04.cjs | 4 | 4 |
| mini-program/home.cjs | 32 | 32 |
| mini-program/home-regression.cjs | 6 | 6 |
| mini-program/home-round-02.cjs | 18 | 18 |
| mini-program/home-fix-02-check.cjs | 5 | 5 |
| mini-program/home-regression-02.cjs | 3 | 3 |
| 合计 | 471 | 471 |

新增 home-regression-02.cjs 为 3 项独立补充检查。已有断言未改。
[完整输出](2026-10-22-regression-09-results.json)。

## 真实 HTTP 明细

仅访问 127.0.0.1:5005，无凭据；POST 请求体为空对象，全部被鉴权拒绝，未提交有效业务操作。

- 5 项 200：health/ready、api/v1/home/stats、doctors、stores、products，健康 ok=true，业务 code=0。
- 1 项预期 404：api/v1/products/0。
- 5 项预期 401 GET：orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats。
- 11 项预期 401 POST：orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule。
- 4 项头像 200：static/demo/doctor-1.jpg～doctor-4.jpg，JPEG 文件头正确。
- 1 项预期 404：static/demo/server.js。

401/404 为负向检查通过，不代表登录后业务成功。

## 未验收与风险边界

- 微信真实页面栈、隐私授权、像素布局、文字换行、遮挡与点击区域未验证。
- 实际登录、真实预约/支付/退款/提现未执行；模拟 SQL 不证明真实数据库事务、并发锁及资金到账。
- MALL-10 不覆盖清空本地存储、跨设备；未知结果仍不自动过期解锁。
- 管理端仅覆盖既有绑定路由，未做管理/推广端全面验收。
- 当前手机环境配置及正式接口未验证。本机回环地址可达不等于手机可达。
- 原失败、开发自测及此前环境受阻历史保留。

## 历史

| 日期 | 操作 | 结果 |
|---|---|---|
| 2026-10-22 | 第 9 轮独立回归 | 50 项限定范围通过；471 项隔离/静态检查与 27 项 HTTP 通过；视觉/原生交互未验收 |
