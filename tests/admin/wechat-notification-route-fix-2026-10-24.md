# 微信通知顶级路由调整

- 日期：2026-10-24
- 状态：待回归
- 范围：运营后台菜单、Vue Router、面包屑及系统设置页跳转

## 实现

- 页面访问路径由 `/settings/wechat-notifications` 调整为 `/wechat-notifications`。
- 移除路由的 `parentPath: '/settings'`，与 `/permission` 和 `/log` 保持同级。
- 侧边栏菜单、系统设置页跳转和菜单根路径解析同步更新。
- 后端 API 仍使用 `/api/admin/settings/wechat-notifications`，该路径是接口分组，不影响前端页面层级。

## 验证

| 检查项 | 结果 | 说明 |
|---|---|---|
| 旧前端路径检索 | 通过 | `src` 中无 `/settings/wechat-notifications` 页面路由残留 |
| TypeScript 检查及生产构建 | 通过 | `vue-tsc --noEmit && vite build` 成功 |
| 浏览器菜单与面包屑视觉回归 | 未执行 | 等待独立回归，不标记通过 |

## 历史

- 2026-10-24：实现完成，状态为“待回归”。
