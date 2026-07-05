# 鼾静健康诊所项目 - 安装与运行教程

## 一、项目概览

本项目是一个睡眠健康管理平台，包含三个主要部分：

| 模块 | 目录 | 技术栈 | 端口 |
|------|------|--------|------|
| 后端服务 | `hanjing-clinic-backend` | Node.js + Express + MySQL | 5005 |
| 管理后台 | `hanjing-clinic-管理后台源码-20260607` | Vue3 + TypeScript + Vite | 3000 |
| 微信小程序 | `mp-weixin` | UniApp / 微信小程序原生 | - |

---

## 二、环境要求

### 2.1 必需软件

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.x | 建议使用 LTS 版本 |
| npm / yarn | >= 9.x | 包管理器 |
| MySQL | >= 8.0 | 数据库（支持 SQLite 作为开发环境） |
| Git | >= 2.x | 版本控制 |

### 2.2 可选工具

| 工具 | 说明 |
|------|------|
| VS Code | 代码编辑器 |
| HBuilderX | 小程序开发工具 |
| Navicat / DBeaver | 数据库管理工具 |
| 微信开发者工具 | 小程序预览和调试 |

---

## 三、克隆项目

打开终端，执行以下命令：

```bash
# 克隆项目
git clone https://github.com/enwey/hanjing.git

# 进入项目目录
cd hanjing
```

---

## 四、安装后端服务

### 4.1 进入后端目录

```bash
cd hanjing-clinic-backend
```

### 4.2 安装依赖

```bash
npm install
```

> ⚠️ 如果安装失败，可能是网络问题，建议使用淘宝镜像：
> ```bash
> npm install --registry=https://registry.npmmirror.com
> ```

### 4.3 配置数据库

项目支持两种数据库模式：

#### 模式一：MySQL（推荐）

1. 创建数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE hanjing_clinic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 修改配置文件

编辑 `hanjing-clinic-backend/.env`：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password  # 修改为你的 MySQL 密码
DB_NAME=hanjing_clinic
PORT=5005
```

#### 模式二：SQLite（开发环境）

项目默认会自动创建 SQLite 数据库，无需额外配置。

### 4.4 初始化数据库

```bash
# 启动服务会自动初始化数据库表结构和示例数据
node server.js
```

等待看到以下输出，表示初始化成功：

```
[Server] 服务已启动，监听端口 5005
[Database] 数据库连接成功
[Seeder] 数据初始化完成
```

**按 `Ctrl + C` 停止服务**，接下来我们使用更好的方式启动。

### 4.5 启动后端服务

```bash
npm run dev
```

或者直接：

```bash
node server.js
```

验证服务是否正常：

打开浏览器访问 `http://localhost:5005/api/v1/doctors`，应该看到 JSON 格式的医生列表数据。

---

## 五、安装管理后台

### 5.1 进入管理后台目录

```bash
cd ../hanjing-clinic-管理后台源码-20260607
```

### 5.2 安装依赖

```bash
npm install
```

> ⚠️ 如果安装失败，尝试使用淘宝镜像：
> ```bash
> npm install --registry=https://registry.npmmirror.com
> ```

### 5.3 配置 API 地址

编辑 `.env` 文件：

```env
PORT=3000
VITE_API_BASE_URL=
VITE_BACKEND_PROXY_TARGET=http://localhost:5005
```

> ✅ 开发环境下 `VITE_API_BASE_URL` 留空即可，Vite 会自动代理 `/api` 请求到后端服务。

### 5.4 启动管理后台

```bash
npm run dev
```

启动成功后会自动打开浏览器，访问地址：`http://localhost:3000/`

### 5.5 登录管理后台

| 字段 | 默认值 |
|------|--------|
| 用户名 | `admin` |
| 密码 | `admin123` |

---

## 六、运行微信小程序

### 6.1 方式一：使用微信开发者工具（推荐）

1. 打开微信开发者工具

2. 选择「导入项目」

3. 项目目录选择：`/your/path/hanjing/mp-weixin`

4. 填写 AppID（测试可选择「测试号」）

5. 点击「导入」

### 6.2 方式二：使用 UniApp 编译（需要 HBuilderX）

1. 打开 HBuilderX

2. 文件 → 打开目录 → 选择 `hanjing-clinic-wx`（UniApp 源码目录）

3. 运行 → 运行到小程序模拟器 → 微信开发者工具

### 6.3 小程序 API 配置

小程序的 API 地址配置在 `mp-weixin/api/request.js`：

```javascript
const apiUrls = {
  develop: "http://127.0.0.1:5005/api/v1",   // 开发环境
  trial: "https://test-api.hanjing.com/v1",  // 测试环境
  release: "https://api.hanjing.com/v1",     // 正式环境
};
```

> ⚠️ 微信小程序开发工具中需要在「详情 → 本地设置」中勾选「不校验合法域名」。

---

## 七、完整启动流程

### 7.1 开发环境启动（推荐）

**终端1 - 启动后端服务：**

```bash
cd hanjing/hanjing-clinic-backend
npm run dev
```

**终端2 - 启动管理后台：**

```bash
cd hanjing/hanjing-clinic-管理后台源码-20260607
npm run dev
```

**微信开发者工具 - 打开小程序：**

导入 `mp-weixin` 目录

### 7.2 使用脚本一键启动

管理后台提供了一键启动脚本：

```bash
cd hanjing/hanjing-clinic-管理后台源码-20260607
npm run dev:all
```

---

## 八、常见问题排查

### 8.1 后端服务无法启动

**问题：`listen EADDRINUSE: address already in use`**

端口被占用，解决方法：

```bash
# 查看占用进程
lsof -i :5005

# 杀死进程（替换 PID 为实际进程号）
kill -9 PID
```

**问题：`Error: connect ECONNREFUSED 127.0.0.1:3306`**

MySQL 未启动或配置错误：

```bash
# macOS 启动 MySQL
brew services start mysql

# Linux 启动 MySQL
sudo systemctl start mysql

# Windows 启动 MySQL（服务名可能不同）
net start mysql80
```

**问题：数据库连接失败**

检查 `.env` 文件中的数据库配置是否正确。

### 8.2 管理后台无法访问

**问题：`无法连接到服务器，请检查后端服务是否启动`**

确保后端服务已在端口 5005 运行。

### 8.3 小程序无法访问 API

**问题：`request:fail xxx`**

1. 在微信开发者工具中勾选「详情 → 本地设置 → 不校验合法域名」
2. 确保后端服务运行在 `127.0.0.1:5005`（不能用 `localhost`）
3. 检查防火墙是否阻止了端口访问

### 8.4 安装依赖失败

**问题：`npm ERR! network timeout`**

使用淘宝镜像：

```bash
npm install --registry=https://registry.npmmirror.com
```

**问题：`node-sass` 安装失败**

管理后台使用的是 Vite，不依赖 `node-sass`，如果遇到类似问题，尝试：

```bash
npm install --legacy-peer-deps
```

---

## 九、项目结构说明

```
hanjing/
├── hanjing-clinic-backend/        # 后端服务
│   ├── server.js                  # 入口文件
│   ├── db.js                      # 数据库初始化
│   ├── seed.js                    # 数据种子
│   ├── routes/                    # API 路由
│   │   ├── admin.js               # 管理后台 API
│   │   └── client.js              # 小程序 API
│   └── node_modules/              # 后端依赖
│
├── hanjing-clinic-管理后台源码-20260607/  # 管理后台
│   ├── src/
│   │   ├── views/                 # 页面组件
│   │   ├── router/                # 路由配置
│   │   ├── store/                 # 状态管理
│   │   └── utils/                 # 工具函数
│   └── node_modules/              # 前端依赖
│
├── mp-weixin/                     # 微信小程序编译产物
│   ├── pages/                     # 小程序页面
│   └── static/                    # 静态资源
│
└── hanjing-clinic-wx/             # UniApp 源码（如存在）
```

---

## 十、常用命令汇总

| 操作 | 命令 |
|------|------|
| 启动后端 | `cd hanjing-clinic-backend && npm run dev` |
| 启动管理后台 | `cd hanjing-clinic-管理后台源码-20260607 && npm run dev` |
| 构建管理后台 | `cd hanjing-clinic-管理后台源码-20260607 && npm run build` |
| 查看端口占用 | `lsof -i :5005` 或 `lsof -i :3000` |
| 重启后端服务 | `kill -9 $(lsof -t -i :5005) && cd hanjing-clinic-backend && npm run dev` |

---

## 十一、开发注意事项

1. **不要直接修改 `mp-weixin` 目录**，该目录是 UniApp 编译产物。应修改 `hanjing-clinic-wx` 目录的源码后重新编译。

2. **数据库变更**：修改 `db.js` 后需要重新初始化数据库，或手动执行 SQL 变更。

3. **日志文件**：后端服务会产生日志文件，注意定期清理 `alerts.log`、`requests.log` 等文件。

4. **Git 提交**：提交代码前确保 `.gitignore` 已排除 `node_modules`、`dist`、`.env` 等文件。

---

## 十二、技术支持

如遇到问题，请检查：

1. Node.js 版本是否 >= 18.x
2. 端口 5005 和 3000 是否被占用
3. MySQL 服务是否正常运行
4. 网络是否可以访问外部资源

---

**文档版本：** v1.0  
**最后更新：** 2026-07-06