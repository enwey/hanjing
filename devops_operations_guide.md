# 鼾静健康诊所 - 生产运维部署与容灾恢复白皮书

为了让“鼾静健康诊所”系统顺利完成线上投产，并满足高可用性、高稳定性及零数据丢失的安全要求，我们对**集群部署、网络反代、监控告警、数据容灾**这三大板块进行了标准化设计。以下是完整的生产运维指南。

---

## 目录
1. [生产环境部署方案 (Deployment)](#一-生产环境部署方案-deployment)
2. [实时运维监控与告警体系 (Monitoring & Alerts)](#二-实时运维监控与告警体系-monitoring-alerts)
3. [数据冷备与高可用容灾方案 (Disaster Recovery)](#三-数据冷备与高可用容灾方案-disaster-recovery)

---

## 一、 生产环境部署方案 (Deployment)

### 1. PM2 多核集群部署
系统已在 [/hanjing-clinic-backend/](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/) 目录下预置了 PM2 集群配置文件：[ecosystem.config.cjs](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/ecosystem.config.cjs)。

* **部署命令**：
  ```bash
  # 安装全局PM2守护进程管理器
  npm install pm2 -g

  # 进入后台工程目录以生产模式启动集群
  cd /path/to/hanjing-clinic-backend
  pm2 start ecosystem.config.cjs --env production

  # 配置 PM2 开机自启，使其跟随操作系统一起拉起
  pm2 startup
  pm2 save
  ```
* **高可用优势**：
  * `instances: 'max'` 与 `exec_mode: 'cluster'`：自动检测服务器 CPU 核心数，拉起同等数量的子进程进行多核负载均衡，即使个别进程发生内存溢出，其余进程仍能提供无间断服务。
  * `max_memory_restart: '1G'`：单实例内存超过 1GB 时自动平滑滚动重启，防范内存泄露导致死锁。

### 2. Nginx 反向代理与协议透传 (Nginx Configuration)
生产环境推荐在前端挂载 Nginx 反向代理，配置 SSL/TLS 证书提供 HTTPS 服务，并配置 WebSocket 透传以支持智能客服功能。

```nginx
# 流量限频保护：防止API爆破，限制单个IP每秒最多20次请求
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=20r/s;

server {
    listen 443 ssl http2;
    server_name api.hanjing-clinic.com; # 替换为您的生产API域名

    # SSL 证书配置
    ssl_certificate /etc/nginx/ssl/hanjing.crt;
    ssl_certificate_key /etc/nginx/ssl/hanjing.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 开启 Gzip 传输压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # 后台 API 代理 (限制频次)
    location / {
        limit_req=zone=api_limit burst=30 nodelay;
        proxy_pass http://127.0.0.1:5005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 智能客服 WebSocket 长连接代理
    location /api/v1/im/ws {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        # 透传 Upgrade 协议头以维持 WebSocket 连接
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 600s; # 增加心跳保活超时时间
    }
}
```

---

## 二、 实时运维监控与告警体系 (Monitoring & Alerts)

告警是快速响应线上故障的首要抓手。

### 1. 实时报警器配置 (`alert-notifier.js`)
* **告警文件**：[alert-notifier.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/alert-notifier.js)
* **对接方式**：在生产服务器的 `/hanjing-clinic-backend/.env` 文件中，追加群机器人的 Webhook 地址：
  ```env
  ALERT_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/你的飞书群机器人ID
  ```
* **监控逻辑**：
  * **API 500 级报错**：任何接口返回服务器 500 错时自动捕获报错路径并预警；
  * **进程级致命报错**：顶级 `uncaughtException` 或 `unhandledRejection`（如数据库失联）秒级群通知。
  * **物理审计**：同步写入本地 `alerts.log`。

### 2. PM2 物理日志切割
为了防范日志无限膨胀，生产环境下必须执行日志自动切割归档。
```bash
# 安装 PM2 日志切割插件
pm2 install pm2-logrotate

# 配置每天 0 点切割日志，历史日志最多保留 30 个副本，单文件限制 10MB
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

---

## 三、 数据冷备与高可用容灾方案 (Disaster Recovery)

保证诊所就诊和分销数据“零丢失”的灾备红线。

### 1. 数据库自动热备份方案 (Database Warm Backup)
* **备用脚本**：[backup-restore.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/backup-restore.js)
* **实现逻辑**：
  1. 通过 `crontab -e` 注册定时脚本，每日凌晨 00:00 自动执行 `node backup-restore.js --backup`；
  2. 自动在 `/backups/` 目录下生成带有时间戳的 `.sql` 数据包；
  3. 保留最近 30 天备份文件，自动循环覆盖。
* **灾难级异地灾备推荐 (Cloud Sync)**：
  在 crontab 备份命令后增加云存储同步脚本，将 `/backups/*.sql` 直接同步上传至第三方冷归档存储桶（如腾讯云 COS / 阿里云 OSS / 华为云 OBS），以实现机房物理灾坏时的“异地容灾”。

### 2. 物理附件灾备
* 用户上传的鼾声录音、体检单附件存储在 `uploads/` 目录中。
* 运维应当配置差量同步命令（通过 `rsync`），定期增量镜像同步此目录，防止单盘损坏丢失体检数据。

### 3. 主从热备架构推荐 (High Availability Replica)
* 在生产 MySQL 数据库集群层面，强烈建议配置为 **主从同步（Master-Slave Replication）** 架构。
* 后端读写均连接到主库，从库实时拉取 binlog 实现数据热备。一旦物理主机发生不可逆硬件故障，运维只需将数据库连接指向从库即可在 3 分钟内完成业务恢复（RTO < 3 min，RPO = 0）。
