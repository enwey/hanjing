# 运营端登录与会话修复记录

- 日期：2026-10-22（Asia/Shanghai）
- 对应缺陷：ADMIN-AUTH-01～05
- 当前状态：实现完成，待独立回归

## 修复范围

- ADMIN-AUTH-01：认证凭证缺失、格式错误、过期、账号失效和版本失效统一返回401；前端路由进入前预检JWT结构与有效期。
- ADMIN-AUTH-02：管理员JWT加入 `token_version`，新增退出接口递增版本，使当前账号既有Token失效；前端退出先请求服务端撤销，再清理本地状态。
- ADMIN-AUTH-03：登录提交增加互斥、按钮加载和禁用状态。
- ADMIN-AUTH-04：有效登录态访问 `/login` 自动进入工作台。
- ADMIN-AUTH-05：失败计数改为来源地址与用户名组合键，增加15分钟过期清理及10000条容量上限。

## 改动文件

- `hanjing-clinic-backend/db.js`
- `hanjing-clinic-backend/helpers.js`
- `hanjing-clinic-backend/admin-permissions.js`
- `hanjing-clinic-backend/routes/admin.js`
- `hanjing-clinic-管理后台源码-20260607/src/router/index.ts`
- `hanjing-clinic-管理后台源码-20260607/src/views/login/index.vue`
- `hanjing-clinic-管理后台源码-20260607/src/layout/BasicLayout.vue`

## 开发自测

- 后端4个改动JavaScript文件语法检查通过。
- 当前源码隔离请求：无Token访问 `/api/admin/me` 返回401、无效Token返回401、无Token退出返回401。
- 13项认证实现静态检查全部通过，覆盖401语义、Token版本、退出接口、数据库字段、提交互斥、路由预检/分流、服务端退出调用及失败记录治理。
- 管理后台生产构建通过（6631个模块）；仅保留既有大分块警告。

以上为开发阶段自测，不替代独立回归。运行中后端需要重启并完成数据库字段迁移后，才能验证真实登录、退出后旧Token复用、过期Token、停用账号及多标签页场景。

## 状态历史

| 日期 | 阶段 | 状态 | 说明 |
|---|---|---|---|
| 2026-10-22 | 开始修复 | 修复中 | 开始处理 ADMIN-AUTH-01～05 |
| 2026-10-22 | 实现与开发自测 | 待回归 | 相关实现完成，语法、隔离检查、静态检查和生产构建通过 |
