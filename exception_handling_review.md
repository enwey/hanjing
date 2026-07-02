# 鼾静健康诊所 - 异常捕获与容错处理审计报告

对于“鼾静健康诊所”微信小程序（C端）与后端服务在**网络异常**、**不合规报文**、**未定义路由接口**以及**异步报错处理**等层面的健壮性审计，已于 2026 年 7 月 2 日完成评估与重构。以下是主要的安全加固成果：

---

## 一、 请求体（Body）非法 JSON 格式的健壮性加固

### 1. 潜在异常
* 用户发送的 POST/PUT 请求如果包含损坏的 JSON（例如少写括号、多写逗号如 `{"id": 1,}`），`express.json()` 解析器会在路由处理器之前抛出致命的 `SyntaxError`。
* **原隐患**：缺少全局截获，Express 会直接在响应体中向客户端吐出 HTML 物理路径及详细错误堆栈（Information Disclosure），这属于严重的安全隐患且让应用显得不健壮。

### 2. 重构加固方案 (已解决)
* **实现路径**：
  * 在 [server.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/server.js) 中（第 61 至 82 行）注册了全局的 Express 错误处理中间件。
  * 精准识别并拦截 JSON 格式解析错误，并将其转换为标准的优雅 JSON 报错格式返回：
    ```javascript
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ code: 400, message: '请求报文 JSON 语法格式错误' });
    }
    ```

---

## 二、 未定义接口路由（404）的 JSON 标准化拦截

### 1. 潜在异常
* 如果用户发起对非存在接口（如 `/api/v1/invalid-route`）的访问，Express 默认会吐出类似 `Cannot GET /api/v1/invalid-route` 的纯文本/HTML 网页响应。
* **原隐患**：打破了小程序前台仅接收标准 `{ code, message, data }` JSON 结构的预期，导致前端发生解析异常（Parse error）。

### 2. 重构加固方案 (已解决)
* **实现路径**：
  * 在路由注册下方增设了 404 兜底拦截器：
    ```javascript
    app.use((req, res, next) => {
      res.status(404).json({ code: 404, message: '请求的接口地址不存在' });
    });
    ```
* **效果**：所有未知路由皆能够遵循统一的 RESTful API 响应契约进行输出，提升前端小程序的异常处理兼容性。

---

## 三、 常驻异步任务与数据库异常兜底 (已合规)

* **排班号源自动过期、自动结算分销佣金的后台定时器（Intervals）**：均已采用 `try/catch` 进行完全包裹。一旦发生数据库临时断连等异常，后台将安全捕获并打印错误日志，不会造成主进程奔溃或挂起。
* **WebSocket 长连接断连**：在 `connection` 与各会话句柄中，对 `close` 和 `error` 事件进行了全捕获，安全释放连接并销毁内存占用，防范网络波动引发的句柄挂死与资源消耗。
