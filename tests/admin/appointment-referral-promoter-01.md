# 预约关联后台推广员与来源展示测试与修复记录

## 1. 任务背景与目标
- **业务需求**：通过后台创建的推广员的小程序编码进行预约时，需要在预约中加入该推广员，并在管理后台“预约管理”（列表与详情）中清晰展示该条预约的来源及推荐人。
- **状态**：实现完成，待回归。

## 2. 根因分析与排查
1. **小程序端推广码捕获不完整**：
   - 原 `mp-weixin-rewrite/common/utils/backend-referral.js` 仅解析 `options.query.scene` 中的 `ref=BP...` 严格格式；
   - 微信小程序在页面 `Page.onLoad(options)` 触发时，参数直接存在于 `options` 顶层（无 `options.query` 包装），原解析器直接跳过，导致从主页或预约页直接启动/打开时无法捕获；
   - 开发者工具调试或自定义扫码参数（如 `scene=BP...`、`code=BP...`、`inviteCode=BP...`、多层 URL 编码、大小写等）无法被匹配；
   - 各业务页面（如 `pages/index/index.js`）未在 `onLoad` 中注入参数捕获。
2. **后端预约归因与匹配容错度不足**：
   - `hanjing-clinic-backend/backend-referrals.js` 中的 `attachAppointmentReferral` 采用严格区分大小写正则；
   - 仅匹配了 `promoter_codes.code`，未联合匹配 `distributors.invite_code`；
   - `routes/client.js` 创建预约时仅取 `req.body.referralCode`，未做多命名兼容。
3. **管理后台展示与搜索受限**：
   - 预约列表 SQL 查询若推广员 `nickname` 为空则无名称展示，未回退账号或推广码；
   - 预约列表搜索栏未匹配推广人姓名或推广码，运营人员无法按推广来源过滤预约；
   - `create.vue` 后台新增预约加载推广员列表时，对 `user_id` 为 `null` 的后台推广员直接调用 `toString()` 导致异常报错。

## 3. 修复方案与实施变更
1. **小程序参数提取器重构** (`mp-weixin-rewrite/common/utils/backend-referral.js`)：
   - 支持递归 URL 解码（防单层/双层编码问题）；
   - 支持从 `options.query` 及 `options` 顶层键（`ref`, `code`, `inviteCode`, `invite_code`, `referralCode`, `referral_code`, `scene`）中精准提取 `BP[a-f0-9]{24}` 编码；
   - 无论扫码启动还是参数进入均存入 7 天有效期的 `backend_referral` 本地缓存。
2. **小程序全局与页面生命周期钩子接入** (`mp-weixin-rewrite/app.js`, `mp-weixin-rewrite/pages/index/index.js`)：
   - 在 `registerTrackedPage` 框架层重写 `onLoad`，实现所有页面启动或参数跳转时自动静默捕获推荐码；
   - `pages/index/index.js` 显式接参并调用 `capture` 形成双重保护；
   - `app.js` 绑定分销时捕获 `INVALID_INVITE` 错误并及时清理待绑定队列，避免重复尝试。
3. **后端预约归属绑定强化** (`hanjing-clinic-backend/backend-referrals.js`, `hanjing-clinic-backend/routes/client.js`)：
   - `attachAppointmentReferral` 支持去除首尾空白、大小写不敏感匹配；
   - 支持 `promoter_codes.code = ? OR distributors.invite_code = ?` 联合查询，有效将 `referral_promoter_id` 与 `referral_code` 写入 `appointments`；
   - `routes/client.js` 同时支持 `referralCode` 与 `referral_code` 参数。
4. **管理后台接口与列表增强** (`hanjing-clinic-backend/routes/admin.js`, `views/appointment/index.vue`, `views/appointment/detail.vue`)：
   - 预约列表与详情接口使用 `COALESCE(NULLIF(d.nickname, ''), NULLIF(pa.login_name, ''), d.invite_code)` 作为 `referral_promoter_name`；
   - 预约列表多维度搜索支持按推广员姓名及推荐码匹配；
   - 预约列表“来源”列增加“推荐人：xxx”标识，未维护姓名时优雅降级为“推广码：xxx”；
   - 预约详情页来源栏增加推荐人及编码标识；
   - 修复 `views/appointment/create.vue` 中后台推广员 `p.user_id` 为 null 引起的脚本异常；
   - 在 `views/distribution/BackendPromoterActions.vue` 小程序码弹窗展示推广编码文字，便于复制与开发调试。

## 4. 自动化验证记录
| 测试套件 | 测试内容 | 预期结果 | 实际结果 |
| :--- | :--- | :--- | :--- |
| `backend-referral-mini.test.js` | 验证多级编码、顶层参数、query参数、大小写、过期机制 | 全部提取有效推广码 | 通过 (1.6ms) |
| `admin-appointment-referral.integration.test.js` | 验证预约关联推广员写入数据库、Admin列表查询、详情查询、按推广人搜索、真实HTTP接口 | 字段均正确返回，搜索命中对应预约 | 通过 (129.5ms) |
| `backend-promoters.integration.test.js` | 后台推广员登录、佣金结算(X/Y)、层级分销、退款逆流等 13 项集成用例 | 全量通过无回归破坏 | 13/13 全部通过 (5.5s) |
| `login-comprehensive.cjs` | 小程序登录与认证综合用例 119 项 | 全量通过 | 119/119 全部通过 |
| Vite 生产构建 (`admin`) | 管理后台静态检查与生产打包 | 打包无报错，产物正常输出 | 通过 (18.2s) |

## 5. 待回归与遗留环境提示
- 真机微信扫码后完整端到端预约链路需在微信真机或微信开发者工具中实际测试；
- 状态：**待回归**。
