# 预约管理 ADMIN-APPT-01～06 修复记录

## 修复思路

- 补全预约单号搜索字段，并严格校验分页与状态筛选参数。
- 对状态、门店、医生缓存做合法值归一化，等待筛选基础数据加载后再获取列表。
- 为列表请求增加请求序号、明确错误状态和失败后的旧数据清理。
- 为宽表格增加独立横向滚动容器。
- 区分预约集合创建与既有预约 POST 子操作，将后者归入编辑权限。

## 修改位置

- `hanjing-clinic-backend/routes/admin.js`
- `hanjing-clinic-backend/admin-permissions.js`
- `hanjing-clinic-管理后台源码-20260607/src/views/appointment/index.vue`
- `tests/admin/appointment-functional.mjs`

## 代码/配置

- ADMIN-APPT-01：列表与今日计数搜索条件加入 `a.appointment_no LIKE ?`。
- ADMIN-APPT-02：页码限制为正整数，pageSize 限制为 1～200，非法值返回 400。
- ADMIN-APPT-03：非法标签回退 `all`；已删除门店/医生在选项加载后回退“全部门店/全部医生”。
- ADMIN-APPT-04：新增 `appointmentRequestId`、`listError`；只接纳最新请求，失败时清空旧列表并显示可见错误。
- ADMIN-APPT-05：表格包裹 `.table-scroll`，保留 1160px 最小表格宽度并提供局部横向滚动。
- ADMIN-APPT-06：`appointments/:id/*` POST 子操作使用 `edit`；集合 POST `/appointments` 继续使用 `add`。

## 改动说明

- 状态：ADMIN-APPT-01～06 实现完成，均转为待回归。
- 后端语法检查：通过。
- 管理后台生产构建：通过；仅存在原有大分包体积警告。
- 接口开发自测：完整预约单号搜索命中 1 条；非法状态、负页码、负分页大小均返回 400。
- 页面开发自测：损坏缓存恢复为全部筛选并展示 30 条；接口阻断时显示“预约列表加载失败，请稍后重试”；375px 下表格滚动容器可从 270px 滚动至 1164px。
- 权限映射自测：创建预约为 `appointment:add`；预检、延期为 `appointment:edit`；保存/完成诊疗为 `medical_record:edit`。
- 运行环境：当前源码后端已重新加载至本地 5005。
- 数据清理：临时管理员和关联审计已清理，账号残留 0；未修改真实预约。
- 限定：本轮是开发自测，不替代测试角色独立回归。

证据：[appointment-fix-results.json](appointment-fix-results.json)。
