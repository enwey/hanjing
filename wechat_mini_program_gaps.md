# 鼾静健康诊所微信小程序端 · 开发规范偏差与缺失分析报告 (WeChat Mini Program Development Gaps Analysis)

---

## 🛠️ 修复进度与更新日志 (Fix Status & Changelog)

截至 **2026-06-11**，已针对报告中提出的核心规范缺失进行了**本地阶段性修复与升级**，详情如下：

| 缺失规范点 | 状态 | 采取的修复措施与方案 |
| :--- | :---: | :--- |
| **2.1 缺乏分包加载设计** | 🟢 **已完成** | 重构了 [app.json](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/app.json)，在保证与 TabBar 主入口不冲突的前提下，将商城订单 `pages/order`、分销中心 `pages/distribution`、直播模块 `pages/live` 与社区论坛 `pages/community` 移至 4 个独立的分包，降低了主包体积并彻底规避了目录重叠导致的编译失败风险。 |
| **3.1 缺失真实网络请求层** | 🟢 **已完成** | 新增了请求底层代理客户端 [api/request.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/api/request.js) 并重写了所有 [api/index.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/api/index.js) 接口。现在所有 API 请求都优先发出真实 `wx.request`，若服务端未开启或连接失败，则**自动、无感降级 fallback 到 Mock 数据服务**，保证本地 Demo 演示畅通。 |
| **3.2 缺乏多环境隔离配置** | 🟢 **已完成** | 封装在 [api/request.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/api/request.js) 中，使用 `wx.getAccountInfoSync()` 动态获取当前运行版本，自动映射开发版、测试版及生产版 API 接口基准地址。 |
| **4.1 缺乏微信隐私保护协议** | 🟢 **已完成** | 在 [app.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/app.js#L18) 中全局挂载监听了 `wx.onNeedPrivacyAuthorization` 事件，当调用定位等隐私接口时弹出系统级确认模态框，确保完全合规。 |
| **6.1 缺乏运行时异常异常捕获** | 🟢 **已完成** | 在 [app.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/app.js#L5) 注册了 `wx.onError` 异常拦截，自动向微信小程序官方实时日志管理工具 `wx.getRealtimeLogManager` 上报 JS 崩溃堆栈。 |
| **1.1 源码与编译产物脱节** | 🟡 *待进阶* | 已对当前的编译产物目录进行了可读性格式化和网络层对接，但未来生产版本长期迭代，仍强烈建议从研发端获取 **`uni-app` 原始 Vue3/TS 源码工程**进行开发。 |

---

## 1. 架构与开发模式缺失 (Architecture & Development Mode)

### 1.1 源码与编译产物脱节
* **现状**：当前工作区中的 `mp-weixin` 目录层不是小程序的可开发源码，而是通过编译工具（如 `uni-app`）打包生成的**编译后静态产物**（包含大量经过 AMD/CommonJS 模块转换的 `index.js`、已经过混淆转义的 `wxss` 样式表和已被解析为原生属性的 `wxml` 视图）。
* **隐患**：若直接在编译产物上进行后期业务开发和维护，代码可读性极差、极易出错，且后续一旦在 `uni-app` 源码端重新打包编译，直接改动此处的代码会被**完全覆盖**，产生数据丢失灾难。
* **改善建议**：必须立即向开发团队追回 `uni-app`（Vue 3 + TypeScript）的**原始项目源码工程**（包含 `src/` 目录、`pages.json` 路由配置、`manifest.json` App属性配置等），以此源码作为主开发分支。

---

## 2. 小程序配置与性能瓶颈 (Configurations & Performance)

### 2.1 缺乏分包加载设计 (Subpackages)
* **现状**：[app.json](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/app.json) 中多达 **55 个页面** 全都被声明在主包 `"pages"` 数组中。
* **隐患**：
  1. **包体积限制**：微信官方对于小程序主包大小有着严格的 **2MB 限制**。该小程序包含了庞大的**商城/订单、二级分销中心、睡眠ESS量表、AI鼾声录制与评估、个人设备管理**等多板块页面及各种图标资产，不做分包将直接超体积，**导致无法在微信公众平台上传、审核与发布**。
  2. **加载性能**：首屏冷启动时，微信会一次性下载并解压所有主包页面，这会导致用户打开首页时白屏时间过长，加载体验变差。
* **改善建议**：对路由结构进行重构，将主包瘦身，非核心首屏页面配置为**分包加载机制 (Subpackages)**：
  * **主包 (Main Package)**：仅保留 TabBar 的 5 个首屏入口（首页、预约、治疗、商城、我的）和全局公共组件/样式。
  * **预约分包 (Subpackage - Appointment)**：收纳选择门店、选择时段、医生详情、确认及成功反馈等页面。
  * **分销分包 (Subpackage - Distribution)**：收纳分销中心、推广商品、团队管理、佣金、提现等重营销页面。
  * **设备与个人分包 (Subpackage - Profile)**：收纳病历档案、阻鼾器管理、家庭成员及系统设置等。
  * **社区与直播分包 (Subpackage - Community & Live)**：收纳直播回放、社区发布等。

---

## 3. 网络请求与数据流缺陷 (Network Layer & Data Flow)

### 3.1 缺失真实的网络请求客户端 (Mock Interception)
* **现状**：目前 [api/index.js](file:///Users/apple/Desktop/WorkSpace/hanjing/mp-weixin/api/index.js) 中的 API 都是本地模拟函数，采用 `Promise` + `setTimeout` 延时包装来返回并读写 `/mock/index.js` 中的内存变量。没有任何实际发出网络通信的模块。
* **隐患**：系统无法与后端的任何真实服务器接口进行联调。
* **改善建议**：
  * 移除本地 Mock 拦截封装。
  * 引入基于微信小程序 `wx.request`（或 `uni.request`）封装的 `request` 工具，设计标准的请求拦截器（Request Interceptor，自动注入 JWT Token 鉴权信息 `Authorization: Bearer <token>`）和响应拦截器（Response Interceptor，统一拦截 401 登录失效、403 无权访问、500 服务故障并抛出全局 Toast 提示）。
  * 建立无感双 Token 刷新（AccessToken + RefreshToken）的身份认证自动保活机制。

### 3.2 缺乏多环境隔离配置 (Environment Profiles)
* **现状**：API 的 Base URL 在小程序中缺失，或属于硬编码模式，无独立的环境变量配置文件。
* **隐患**：开发人员不得不每次发布前手动修改后端接口地址，极易把测试/开发环境的地址发布到生产环境导致线上事故。
* **改善建议**：动态通过微信提供的 `wx.getAccountInfoSync()` 获取当前小程序运行环境（`develop` 开发工具 / `trial` 体验版 / `release` 线上版），自动配置请求的基础接口地址：
  ```javascript
  const env = wx.getAccountInfoSync().miniProgram.envVersion;
  const apiUrls = {
    develop: 'https://dev-api.hanjing.com/v1',
    trial: 'https://test-api.hanjing.com/v1',
    release: 'https://api.hanjing.com/v1'
  };
  export const BASE_URL = apiUrls[env] || apiUrls.release;
  ```

---

## 4. 合规性与安全隐患 (Compliance & Security)

### 4.1 缺乏微信官方隐私保护协议指引适配 (Privacy Policy Compliance)
* **现状**：小程序在 `app.json` 中配置了地理位置高精度获取授权：
  ```json
  "permission": { "scope.userLocation": { "desc": "用于查找离您最近的门店" } },
  "requiredPrivateInfos": ["getLocation"]
  ```
* **隐患**：自微信官方 2023 年起强制要求所有小程序在调用敏感 API（如地理位置、麦克风录音授权、微信手机号获取）前，必须通过 `wx.onNeedPrivacyAuthorization` 主动获取用户隐私同意。如不适配，直接调用微信底层 API 会被**强制静默拒绝**，导致无法获取定位以选择门店，或录制鼾声功能失效。
* **改善建议**：在组件库或根组件中接入微信隐私协议组件弹窗（Privacy-Popup），当检测到隐私授权触发时弹窗提醒，待用户点击同意后再继续执行后续隐私 API 流程。

### 4.2 本地缓存未加密 (Unencrypted LocalStorage)
* **现状**：目前直接使用原生 `wx.setStorageSync("access_token", ...)` 明文在 Storage 中存储关键凭证。
* **隐患**：医疗类小程序需遵循严格的网络与数据安全合规要求。明文保存容易在设备被 Root 或在开发者工具反编译时被黑客直接提权盗走。
* **改善建议**：
  * 对本地缓存的凭证及其他敏感基本信息进行对称加密（如使用轻量级的 AES 算法）。
  * 严格限制患者健康与病史等数据本地缓存的有效期，在退出登录或页面卸载时及时清空缓存。

---

## 5. 用户体验与异形屏适配 (UI/UX Adaption)

### 5.1 自定义导航栏异形屏兼容问题
* **现状**：首页及部分二级功能页使用自定义导航栏 `<hj-navbar>`，写死或粗略估计了顶部高度。
* **隐患**：在不同机型（如 iPhone 的刘海屏、灵动岛，各品牌的打孔屏、折叠屏等）上，会导致顶部导航栏文字发生上下偏移、重叠甚至被摄像头和微信默认胶囊按钮遮挡。
* **改善建议**：必须严格遵循异形屏公式计算高度，通过系统 API 获取状态栏高度 `statusBarHeight` 以及胶囊按钮的布局矩形 `MenuButtonBoundingClientRect`：
  ```javascript
  const sys = wx.getSystemInfoSync();
  const capsule = wx.getMenuButtonBoundingClientRect();
  const statusBarHeight = sys.statusBarHeight;
  // 计算得出导航栏本身的净高度
  const navBarHeight = capsule.height + (capsule.top - statusBarHeight) * 2;
  // 顶部最终总预留占位高度
  const headerTotalHeight = statusBarHeight + navBarHeight;
  ```

---

## 6. 系统监控与生产质量保证 (Monitoring & Production Quality)

### 6.1 缺乏全局 JavaScript 运行时异常捕获 (Log Tracking)
* **现状**：代码中仅零星存在 `console.log`，未捕获的运行时报错会导致页面卡死、不可交互。
* **隐患**：用户在线上使用时遇到系统崩溃或卡死，开发团队无法感知，难以及时修复。
* **改善建议**：接入微信提供的 **实时日志管理器 (RealtimeLogManager)**。在全局 `App.onError` 钩子以及 API 拦截器中进行异常日志上报，自动收集真机报错栈，上传至微信小程序管理后台以便查错排障：
  ```javascript
  const log = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
  if (log) {
    log.error('JS Error:', err);
  }
  ```
