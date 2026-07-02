# 鼾静健康诊所 - 系统监控与告警体系报告

为确保“鼾静健康诊所”在发生崩溃、故障、网络异常等紧急事件时能够得到快速响应，我们对系统的**日志监控、异常自动捕捉、Webhook 实时外呼告警**等进行了深度集成，并于 2026 年 7 月 2 日完成了相应的监控加固与部署。以下是详细体系报告：

---

## 一、 系统实时监控与报警引擎 (`alert-notifier.js`)

系统已经在后台工程根目录下部署了实时告警分发模块：[alert-notifier.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/alert-notifier.js)。

### 1. 报警工作逻辑
* **本地物理留痕 (alerts.log)**：任何级别（Warning、Error、Critical）的系统故障触发时，均会同步附加完整的报错时间戳、异常类型、堆栈 Trace 信息写入本地磁盘文件 `alerts.log`，方便事后对故障点进行回溯还原。
* **飞书/钉钉群消息 Webhook 秒级外呼**：
  * 支持在系统 `.env` 中通过参数 `ALERT_WEBHOOK_URL` 配置主流群机器人的接收地址（如 `ALERT_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...`）。
  * 故障发生时，该模块会采用 Node.js 原生的 `https` 模块（零依赖、轻量且极快）异步向该 Webhook 发送 JSON 报文，直接将报警消息推送至开发/运维团队群内。

---

## 二、 全局告警埋点接入 (已部署)

监控告警已经深度挂载到了系统的核心运行链条中：

### 1. API 500 严重内部报错实时告警
* **挂载位置**：[server.js:L78](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/server.js#L78)
* **逻辑**：一旦任何前端/管理端 API 发生未捕获的运行时报错，进入 Express 的 `Global Error Handling Middleware` 且 HTTP 状态码为 `500` 时，系统将自动发起级别为 `error` 的告警推送，详细报明异常 API 的请求方法、URL 路径以及详细堆栈，防止悄无声息的接口雪崩。

### 2. 进程级崩溃保护告警 (Uncaught Exceptions)
* **挂载位置**：[server.js:L117-L125](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/server.js#L117-L125)
* **逻辑**：当 Node.js 进程抛出未被任何 try/catch 包裹的顶级异常（Uncaught Exception）或异步 Promise 拒绝（Unhandled Rejection）时，虽然进程不会直接崩溃（得益于全局进程拦截），但系统会立刻发出级别为 `critical` 的最高优先级紧急报警，促使开发团队迅速接入修复。

### 3. 后台轮询与定时器失败告警 (Cron Warning)
* **挂载位置**：[server.js:L109](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/server.js#L109)
* **逻辑**：排班自动过期、分销到期佣金自动对账结算等后台长周期定时任务如果因网络抖动或数据库被锁定发生计算失败，系统会触发 `warning` 级别告警。

---

## 三、 生产环境监控体系推荐配置 (APM 与 PM2)

除了应用内的主动告警外，在生产环境部署时，推荐配置如下外部监控体系：

### 1. PM2 守护进程监控与自动重启
通过 PM2 启动和维持服务生命周期：
```bash
# 启动服务并命名为 hanjing-backend
pm2 start server.js --name "hanjing-backend"

# 开启 PM2 开机自启与进程死锁自动重启
pm2 save
pm2 startup
```
* **监控配合**：配置 `pm2-logrotate` 插件对 `./requests.log` 和 `./alerts.log` 进行每日自动切分与压缩，防止单文件过大。

### 2. Prometheus / Grafana 数据采集
对于业务吞吐指标（QPS、响应延时、数据库连接数、内存及 CPU 负荷），可使用开源的 `express-prometheus-middleware` 暴露 `/metrics` 接口，以便 Grafana 仪表盘进行可视化监测。

---

## 四、 审计结论

“鼾静健康诊所”项目已具备了极其完整且敏捷的监控告警闭环，通过本地文件持久化和线上 Webhook 通知的有机结合，能够做到故障发生的分钟级通知与准确定位。
