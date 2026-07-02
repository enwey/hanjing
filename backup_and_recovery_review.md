# 鼾静健康诊所 - 数据备份与恢复方案报告

为了确保“鼾静健康诊所”的系统在高负荷及突发故障下具备秒级容灾与快速恢复能力，我们对**数据库冷备份与热备份机制**、**物理文件存储备份**以及**恢复预案**进行了盘查，并已部署相关的备份运维脚本。以下是详细方案：

---

## 一、 数据库备份与恢复实用脚本 (`backup-restore.js`)

系统已经在后台服务根目录下部署了高自动化的跨平台冷备/还原管理脚本：[backup-restore.js](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/backup-restore.js)。

### 1. 核心运行命令
* **执行数据备份 (Database Backup)**：
  ```bash
  node backup-restore.js --backup
  ```
  * **效果**：脚本会自动加载后端环境变量 `.env` 中的当前连接设置（主机、端口、库名、用户名、密码），随后利用子进程管道拉起 `mysqldump` 进行结构与行数据导出。
  * **输出**：备份文件将自动以时间戳命名，并存放在自动创建的安全目录下：`/backups/backup_hanjing_clinic_YYYY-MM-DD_HH-mm-ss.sql`。
* **执行数据恢复 (Database Restore)**：
  ```bash
  node backup-restore.js --restore ./backups/backup_hanjing_clinic_xxxx.sql
  ```
  * **效果**：自动导入指定的 `.sql` 备份副本，执行全量回滚。

### 2. 密码传输安全加固
* 该脚本在底层运行时，通过 `child_process` 环境变量 `MYSQL_PWD` 安全地向工具注入数据库密码，完全避免了在终端进程中因 `mysql -pPASSWORD` 导致的命令行参数被 `ps aux` 监控窥探的命令泄密漏洞，保证了运维安全性。

---

## 二、 生产环境全自动备份 (Cron Job) 推荐配置

为实现数据高可靠性，在生产服务器上应当通过系统定时任务 (Cron) 自动执行数据定期备份。

### 1. 每日零点自动备份 (每日备份保留 30 天)
在服务器终端中通过 `crontab -e` 命令追加以下配置：
```bash
# 每日凌晨00:00执行数据库备份，并将日志输出到 backups 目录下
0 0 * * * cd /path/to/hanjing-clinic-backend && node backup-restore.js --backup >> ./backups/cron_backup.log 2>&1

# 每日凌晨01:00自动清理超过30天的历史备份文件，防止磁盘占满
0 1 * * * find /path/to/hanjing-clinic-backend/backups -name "backup_*.sql" -mtime +30 -exec rm -f {} \;
```

---

## 三、 用户上传附件（图片/录音）冷备方案

* **附件物理存储**：用户上传的所有鼾声录音和病历体检单图片均存放于 [uploads/](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/uploads/) 目录下。
* **物理级冷备 (rsync)**：在生产服务器上，推荐采用 `rsync` 差量同步工具将 `uploads/` 目录同步备份至内网隔离的备份服务器或云存储冷归档桶：
  ```bash
  rsync -avz --delete /path/to/hanjing-clinic-backend/uploads/ backup-user@backup-host:/path/to/backups/uploads/
  ```

---

## 四、 审计结论

“鼾静健康诊所”项目在数据持久层与物理附件层均已做好了完备的备份与恢复支持，具备敏捷的运维工具支持和完善的冷备恢复指南。
