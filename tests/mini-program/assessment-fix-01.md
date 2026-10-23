# ASMT-01～11 修复记录

- 后续独立回归：[第 10 轮](../2026-10-22-all-defects-regression-10.md)，ASMT-01～07、10、11 限定范围通过；08、09 源码检查通过，但真实服务验证受阻，保留实现待回归背景。下方为开发阶段历史。

- 日期：2026-10-22；角色：开发；实现状态：待回归。
- 范围：仅睡眠评估本轮登记问题，未改推广端及其他既有改动，未提交 Git。
- 44 项相关开发自测通过；未进行独立回归、真实账号/录音/数据库写入。

## 修复思路与改动点

| 缺陷 | 改动 |
|---|---|
| ASMT-01/02 | 评估首页以请求序号及登录代际隔离异步结果；切换账号清空记录与家庭成员；登出、无权访问、卸载阻止旧数据回写。ESS 详情每次加载先清空旧报告，并校验会话及请求 |
| ASMT-03 | 离线同步错误独立提示，不再中止后续在线列表加载 |
| ASMT-04 | 列表与切换成员请求成功时清空 loadError |
| ASMT-05 | ESS 无 ID 缓存回退核验当前 profile.id 与缓存 userId、类型；将缓存键纳入现有账号隔离归档/清理 |
| ASMT-06 | 保存成功记录报告 ID；跳转失败提示并解锁；同一账号、就诊人和答案重试仅打开已存报告，不重复 POST；缓存失败不重复创建 |
| ASMT-07 | 卸载时停止所属录音、清理支持解绑的回调；旧回调与授权/亮度/提交后的异步结果受卸载标记保护 |
| ASMT-08 | ESS 复用 resolveUserPatient 的当前用户关联与就诊人校验，核验成功后才进行去重查询和写入 |
| ASMT-09 | ESS 必须提交 8 个 0～3 的整数；拒绝空数组、越界、负数、字符串、小数等输入 |
| ASMT-10 | 结果详情与既有后端分档一致：0～5 正常、6～10 轻度、11～15 中度、16～24 重度；未修改后端分档或迁移历史数据 |
| ASMT-11 | 同一登录代际只运行一个同步任务；逐条成功后从最新队列移除对应已发送快照，保留同步期间新增、变更、失败和其他账号的记录 |

源码改动：

- mp-weixin-rewrite/pages/assessment/index.js
- mp-weixin-rewrite/pages/assessment/questionnaire/index.js
- mp-weixin-rewrite/pages/assessment/recording/index.js
- mp-weixin-rewrite/pages/assessment/result/index.js
- mp-weixin-rewrite/api/modules/assessment-api.js
- mp-weixin-rewrite/stores/session-store.js
- hanjing-clinic-backend/routes/client.js

## 开发自测证据

- node tests/mini-program/assessment.cjs：29/29 通过，原缺陷断言不变。
- 测试适配：模拟 session 增加实际使用的 getLoginGeneration；后端测试加载实际 resolveUserPatient，模拟用户 10 仅关联就诊人 1。不是直接模拟“校验通过”来绕过真实逻辑。
- node tests/mini-program/assessment-fix-01-check.cjs：8/8 相关边界检查通过，包含 0～24 全部合法总分的一致性（作为 1 项循环用例计数）、拒绝写入、缓存归档、同步合并和报告重开。
- login-comprehensive.cjs 仅筛选 FIXR owned pending、REG5、FIX13：7/7 通过。用于检查新增 ESS 缓存键对现有归档异常保护的影响，不进行登录全量测试。
- 以上合计 44 项。7 个变更 JS 文件 node --check 通过；git diff --check 通过（仅换行符提示）。
- [原始输出](assessment-fix-01-results.json)。未把本轮开发自测标成独立回归。

## 尚未验收

- 本地后端未重启：当前运行服务不保证已加载新 ESS 路由逻辑，需重启后执行真实接口回归。
- 未操作微信开发者工具，未验证真机录音停止、授权、亮度、页面栈与视觉效果；界面文案变更的真实渲染仍未验收。本轮未修改 WXML/WXSS。
- ASMT-10 只解决系统内部一致性，沿用既有后端规则；不代表临床分档获得医学验证。
- ASMT-11 本轮处理队列覆盖及并发同步；不承诺网络响应丢失或存储失败时的服务端恰好一次写入。
- 不涉及历史错误报告的自动清理/归属更正，避免改动已有健康数据。

## 状态历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 接收修复任务 | ASMT-01～11 修复中 |
| 2026-10-22 | 源码实现及相关自测完成 | 待回归；44 项通过，真实录音/视觉未验收，本地后端未重启 |
