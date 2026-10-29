# PC头像兜底与网站图标

- 日期：2026-10-29
- 状态：待回归
- 范围：PC患者端头像加载失败和浏览器favicon。

## 排查与实现

- 个人中心、编辑资料、就诊人列表及编辑页使用通用image()；原来error回退仍可能写入完整昵称，存在同类风险。
- image()统一为头像输出data-avatar标识，error回退统一只显示首个Unicode字符；无头像时也正确处理首字。完整名称保留于页面姓名字段和辅助阅读标签。
- 首页医生展示也标记为头像。医生列表/详情及预约详情原有覆盖图片失败移除、露出项目Logo的方式保留。
- 个人头像占位限定原60/80px尺寸和24px字号，单行居中；旧改约医生占位限定原120×140px，不撑高。
- 原index.html未声明favicon，新增PNG与SVG图标链接，直接复用public/brand/logo.svg中的现有项目Logo，无新设计；静态图标随Vite构建进入dist，URL含版本参数。
- 文件：hanjing-patient-web/index.html、public/favicon.png、public/favicon.svg、src/ui.js、src/main.js、src/home.js、src/avatar-fallback.css。

## 开发自测

- 119项既有自动检查与生产构建通过。
- 头像/favicon专项28项通过：开发3003与生产预览3004，四个账户页面的正常/缺失/404头像，共24项；医生详情失败露出Logo两项；favicon链接及PNG响应两项。
- 首页占位既有专项6项通过，覆盖正常、缺失、失败及390px情况。
- 已查看个人中心与编辑就诊人生产预览截图；已查看原项目PNG图标。favicon资源HTTP 200并验证PNG签名，未声称已验证正式服务器浏览器缓存。
- 账号和页面数据为隔离模拟响应，没有修改真实用户资料；未部署正式服务器，独立回归未执行。
- 证据沿用artifacts/treatment-2026-10-28/avatar-*目录及avatar-favicon-results.json，任务日期为2026-10-29。

## 历史

| 日期 | 状态 | 说明 |
|---|---|---|
| 2026-10-29 | 修复中 | 用户要求检查其他头像并更换网站标签页图标 |
| 2026-10-29 | 待回归 | 头像统一兜底、favicon接入完成，开发/生产预览检查通过 |
