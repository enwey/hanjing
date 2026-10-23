# 后台独立推广员实现记录

- 状态：实现完成，待独立回归。开发自测不替代独立回归。
- 范围：运营后台、推广后台、mp-weixin-rewrite、后端与增量数据库结构。
- 历史：本任务实现中 → 专项自测 → 实现完成、待回归。

## 已执行的开发自测

- Node 专项：backend-promoters.integration.test.js、backend-referral-mini.test.js、startup-no-seed.integration.test.js，19 个 Node 测试（含父测试）通过。
- 独立 MySQL 临时库初始化两次、X/Y、首次绑定、原上级保留、重复回调、同预约防重复奖励、零佣金绑定、并发成单、二级佣金、全额退款、独立提现、密码重置、创建账号、混合来源列表。
- 真实本地 HTTP：运营商品配置、运营收银、预约推荐人展示；在线支付使用模拟已验真流水触发生产处理函数，检查付款前后状态及重复处理。
- 小程序来源捕获/覆盖/有效期逻辑使用 Node VM，不是微信运行时验收。
- 微信 access_token / 小程序码供应方响应被模拟；测试不向真实微信下单或生成对外推广码。
- 运营/推广前端 npx vite build 通过（存在原有 chunk 体积警告）。
- 后端语法检查及 git diff --check 通过。
- 本地后端重启、健康检查通过，新增表已创建；业务库无测试后台推广员，原有小程序推广员保留。

## 未通过或未验证

- npm run build 的 vue-tsc 阶段受当前 vue-tsc/TypeScript 工具链兼容问题阻断：Search string not found: /supportedTSExtensions = .*(?=;)/。Vite 构建通过不代表 TypeScript 全量类型检查通过。
- 额外执行旧 operations-launch.integration.test.js 未通过：该旧套件签发管理员 token 未带现行必需的 token_version，出现大量 401 并引发级联断言失败。该套件未标为回归通过，也未为本次需求改写这些旧测试。新专项使用现行 token，并单独验证实际收银/付款处理接口。
- 真实微信扫码、授权预约、真实支付/退款、正式微信小程序码获取尚未验收。
- 遵循用户不控制电脑的要求，未操作浏览器或微信开发者工具；UI 模板编译与源码布局检查不能替代真实视觉验收。
- 只支持现有全额退款；部分退款不在本次实现范围。

说明与业务口径：[后台推广员与预约推荐分佣](../docs/backend-promoter-referral.md)。
