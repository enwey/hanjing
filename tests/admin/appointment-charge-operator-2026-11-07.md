# 预约收款/退款操作人

- 日期：2026-11-07
- 状态：待回归（开发自测完成）
- 范围：当前独立预约收费、退款、无需退款的操作人持久化及后台展示；不调整历史商城订单流程。

## 实现及字段
所有新字段默认NULL。操作账号从服务端认证结果取值、姓名在服务端查询，不信任请求体同名字段。存姓名快照，不因账号改名改变历史。

| 表 | 新字段 | 说明 |
|---|---|---|
| appointment_charges | collected_by_admin_id | 线下收款管理员ID |
| appointment_charges | collected_by_name | 收款时管理员姓名快照 |
| appointment_charges | collection_source | admin=后台确认收款；patient_wechat=小程序患者微信支付；wechat_native=微信扫码自动确认 |
| appointment_charges | waived_by_admin_id / waived_by_name | 确认无需退款的管理员ID及姓名快照 |
| appointment_charges | waived_at | 无需退款决定时间 |
| appointment_charge_refunds | refunded_by_admin_id / refunded_by_name | 提交退款的管理员ID及姓名快照，不表示微信到账确认人 |
| appointment_charge_refunds | refund_requested_at | 工作人员提交/确认退款时间；实际退款完成仍以 refunded_at 为准 |
| appointment_charge_refunds | waived_by_admin_id / waived_by_name / waived_at | 原待退款记录被确认无需退款时的操作人及时间 |

- 账号ID为BIGINT UNSIGNED，姓名VARCHAR(100)，source VARCHAR(24)，时间DATETIME。
- 自动生成待退款记录不填退款操作人，真正发起退款才填写。微信成功回调、状态同步不覆盖发起人。
- 收款、退款重复请求保留首次操作人；无需退款重复操作也不改原决定人及时间。
- 后台“预约管理 → 详情/列表 → 收费与退款”展示人员及时间；打印收费凭证增加收款人。
- 微信自主支付不冒填后台工作人员；历史缺少数据显示“历史未记录”，未从当前姓名猜填历史快照。
- 新增字段仅在管理端收费查询中返回，患者简化收费摘要未新增人员字段。

## 文件
- 后端 db.js、appointment-charges.js、routes/admin.js。
- 后台 src/components/AppointmentChargeDialog.vue。

## 开发验证
- appointment-charge-operator.integration.mjs：13项通过，实际Express/MySQL隔离环境；现金收款及退款走真实HTTP接口，微信渠道测试拦截、临时RSA签名应答，公网请求禁止。
- 覆盖不同人员收款/退款、请求体伪造操作人被忽略、重复确认不覆盖人员/时间、无需退款人员及时间、自动待退款改免退、微信回调保留退款发起人、账号改名不修改姓名快照，并复用取消/未到诊金额状态与权限检查。
- 安全账号初始化/改名用于测试身份条件；业务数据均经接口或支付业务模块建立。临时数据库已清理，未操作真实资金。
- appointment-charge-operator-preview.mjs：4项通过，真实Vue组件配模拟API，覆盖退款后、无需退款、小程序微信支付、历史未知人员；已查看人员布局截图。
- vue-tsc --noEmit及git diff --check通过（仅换行符警告）。
- 证据：artifacts/appointment-charge-operator/api.json、preview.json及4张截图。

## 本地生效
- 后端已重启，PID 20744，/health/ready 返回ok=true，启动错误日志为空。
- 只读检查确认现有本地库已补齐两张表共12个字段。
- 未提交GitHub；未执行独立回归、真实微信或小程序真机验收。

## 历史
1. 修复中：补充操作人快照与后台显示。
2. 待回归：13项隔离接口/支付边界、4项组件预览及类型检查通过；本地数据库字段升级及服务重启完成。
