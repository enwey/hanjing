# 现有缺陷第 10 轮独立回归

- 日期：2026-10-22；角色：测试；当前工作区。
- 24 个脚本重新执行：514 项隔离/静态检查全部通过；另 5 项登录布局规格检查通过；33 项本地 HTTP 检查符合预期。
- 没有复用上轮开发自测结果。原 50 项缺陷在已登记模块/模板/资源范围保持通过。
- ASMT-01～07、10、11 在本轮限定范围回归通过；ASMT-08、09 源码隔离检查通过，但真实服务验证受阻，保留此前实现待回归背景。
- 推广端记录已纳入检查：6 项源码断言与 5 项布局规格通过；PROM-LOGIN-02 继续保持真实链路验证受阻。其他推广端此前限定范围结论保留，本轮不新增视觉或真实登录通过结论。
- 未修改业务代码、未重启服务、未操作开发者工具/浏览器桌面、未提交真实交易或健康数据。

## 缺陷状态

| 范围 | 结论与边界 |
|---|---|
| 原 BUG/BIND/APT/POC/MALL/HOME 共 50 项 | 本轮对应隔离/模板/本地资源检查通过；不等于真机或真实交易验收 |
| ASMT-01 | 回归通过（隔离模块）：退出清理、迟到响应拦截、ESS 401 清理、账号代际切换 |
| ASMT-02 | 回归通过（隔离模块）：成员乱序返回不覆盖新选择 |
| ASMT-03 | 回归通过（隔离模块）：同步失败仍加载在线记录 |
| ASMT-04 | 回归通过（隔离模块）：成功刷新清除旧错误 |
| ASMT-05 | 回归通过（隔离模块）：跨账号缓存拒绝、同账号缓存可读、实际 session 模块归档清理 |
| ASMT-06 | 回归通过（调用层）：跳转失败解锁，同报告重试仅导航不再次 POST |
| ASMT-07 | 回归通过（模拟录音管理器）：卸载停止、迟到回调不提交；真实麦克风和系统中断未验收 |
| ASMT-08、09 | 验证受阻（真实服务）；实际路由及归属解析器配合模拟数据库检查通过，无权就诊人及无效答案无 INSERT |
| ASMT-10 | 回归通过（内部逻辑）：0～24 总分的列表/详情评级一致；不是医学有效性验收 |
| ASMT-11 | 回归通过（隔离模块）：同步保留新入队与其他账号记录、并发同步合并 |
| ENV-01 | 本地 HTTP 可达范围保持通过；不证明当前手机环境正确 |
| PROM-LOGIN-01、03～05 | 本轮源码断言通过；保留此前限定范围状态，本轮未重新进行独立实例限流、构建或视觉验证 |
| PROM-LOGIN-02 | 保持验证受阻；统一错误/假哈希源码检查通过，不声称真实数据库链路通过 |
| PROM-LOGIN-06 | 5 项当前 CSS 规格检查通过；其报告中已有其他独立桌面回归记录，本轮未重做截图或移动端验收 |

## 运行版本阻碍

- Get-NetTCPConnection 被环境拒绝访问；改用只读 netstat，确认 5005 监听 PID 8692。
- 该 Node 进程启动时间 2026-10-22 14:35:43；routes/client.js 修改时间 15:39:21。结合修复记录“未重启后端”，本轮没有新路由已被运行服务加载的证据。
- 33 项真实请求仅覆盖公共资源及无凭据负向鉴权，不会进入已登录 ESS 就诊人/答案校验分支。因此不能将其作为 ASMT-08/09 真实回归通过证据。
- 未尝试通过伪造凭据、真实越权写入、重启或替换服务绕过本轮测试范围。

## 执行明细

命令均为 node tests/下列路径，退出码均为 0；登录前清空 LOGIN_TEST_FILTER。

| tests/ 下脚本 | 数量 | 通过 |
|---|---:|---:|
| mini-program/promoter-binding-regression.cjs | 49 | 49 |
| mini-program/promoter-binding.cjs | 28 | 28 |
| mini-program/promoter-binding-additional.cjs | 21 | 21 |
| mini-program/login-comprehensive.cjs | 119 | 119 |
| mini-program/appointment-regression.cjs | 11 | 11 |
| mini-program/appointment.cjs | 18 | 18 |
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
| mini-program/home-regression.cjs | 6 | 6 |
| mini-program/home.cjs | 32 | 32 |
| mini-program/home-round-02.cjs | 18 | 18 |
| mini-program/home-fix-02-check.cjs | 5 | 5 |
| mini-program/home-regression-02.cjs | 3 | 3 |
| mini-program/assessment.cjs | 29 | 29 |
| mini-program/assessment-fix-01-check.cjs | 8 | 8 |
| promoter/login-regression.cjs | 6 | 6 |
| 合计 | 514 | 514 |

另 5 项 CSS 提取对照：两端 width=400px、max-width=calc(100vw - 32px)、box-sizing=border-box、padding=40px、480px 断点 padding=28px 24px，均符合预期；不是 computed style 或像素截图。

[完整原始输出](2026-10-22-regression-10-results.json)。

## 33 项本地 HTTP

目标仅 127.0.0.1:5005，无凭据，POST 为空对象。

- 5 项 200：health/ready、api/v1/home/stats、doctors、stores、products；健康 ok=true、公共业务 code=0。
- 9 项 GET 401：orders、orders/0、distribution/orders、distribution/commissions、distribution/commission-stats、assessments、assessments/ess-questions、assessments/snore-analysis/asmt-0、assessments/snore-analysis/snore-0。
- 13 项 POST 401：orders、orders/0/pay、orders/0/refund、orders/0/cancel、orders/0/confirm-receipt、distribution/bind、distribution/withdraw、appointments、appointments/0/pay、appointments/0/cancel、appointments/0/reschedule、assessments/ess、assessments/snore。
- 4 项头像 GET 200 且 JPEG 文件头正确：static/demo/doctor-1.jpg～doctor-4.jpg。
- 2 项预期 404：api/v1/products/0、static/demo/server.js。

401/404 为负向用例符合预期，不是业务成功。

## 未验收

真机视觉、原生授权/录音/页面栈、实际账号登录、数据库事务并发、真实预约/支付/退款/提现，以及音频算法的医学准确性均未验收。未扩展为全系统无缺陷结论。

## 历史

| 日期 | 操作 | 结论 |
|---|---|---|
| 2026-10-22 | 第 10 轮独立回归 | 所执行检查符合预期；ASMT 9 项限定范围通过，2 项真实服务验证受阻；PROM-LOGIN-02 保持受阻 |
