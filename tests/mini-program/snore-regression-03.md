# 鼾声现有缺陷第三轮独立回归

- 日期：2026-10-22；角色：测试；范围SNORE-04、RESULT-01及本地结构生效阻碍。
- 结论：两项在实际源码、独立真实MySQL及HTTP范围回归通过；本地缺字段/索引阻碍独立核验通过。未新增确认缺陷，非微信真机端到端验收。

## 缺陷、步骤与结果

| 编号 | 原现象 | 风险 | 复现步骤与预期 | 实际 |
|---|---|---|---|---|
| SNORE-04 | 同一离线报告重复入库 | 中 | 顺序重试、12并发同标识提交应同ID且一条；不同内容应409；不同账号隔离；旧timestamp重传去重 | 全部符合，限定范围回归通过 |
| RESULT-01 | 上传前后风险指数不一致 | 中 | 分别提交18、0、29，检查POST响应、SQL、列表和详情一致 | 三组一致，限定范围回归通过 |
| 本地运行阻碍 | 缺三个字段及复合唯一索引 | 中 | 只读核验实际业务库结构和服务就绪状态 | 字段存在；唯一索引顺序为user_id、client_record_key；就绪200；此阻碍回归通过 |

## 本轮执行证据

- snore-functional.cjs 17/17；snore-fix-01-check.cjs 5/5；snore-result-functional.cjs 17/17；snore-result-regression-01.cjs 33/33。72项重新执行通过，四个进程均退出0。
- snore-mysql-regression-02.mjs重新执行：9项结构/接口/SQL检查及1项清理检查通过，退出0。真实Express路由、鉴权、归属查询、MySQL，无SQL替身；使用脚本签发的隔离测试身份，并非微信登录。
- 本轮临时库hanjing_test_snore_1792668480056已删除，information_schema确认残留0。
- 当前业务库SHOW COLUMNS确认risk_score、client_record_key、client_payload_hash存在；SHOW INDEX断言uq_snore_client_record为(user_id,client_record_key)唯一索引通过；原业务报告数量仍为1。
- 当前5005进程PID6519。GET /health/ready为200；无凭据GET /api/v1/assessments、GET /api/v1/assessments/snore-analysis/snore-0、POST /api/v1/assessments/snore均401，符合预期。

## 验证边界

- 没有修改业务代码、执行业务库迁移、重启服务或向业务库写入评估；仅独立临时测试库创建并清理了测试数据。
- 不再沿用“本地缺字段/索引”的旧受阻原因。
- 当前5005有效微信会话的真实保存/读取未执行；无真实微信测试会话，端到端验证仍受阻。未验收真机录音、授权/中断/视觉、实际识别准确性，未确认历史缺失分数恢复。
- 两项“回归通过”限定为上述独立MySQL/API范围；不能解释为真实小程序全流程已通过。

## 历史

| 日期 | 操作 | 状态 |
|---|---|---|
| 2026-10-22 | 运行环境修复后独立回归 | 72项隔离及10项独立数据库检查通过，本地结构与4项HTTP符合预期；迁移阻碍解除，微信端到端仍未验收 |
