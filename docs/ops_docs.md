# 鼾静健康诊所 - 系统运维文档

本运维文档旨在为系统运维团队提供线上服务保活、故障应急排查、灾备回滚、架构扩容以及日常运维常见问题的排查 SOP。

---

## 1. 故障排查手册 (Troubleshooting Guide)

当线上发生故障（如接口报错、挂号卡顿、微信支付不更新状态）时，请遵循以下流程排查：

### 1.1 快速排查步骤 (Triage)
1. **排查服务是否存活**：
   ```bash
   pm2 status
   ```
   如果 `hanjing-clinic-backend` 处于 `errored` 或 `stopped` 状态，请执行 `pm2 restart hanjing-clinic-backend` 重启服务。
2. **排查系统错误日志**：
   进入后台日志目录：
   * **查看致命告警**：`tail -n 100 ./alerts.log`。由于全局 `process` 异常和 500 错误均已接入实时监控，任何未捕获报错均在此日志中有清晰的堆栈追踪（Trace）。
   * **查看日常访问情况**：`tail -f ./requests.log`，观察是否有大面积 4xx 或 5xx 状态码输出。
3. **排查数据库健康状态**：
   确认 MySQL 服务未挂起：
   ```bash
   mysqladmin -u root -p ping
   ```
   登录数据库查看是否有连接泄露：`show processlist;`，观察是否有大面积 `Sleep` 或 `Locked` 连接。

---

## 2. 回滚步骤 (Rollback Steps)

如果新版本上线后发生严重 regression（回退故障），请立即启动回滚流程：

### 2.1 第一步：回滚后端应用代码
1. 使用 Git 强制回退至上一个稳定的 Release Tag 或 Commit ID：
   ```bash
   git reset --hard <LAST_STABLE_COMMIT_ID>
   ```
2. 重新编译/拉取依赖，平滑重启集群：
   ```bash
   pm2 reload ecosystem.config.cjs --env production
   ```

### 2.2 第二步：回滚数据库结构及数据
若新版本包含数据库 Schema 结构改变导致异常，请执行数据还原：
1. **清理受损数据库**（警告：请在备份前确认已完成物理快照）：
   ```bash
   mysql -h 127.0.0.1 -u root -p -e "DROP DATABASE hanjing_clinic; CREATE DATABASE hanjing_clinic;"
   ```
2. **利用自动备份脚本执行回滚还原**：
   ```bash
   node backup-restore.js --restore ./backups/backup_hanjing_clinic_前一个稳定版本时间戳.sql
   ```
3. 验证表结构和历史数据正常后，重启后端。

---

## 3. 扩容方案 (Scaling Plans)

随着诊所入驻门店和日预约量突破数万，单机部署会遇到瓶颈。请采取以下水平扩容（Horizontal Scaling）方案：

### 3.1 Nginx 负载均衡配置 (Load Balancing)
在前端部署多台 Node.js 服务实例，通过 Nginx 进行 upstream 轮询分发：
```nginx
upstream backend_cluster {
    server 192.168.1.10:5005 weight=5; # 应用主机 A
    server 192.168.1.11:5005 weight=5; # 应用主机 B
    keepalive 32;
}

server {
    ...
    location / {
        proxy_pass http://backend_cluster;
        ...
    }
}
```

### 3.2 共享 Session 与 Redis 分布式限流
1. **会话共享**：后端生成的 JWT token 本身是无状态的（Stateless），因此天然支持负载均衡扩容，无需配置 Session 粘滞（Sticky Session）。
2. **限流器替换**：将现有的内存型速率限制器 `rateLimitMemory` 重构为基于 Redis 统一计数存储的分布式限流器，确保多台主机之间的防御阈值对齐。

---

## 4. 常见问题 FAQ

#### Q1: C端用户注册登录时报错：“该手机号已被其他账号绑定”？
* **原因**：当前用户之前曾在微信以外（如线下柜台或电话预约）登记了手机号并建立了建档记录，导致该手机号（已在数据库内确定性加密存储）已经被主患者档案关联。
* **解决**：这是系统安全策略的正常拦截。用户通过微信小程序登录时，系统会自动触发“临时游客账号归集与静默合并事务”，如果用户存在历史离线建档，系统会安全地将其微信 OpenID 绑定到已有的离线档案上，完成数据自动流转合龙。

#### Q2: 如何重置管理端超级管理员 `super_admin` 的密码？
* **方法**：
  1. 通过密码哈希算法生成新密码哈希包：在后台目录中创建一个临时脚本运行 `hashPassword('您的新密码')` 获得 `pbkdf2$salt$iterations$hash` 密文；
  2. 登录 MySQL 数据库执行更新更新：
     ```sql
     UPDATE admin_users SET password = '新生成的哈希密文' WHERE username = 'admin';
     ```

#### Q3: 物理静态附件所在的 `/uploads` 文件夹提示 “403 Forbidden” 无法加载图片？
* **原因**：图片请求未携带正确的 Referer 或 Token。系统开启了临床隐私保护防盗链，禁止浏览器直接输入 URL 下载病历图。
* **排查**：确认访问是从微信小程序客户端渲染发起的（Referer 包含 `https://servicewechat.com/`）。若是后台管理页面加载，确认请求 Referer 为本地 localhost 或域名，或请求包含了有效的管理端 Bearer 认证 Token。
