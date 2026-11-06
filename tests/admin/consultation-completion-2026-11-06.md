# 结束就诊按钮及完成状态

日期：2026-11-06
状态：待回归（开发阶段接口、类型及浏览器预览检查通过）。

问题：病历按钮悬停引用未定义primary-600；完成接诊写入completed已属终态，但运营端显示为待结算。
范围：按钮沿用全局主题样式；统一诊疗完成状态显示、列表筛选与统计，兼容历史arrived/settled；不伪造收款，不改变既有收费凭证。

实现：移除病历页覆盖全局按钮悬停的无效变量，禁用时保留主题色；completed显示已完成，删除待结算页签，已完成筛选包含completed/arrived/settled，旧页签缓存迁移到completed。预约详情、患者档案及看板同步文案。收费操作仍按实际发生处理，结束诊疗不自动生成或支付订单。

验证：
- consultation-completion.integration.mjs：5项真实业务API专项通过（仅保存不结束；完成保存病历且无额外订单；完成列表和计数；终态禁止重新接诊；实际结算后历史状态仍归入完成且不重复计数）。业务前提经API创建，SQL仅隔离管理员初始化及只读证据/清理；临时库已删除。
- consultation-completion-preview.mjs：实际Vue页面+模拟API，正常、悬停、提交中样式通过；悬停背景rgb(42,82,212)，白色文字，宽高不变；截图已人工核对，调用complete-consultation正确。初次预览工具存在路由依赖重复实例，修正工具后通过。
- vue-tsc --noEmit及git diff --check通过。
- 本地后端已重启，health/ready返回ok，错误日志为空。

证据：artifacts/consultation-completion/api.json、preview.json、emr-hover.png、emr-submitting.png。
未执行生产操作、真实收款或独立回归。历史：修复中 → 实现及开发验证完成 → 待回归。
