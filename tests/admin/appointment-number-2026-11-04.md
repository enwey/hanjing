# 统一预约编号

状态：待回归

## 实现范围
- 运营创建接口 `/api/admin/appointments` 和患者端共用接口 `/api/v1/appointments` 都使用 `nextAppointmentNumber`。
- 格式：AP + 初始预约就诊日期 YYYYMMDD + 至少四位流水号，例如 AP202611040001。
- 同一天所有门店、医生和入口共用流水号；不同日期独立从 0001 开始；超过 9999 自动增加位数。
- `appointment_number_sequences` 表使用日期主键和事务写锁，分配与创建预约在同一事务，失败一起回滚。
- 保留历史编号及其支付/查询关联；改约、取消不改编号。种子数据作为历史样例保留。
- 修改文件：后端 appointment-number.js、db.js、routes/admin.js、routes/client.js。

## 已执行的开发自测
- 新模块及两个路由文件 Node 语法检查通过。
- `node tests/admin/appointment-number.integration.mjs` 在临时 MySQL 数据库执行并清理：60 次并发无重复、日期隔离、事务回滚、超过 9999 扩位、非法日期拒绝均通过。
- 代码检索确认业务预约 INSERT 仅两个入口，均已接入统一生成器。
- 本地后端已重启，/health/ready 返回正常，初始化包含新流水表。
- 未执行各客户端真实创建预约、支付退款回归及独立回归；本轮未修改页面布局。

## 历史
- 2026-11-04：修复中，统一编号规则。
- 2026-11-04：实现及开发自测完成，待回归。
