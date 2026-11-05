# 公网域名统一

- 状态：修复中。
- 范围：后端公网地址单入口、管理后台生产构建、历史自有资源地址兼容、小程序接口返回资源域名规范化。
- 不修改第三方资源、官网域名、业务记录；不读取或输出密钥，不操作生产数据库。

## 实现完成

- 状态：待回归。后端public-urls.js统一管理/小程序资源地址；生产默认及校验目标为https://m.xingkangming.com，PUBLIC_BASE_URL为主配置，旧API_PUBLIC_BASE_URL兼容并告警，冲突配置阻止启动。开发环境允许按请求/显式本地地址生成。
- 旧m.hanjinghealth.com公网配置兼容映射新域名。JSON响应兼容已知自有域名的上传资源/静态资源/品牌头像URL，包含数据库RowDataPacket类型；不修改外部URL、非资源业务链接、富文本嵌入链接和数据库，保留查询签名。
- 小程序按当前API环境规范化返回的自有资源地址，兼容生产后端尚未更新时返回旧资源域名的情况；不会自动修复新域名缺少文件/代理的问题。
- 管理后台及推广员端生产构建明确使用同源API，开发环境仍保留VITE_API_BASE_URL。原管理后台本地.env.production的旧占位域名已清除；该文件被Git忽略，持久修复在跟踪的request.ts中，不能只靠该本地配置文件。
- 新增PUBLIC-DOMAINS.md部署说明，环境示例与支付回调示例使用新域名；未更改真实支付配置、微信合法域名、生产环境变量、DNS/TLS/代理或生产文件。

## 实际验证

- public-domain + environment-isolation + invite-qr-diagnostics + invite-qr-cache + invite-share-image：20项定向开发自测通过。补充数据库行对象兼容后，public-domain 6项再次通过；正式/本地隔离、旧配置兼容、冲突失败、域名一致性、第三方保留、签名参数及响应不变性已覆盖。
- server/admin/client JS语法及git diff --check通过。
- 管理后台npm run build通过（包含vue-tsc）；已有大chunk提示。
- 推广员端npm run build受阻：现有vue-tsc抛出Search string not found: supportedTSExtensions，未通过类型检查。单独vite build通过，不能代替完整类型检查；未扩展修改依赖。
- 未执行独立回归、生产部署、微信真机下载或真实历史图片可达性检查。仅修改代码/配置模板/记录。
