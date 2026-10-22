# 推广端登录页面修复记录

- 日期：2026-10-22（Asia/Shanghai）
- 对应缺陷：PROM-LOGIN-01～05
- 当前状态：待回归
- 说明：本文件记录开发实现与开发自测，不代表测试角色独立回归通过。

## 修复思路

- 为推广端登录接口增加独立的 IP 时间窗限流，避免被全局宽松额度掩盖。
- 将不存在、停用、未设密码和密码错误统一为相同 HTTP 状态与响应文案；不存在账号仍执行 PBKDF2 假哈希校验，降低响应时间侧信道差异。
- 登录请求增加提交中互斥状态，并同步驱动按钮加载与禁用。
- 登录卡片改为 border-box 并限制为视口宽度，窄屏缩小内边距。
- 路由守卫发现已有 Token 访问登录页时直接进入工作台。

## 修改位置

- `hanjing-clinic-backend/routes/promoter.js`
- `hanjing-promoter-portal/src/views/login/index.vue`
- `hanjing-promoter-portal/src/router/index.ts`

## 代码 / 配置

- 登录专用限流：每个来源 IP 在 15 分钟时间窗内最多 5 次请求，超限返回 429 和 `Retry-After`。
- 认证失败响应：统一返回 401“手机号或密码错误”。
- 前端提交：`isSubmitting` 在请求开始时置为 true，并在 `finally` 恢复。
- 响应式卡片：`box-sizing: border-box; max-width: calc(100vw - 32px)`，480px 以下使用较小内边距。
- 登录路由：已有本地 Token 时从 `/login` 分流至 `/dashboard`。

## 改动说明

- 密码不再在登录接口中执行 `trim()`，避免合法密码首尾字符被静默改变。
- 全局 API 限流仍保留；登录专用限流作为额外防线。
- 当前限流为进程内状态，仓库既有部署配置为单实例；若未来扩展多实例，需要使用共享限流存储才能形成全局额度。

## 开发自测

| 检查 | 结果 | 范围 |
|---|---|---|
| `node --check routes/promoter.js` | 通过 | 后端路由语法 |
| `npm.cmd run build` | 通过 | 推广端 TypeScript 与 Vite 生产构建 |
| 独立 Express 路由连续 6 次空登录 | 通过 | 前 5 次返回 400，第 6 次返回 429，`Retry-After=900` |
| `git diff --check` | 通过 | 本轮业务文件与报告格式 |

## 待独立回归范围

- 不存在、停用、未设密码、密码错误是否统一响应；正确账号是否仍可成功登录。
- 第 6 次登录是否稳定返回 429，时间窗结束后是否恢复。
- 双击、连续回车、失败后再次提交时按钮状态是否正确。
- 320/360/375/480px 视觉布局与错误提示是否完整。
- 已有有效 Token、过期 Token 和伪造 Token 访问 `/login` 的状态流转。
