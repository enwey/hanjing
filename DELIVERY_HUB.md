# 鼾静健康诊所 - 交付物总清单目录 (DELIVERY HUB)

本目录文档整理了“鼾静健康诊所”微信小程序（C端）与后端服务项目在业务功能优化、安全加固及生产投产全过程的**核心交付物**与**文档索引**。点击对应链接即可跳转查阅各模块详情。

---

## 1. 核心技术交付文档 (Technical Documentation)

* **[部署与技术白皮书 (docs/technical_docs.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/docs/technical_docs.md)**：
  * **部署手册**：涵盖 Node.js 生产配置、MySQL 变量环境及小程序上传要点；
  * **系统架构图**：Mermaid 描绘的客户端、Nginx 限流防盗网、业务鉴权层及数据加密落地层；
  * **核心接口说明**：微信登录游客归集逻辑、上传接口以及挂号事务确认；
  * **第三方对接说明**：微信 JSAPI 统一下单、签名校验及 APIv3 回调解密验签流程。
* **[数据库设计与 API 规范书 (db_and_api_design.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/db_and_api_design.md)**：
  * 包含 40 多个物理表的字段设计、外键参照及索引，以及前端 80 余个 API 接口契约规范。

---

## 2. 生产运维与安全灾备 (Operations & Security)

* **[运维与故障应急排查指南 (docs/ops_docs.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/docs/ops_docs.md)**：
  * **故障排查手册**：PM2 状态诊断、`alerts.log` 跟踪以及数据库死锁排查 SOP；
  * **版本回滚步骤**：Git 一键重置、自动备份 `.sql` 文件恢复回滚操作；
  * **水平扩容方案**：Nginx 负载均衡 Upstream 代理及 Redis 分布式限流策略；
  * **常见 FAQ 疑难问答**：实名锁定异常、超卖处理、重置 super_admin 密码等。
* **[生产部署与容灾恢复指南 (devops_operations_guide.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/devops_operations_guide.md)**：
  * PM2 多核集群部署（Clustering）、Nginx 反向代理配置（带 WebSocket 升级），以及主从热备份数据架构。
* **[数据库自动备份与恢复工具 (backup-restore.js)](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/backup-restore.js)**：
  * 命令行辅助运维脚本，支持安全无明文密码泄漏的数据冷备（`--backup`）与还原（`--restore`）。
* **[网络安全加固部署报告 (security_review_resolved.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/security_review_resolved.md)**：
  * 详细记录敏感数据对称加密（AES-256）、病历附件防盗链防爬取、以及本地 Token 异或混淆的加固实现。
* **[系统稳定性与并发锁优化报告 (stability_review_resolved.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/stability_review_resolved.md)**：
  * 记录上传后缀白名单防目录穿越覆写、以及挂号单确认事务行锁的重构细节。
* **[系统性能与二级索引审计报告 (performance_review_resolved.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/performance_review_resolved.md)**：
  * 数据库加密字段的二级索引加持及大列表拉取溢出（LIMIT）防护。
* **[异常捕获与容错机制审计报告 (exception_handling_review.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/exception_handling_review.md)**：
  * 坏 JSON 解析防报错泄露路径、以及未定义 API 的标准化 404 JSON 回包。
* **[数据可追溯与操作行为审计报告 (data_traceability_review.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/data_traceability_review.md)**：
  * 核心实体 CRUD 的全覆盖管理员审计日志以及患者积分流水账。
* **[系统监控与告警体系白皮书 (monitoring_and_alerts_review.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/monitoring_and_alerts_review.md)**：
  * API 500 级报错、Uncaught 进程异常的钉钉/飞书群实时 Webhook 告警挂载说明。

---

## 3. 使用手册与培训材料 (User Manuals)

* **[使用手册与专科科普知识库 (docs/user_manuals.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/docs/user_manuals.md)**：
  * **管理员操作手册**：出诊排班设定、超卖拦截、CRM 就诊录入及体检单计算；
  * **用户操作教程**：小程序挂号流程、实名积分包领取及卡券兑换；
  * **客服与咨询师培训材料**：下颌前移阻鼾器（MAD）治疗阻塞性打鼾（OSAHS）的病理机制、以及儿童腺样体肥大（Adenoid Hypertrophy）首诊拦截医学宣教指南。

---

## 4. 版本迭代与变更日志 (Release Records)

* **[版本与上线记录 (docs/release_records.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/docs/release_records.md)**：
  * **迭代日志**：安全与业务重构版本的 changelog；
  * **需求变更记录**：废除无意义兜底占位图的需求更替；
  * **上线风险清单**：包括 HTTPS 证书、API 微信域名白名单、私钥泄漏及日志自动切割的上线核对。
* **[业务逻辑优化排查总清单 (business_logic_review.md)](file:///Users/apple/Desktop/WorkSpace/hanjing/business_logic_review.md)**：
  * 详细汇总分销商静默开户、实名认证专享包、就诊上传并发锁等 5 大核心业务修复逻辑。

---

*交付团队：Advanced Agentic Coding (Google DeepMind Antigravity Team)*  
*交付时间：2026 年 7 月 2 日*
