# ENV-01 本地服务恢复记录

- 后续独立回归：2026-10-22 [第 8 轮](../2026-10-22-all-defects-regression-08.md) 确认 ENV-01 回归通过（本地 HTTP 连接范围）；健康、首页、医生、门店、商品可访问。小程序运行时、真机及实际登录未验收。以下启动阶段状态保留为历史。

- 启动阶段状态：待回归。用户确认 Docker 已启动后，已复用现有 hanjing-mysql 和原后端容器连接配置，启动当前工作区 server.js（宿主机 Node 进程，非旧后端镜像）。未输出凭据、未重建数据库；运行正常启动初始化。
- 启动自检：管理后台 3000/login、推广端 3002/login、5005/health/ready、5005/api/v1/home/stats、doctors、stores、products 均 HTTP 200；健康 ok=true，4 项业务接口 code=0 且包含 data。未进行真实登录、交易或小程序真机回归。
- 原后端容器的 uploads 命名卷未迁移或删除；本次宿主机运行不等同旧容器上传文件完整验收。连接配置仅注入本次启动进程，未生成 .env。
- 以下受阻阶段为历史记录。

- 日期：2026-10-22；角色：开发；状态：验证受阻，尚未修复完成。
- 目标：恢复现有本地数据库与 API，不重置数据库、不切换正式环境。

## 本轮操作与证据

1. 沙箱中 WSL 返回 E_ACCESSDENIED；经沙箱外只读检查，找到已安装的 Docker Desktop 和 docker-desktop WSL 环境。此前沙箱内未找到 Docker 不能据此推断系统未安装 Docker。
2. Docker 客户端路径：C:/Users/7410/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe。
3. 初次查询报 dockerDesktopLinuxEngine 命名管道不存在。已尝试启动现有 Docker Desktop（隐藏窗口），未安装其他运行时或创建新数据库。
4. 启动后引擎管道出现，但 docker ps 查询挂起；Docker 主机日志报：starting services: initializing Inference manager，dockerInference 套接字文件不能被系统访问，listener 路径语法错误。Docker 自身提示 unexpected error and needs to close。
5. 后端 .env 不存在，当前没有已核实的数据库容器/连接参数。未绕过数据库启动，也未伪造数据成功。
6. 停止本轮挂起的 docker ps 查询；未重置 Docker、删除套接字、改全局设置或删除卷/容器。未修改业务代码。

## 当前阻碍

Docker Desktop 尚未正常就绪，不能完成现有容器核实和数据库恢复。需要用户确认继续处理 Docker Desktop 自身故障，或提供已运行数据库的连接位置（敏感凭据放本地配置，不写测试报告）。

仅此环境问题受阻；此前代码缺陷模块回归结论不变。没有执行全面测试，不能标为待回归或回归通过。

## 历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 开始定位现有 Docker/数据库 | 修复中 |
| 2026-10-22 | 启动 Docker 后确认其自身启动错误 | 验证受阻，保留 ENV-01 本地服务不可达状态 |
| 2026-10-22 | Docker 恢复后启动当前源码 | 启动自检 7 项 HTTP 200，ENV-01 待回归；未重置数据库 |
