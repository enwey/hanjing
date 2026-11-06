# 就诊记录场景文案

日期：2026-11-06
状态：待回归。

## 实现

- “预约流程”改为“就诊记录”，移除独立确认预约步骤与结算步骤。
- 创建预约显示预约时间；正常签到显示已到店、等待医生接诊；医生接诊统一使用“姓名医生开始看诊”；结束显示“本次看诊已完成”。
- 直接接诊：到店签到节点灰色，标注“已跳过”，正文“患者已就诊，无需候诊”，不显示签到时间。
- 未进行节点使用对应候诊/接诊文案，不重复显示“待完成”；缺少真实时间时隐藏时间行。
- 为避免从当前状态误判，appointments 增加 checkin_mode、checkin_at、consultation_started_at、consultation_completed_at，由真实状态操作在事务内写入；叫号本身不等于签到。
- 工作台直接接诊不再先伪造一次 confirmed 请求，直接调用接诊接口，由后端记录跳过签到；前台跳过体征录入并签到仍属于正常签到。
- 历史记录不回填签到/接诊时间，不根据缺少体征判断跳过签到；不明历史签到保持灰色，不伪造完成记录。

## 验证

- `appointment-visit-timeline.integration.mjs` 4 项实际 HTTP/MySQL 开发自测通过：正常签到接诊并完成、未签到直接接诊（包含退回候诊再接诊）、先叫号再接诊、叫号后签到再接诊。
- 所有业务前提均由真实 API 创建，仅隔离管理员和数据库初始化使用 SQL；隔离数据库已删除。
- `appointment-visit-timeline-preview.mjs` 使用实际详情 Vue 组件与模拟接口，验证已跳过、场景文案、医生名称和隐藏无记录时间；截图人工核对通过。
- 既有预约完成与收银解绑的 8 项组件逻辑检查通过。
- 后台 `vue-tsc --noEmit` 和 `git diff --check` 通过。
- 本地后端已重启（PID 30096），数据库结构自动更新，健康检查通过。
- 开发自测不替代独立回归，暂未执行独立回归，未提交代码。

证据：[真实接口](artifacts/appointment-visit-timeline/api.json)、[页面检查](artifacts/appointment-visit-timeline/preview.json)、[详情截图](artifacts/appointment-visit-timeline/detail.png)。

## 历史

开始标为修复中，实现和上述自测完成后标为待回归。

## 2026-11-06 流程时间专项复核

状态：待回归（发现误改后修复中，修正及开发自测完成后待回归）。

- 只读查询本地库：仅 1 条 pending 预约，创建时间存在，签到/接诊/完成时间均空，符合尚未执行的状态。未修改该业务数据。
- created_at 记录创建；checkin_at 记录真实签到；consultation_started_at 记录首次接诊；consultation_completed_at 记录诊疗结束；重复操作使用 COALESCE 保留首次时间。
- 跳过签到不写 checkin_at；历史记录不补造时间。确认预约和结算已不是当前就诊流程节点。
- 发现此前替换 SQL 时误将 consultation_completed_at 写入 orders 和 follow_up_tasks 完成接口，已精准移除，预约自身写入保留。
- 复跑 4 项真实预约接口场景，并新增实际创建和完成随访、创建现金订单并提货核销，共 6 项通过。业务数据经 API 创建，测试隔离库清理完成。
- 当前证据：artifacts/appointment-visit-timeline/api.json（6 项）；前轮 4 项属于历史记录。
- 后端已重启 PID 18200，健康检查通过。独立回归未执行，本次未提交代码。
