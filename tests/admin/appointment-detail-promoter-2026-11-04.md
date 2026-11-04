# 预约详情推广员展示

状态：待回归

## 修改
- 预约详情“预约信息”新增独立“推广员”字段，与预约来源并排；替换此前来源下方的推荐人小字。
- 使用详情接口 referral_promoter_name，对应本预约 referral_promoter_id；不使用患者当前分销绑定关系。未关联时显示“未关联推广员”。
- 保留已有扫码归属逻辑：小程序提交 referralCode，服务端 attachAppointmentReferral 校验推广码后保存预约归属；详情接口通过该关联读取推广员名称。
- 修改文件：管理后台 src/views/appointment/detail.vue。服务端无需修改。

## 开发自测
- vue-tsc --noEmit 通过。
- 独立无头 Chrome + 模拟接口：有推广员与无推广员两种详情显示通过，无运行时异常；已查看截图核对双列布局及间距。
- 脚本：_codex-tmp/appointment-promoter-preview.mjs。
- 未执行本轮微信真机扫码创建预约与独立回归。

## 历史
- 2026-11-04：修复中，调整推广员展示位置。
- 2026-11-04：实现及开发自测完成，待回归。
