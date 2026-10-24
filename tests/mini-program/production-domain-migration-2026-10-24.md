# 小程序正式 API 域名迁移

- 日期：2026-10-24
- 状态：待回归

## 实现范围

- 将重写版小程序正式 API 地址由 `https://m.hanjinghealth.com/api/v1` 更新为 `https://m.xingkangming.com/api/v1`。
- 同步更新环境隔离测试中的正式域名断言。
- 将 `develop` 环境默认 API 调整为正式 API，修复真机预览把 `127.0.0.1` 解析为手机自身而无法获取数据的问题；开发工具仍可通过调试开关显式切换本地 API。
- 物理手机上的开发预览强制忽略历史本地 API 覆盖缓存；本地 API 切换仅允许在微信开发者工具中使用。

## 已执行验证

- `https://m.xingkangming.com/api/v1/stores` 实际返回 HTTP 200 和 JSON 业务数据。
- 执行 `node mp-weixin-rewrite/test-environment-isolation.js`，4 项检查全部通过。
- 验证开发预览默认请求正式 API、体验版及正式版忽略调试覆盖、iOS/Android 真机忽略本地缓存、开发工具可显式切换本地 API，均通过。
- 新域名门店接口实际返回 HTTP 200；无效诊断登录码已到达微信接口并返回微信 `40029 invalid code`，证明登录反向代理链路可达。
- 检索重写版小程序，未发现旧正式 API 域名 `m.hanjinghealth.com` 残留。

## 未验证范围

- 微信公众平台 request、uploadFile、downloadFile、socket 合法域名配置未核验。
- `wss://m.xingkangming.com/api/v1/im/ws` 真机连接未验证。
- 体验版、正式版的登录、上传、图片加载、在线客服和支付链路未独立回归。

## 历史

- 2026-10-24：实现完成，开发自测通过，状态标记为待回归。
- 2026-10-24：修复真机预览默认连接手机自身 `127.0.0.1` 的环境选择问题，3 项环境隔离检查通过，保持待回归。
- 2026-10-24：进一步禁止物理真机读取本地 API 覆盖缓存，4 项环境隔离检查通过；真实扫码预览仍待用户侧回归。
