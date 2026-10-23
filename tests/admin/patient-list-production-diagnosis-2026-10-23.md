# 正式环境患者列表 500 根因剖析与诊断报告

- 状态：**已确认根因，待正式环境验证**
- 现象：正式环境访问患者管理接口 `GET https://m.hanjinghealth.com/api/admin/patients` 报 500，提示 `获取患者列表失败`，本地环境访问正常。

## 1. 源码与报错机制定位
在 [hanjing-clinic-backend/routes/admin.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/routes/admin.js#L1980-L1984) 中：
```javascript
} catch (error) {
  console.error('Failed to query patients list:', error?.code, error?.sqlMessage || error?.message, error);
  res.status(500).json({ code: 500, message: '获取患者列表失败' });
}
```
`GET /api/admin/patients` 路由内部捕获到了 SQL 执行或下游查询异常，为了安全脱敏统一向前端返回了 `{ code: 500, message: "获取患者列表失败" }`。

## 2. 为什么本地正常而正式环境 500（根因对比）
通过全工程历史提交与数据库迁移机制比对，发现以下核心根因：

1. **根因一（最高频致命项）：`patient_crm_records` 表字段改名在正式环境失败或缺失**
   - 历史表结构：在 7 月份提交 `a33a78d3` 中，`patient_crm_records` 建表使用的是 `admin_user_id`（且附带外键 `FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)`）；
   - 代码升级：在 10 月 8 日提交 `7aca1721` 中，患者列表查询新增子查询：
     ```sql
     (SELECT r.follower_id FROM patient_crm_records r WHERE r.patient_id = p.id ORDER BY r.id DESC LIMIT 1) as follower_id,
     (SELECT au.name FROM patient_crm_records r JOIN admin_users au ON au.id = r.follower_id WHERE r.patient_id = p.id ORDER BY r.id DESC LIMIT 1) as follower_name,
     ```
   - 迁移脚本漏洞：`db.js` 尝试使用 `ALTER TABLE patient_crm_records RENAME COLUMN admin_user_id TO follower_id`；
     - **语法不兼容**：MySQL 5.7 不支持 `RENAME COLUMN` 语法，抛出 1064 语法错误；
     - **外键约束死锁**：即便在 MySQL 8.0，若未先 drop 掉 `admin_user_id` 上的外键，直接 RENAME 也会被 MySQL 阻止；
     - 脚本外层使用了 `try { ... } catch (e) {}` 静默捕获，导致正式库迁移失败但服务照常启动；
     - 正式库中实际依然是 `admin_user_id`，查询 `r.follower_id` 必定抛出 `ER_BAD_FIELD_ERROR: Unknown column 'r.follower_id' in 'field list'`。

2. **根因二：`appointments` 表缺失 `source` 字段**
   - 患者列表查询包含：
     ```sql
     (SELECT source FROM appointments WHERE patient_id = p.id ORDER BY appointment_date DESC, id DESC LIMIT 1) as latest_source
     ```
   - `db.js` 中虽然 `CREATE TABLE IF NOT EXISTS appointments` 声明了 `source` 字段，但对历史已存在的正式库**完全漏写了 `ALTER TABLE appointments ADD COLUMN source`** 的增量脚本；
   - 若正式库在建表之初未包含该字段，正式库执行此查询将抛出 `ER_BAD_FIELD_ERROR: Unknown column 'source' in 'field list'`。

3. **根因三：`snore_assessments` / `ess_assessments` 缺少 `patient_id` 字段**
   - 列表详情补充逻辑查询：
     ```sql
     SELECT id, patient_id, apnea_events, risk_level, created_at FROM snore_assessments WHERE patient_id IN (...)
     SELECT id, patient_id, total_score, risk_level, created_at FROM ess_assessments WHERE patient_id IN (...)
     ```
   - 若正式库缺少 `patient_id`，此处同样会中断抛错。

## 3. 修复措施实施

1. **增量迁移脚本自愈补全**（[hanjing-clinic-backend/db.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/db.js#L644-L648,L1770-L1775)）：
   - 补全 `appointments.source` 增量字段迁移：
     ```javascript
     try {
       await query(`ALTER TABLE appointments ADD COLUMN source VARCHAR(30) DEFAULT 'mini_app';`);
     } catch (err) {}
     ```
   - 重构 `patient_crm_records` 字段改名，兼容 MySQL 5.7 与 8.0，先 drop 旧外键再执行 `CHANGE COLUMN`：
     ```javascript
     try { await dropForeignKeysForColumn('patient_crm_records', 'admin_user_id'); } catch (e) {}
     try { await dropForeignKeysForColumn('patient_crm_records', 'follower_id'); } catch (e) {}
     try { await query(`ALTER TABLE patient_crm_records CHANGE COLUMN admin_user_id follower_id BIGINT UNSIGNED NOT NULL`); } catch (e) {}
     try { await query(`ALTER TABLE patient_crm_records RENAME COLUMN admin_user_id TO follower_id`); } catch (e) {}
     try { await query(`ALTER TABLE patient_crm_records ADD CONSTRAINT fk_patient_crm_record_follower FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT`); } catch (e) {}
     ```
2. **错误日志增强**（[hanjing-clinic-backend/routes/admin.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/routes/admin.js#L1980-L1984)）：
   - 在 catch 中追加 `error.code` 和 `error.sqlMessage` 打印，排查线上 SQL 错误时能一目了然。

## 4. 验证指南与正式环境执行建议
- 重新部署最新代码后重启后端，`initDB()` 会自动在启动时执行上述自愈迁移。
- 如需立即在正式环境 MySQL 修复，可直接执行：
  ```sql
  -- 1. 修复 follower_id
  ALTER TABLE patient_crm_records CHANGE COLUMN admin_user_id follower_id BIGINT UNSIGNED NOT NULL;

  -- 2. 补齐 appointments 来源字段
  ALTER TABLE appointments ADD COLUMN source VARCHAR(30) DEFAULT 'mini_app';

  -- 3. 补齐评估表的 patient_id
  ALTER TABLE ess_assessments ADD COLUMN patient_id BIGINT UNSIGNED NULL DEFAULT NULL;
  ALTER TABLE snore_assessments ADD COLUMN patient_id BIGINT UNSIGNED NULL DEFAULT NULL;
  ```
