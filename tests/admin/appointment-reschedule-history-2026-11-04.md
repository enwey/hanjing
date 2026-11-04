# 预约改约记录

状态：待回归

## 实现
- 运营后台 PUT /api/admin/appointments/:id 与患者端 POST /api/v1/appointments/:id/reschedule 均保存改约记录。
- 新表 appointment_reschedule_history：预约 ID、来源（admin/patient）、操作账号 ID、姓名快照、改约前后 JSON 快照、操作时间；按预约 ID 索引。
- 快照包含门店/医生 ID 与名称、排班 ID、日期、时段。旧值取自事务锁定的预约。写历史与预约修改共用事务，失败回滚；相同时段等未发生实际变更时不重复记历史。
- 运营详情沿用预约查看权限和数据范围校验后返回记录，倒序显示；新增“改约记录”区域展示前后信息、操作人、来源、时间和空状态。
- 历史没有保存的改约不补造，预约编号和收费关联不变。
- 联调发现患者端两小时改约限制直接对数据库 Date 对象调用 split 导致异常，改为先通过已有 formatDate 标准化。

## 修改文件
- 服务端：appointment-reschedule-history.js、db.js、routes/admin.js、routes/client.js。
- 运营端：src/views/appointment/detail.vue。

## 开发验证
- Node 新模块及两个路由语法检查通过；vue-tsc --noEmit 通过。
- tests/admin/appointment-reschedule-history.integration.mjs：临时 MySQL + 实际 Express 路由，后台改约、患者改约、详情记录倒序及前后时间/操作人、原编号不变、其他用户越权拒绝、无变化不新增、事务回滚均通过；测试库已清理。
- 首轮详情查询失败：测试角色默认个人范围，调整测试夹具为系统范围后通过，未扩大实际账号权限。首轮同时暴露 Date 类型解析异常，已修复并复测。
- 独立无头 Chrome 使用模拟接口检查两条改约记录与空状态，断言通过，无运行时异常；截图已核对布局。
- 预览脚本：_codex-tmp/reschedule-history-preview.mjs；截图位于系统临时目录 hanjing-reschedule-_appointment_detail_1.png。
- 未执行真机扫码或患者端实际 UI 改约操作，未做独立回归及正式部署。

## 历史
- 2026-11-04：修复中，接入两个改约入口及详情展示。
- 2026-11-04：实现和上述开发自测完成，待回归。
