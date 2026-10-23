# AI鼾声现有缺陷第二轮回归

- 后续开发处理：[运行环境修复](snore-runtime-fix-02.md)已完成本地迁移与后端重启，SNORE-04、RESULT-01恢复待回归。下方受阻结论保留为本轮测试历史，开发健康检查不替代独立回归。

- 日期：2026-10-22；角色：测试；代码基线 a79d53b。
- 范围：SNORE-04、RESULT-01及相关隔离用例。无业务代码修改，无业务库写入，无服务重启。
- 结论：两项在独立真实MySQL + HTTP范围回归通过；当前本地服务端到端仍验证受阻。

## 原缺陷验证

| 缺陷 | 风险 | 复现步骤 | 预期 | 实际与状态 |
|---|---|---|---|---|
| SNORE-04 重复上传产生重复记录 | 中 | 同localId顺序提交两次、新localId同时提交12次；同标识修改指标/分数；不同账号使用同标识；旧timestamp重试 | 同账号同内容仅一条且同ID；冲突409；账号隔离 | 全部符合，真实MySQL/HTTP限定范围回归通过 |
| RESULT-01 同步前后风险分数不一致 | 中 | 提交18、0、29分，读取SQL字段、列表、详情并核对提交响应 | 各环节保持原分数 | 三组均一致，真实MySQL/HTTP限定范围回归通过 |

## 执行证据

- 本轮重新执行：snore-functional.cjs 17/17、snore-fix-01-check.cjs 5/5、snore-result-functional.cjs 17/17、snore-result-regression-01.cjs 33/33，共72项隔离通过。
- `node tests/mini-program/snore-mysql-regression-02.mjs`：9项结构/HTTP/SQL检查和1项清理检查全部通过，退出0。
- 使用实际db.initDB、Express路由、JWT鉴权、就诊人归属查询和MySQL。测试身份由脚本签发，不代表经过微信登录。
- 临时库 `hanjing_test_snore_1792668086710` 已删除，information_schema确认残留0，其测试账号、患者及报告一并删除；业务库未写入。

## 当前本地环境阻碍

- 对当前后端.env指向数据库只读执行SHOW COLUMNS / SHOW INDEX：snore_assessments缺少risk_score、client_record_key、client_payload_hash；除主键外仅见user_id和fk_snore_patient非唯一索引，没有本次去重唯一索引。
- 5005监听PID2187，启动于2026-10-21 22:28:09，工作目录为当前项目后端；GET /health/ready返回200、ok:true。这只证明数据库连接，不证明结构已生效。
- 本地环境与历史Windows报告中的PID21172不同，不能沿用其运行环境结论。
- 本轮未在业务库执行登录后写入，未断言当前接口必然500或实际已重复落库；结构不满足修复要求是已确认环境阻碍。
- 两项本地端到端保持“验证受阻”，保留此前待回归及隔离通过历史；不是代码回归失败，也不是完整通过。
- 未验收既有数据升级迁移、真实微信登录、真机录音/权限/中断/视觉及识别准确性。

## 历史

| 日期 | 操作 | 结论 |
|---|---|---|
| 2026-10-22 | 第二轮回归 | 72项隔离通过；独立真实MySQL/HTTP共10项通过；本地业务库缺字段/索引，端到端仍受阻 |
