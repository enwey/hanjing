# HOME-01～04 修复记录

- 后续独立回归：HOME-01～03 隔离模块通过，HOME-04 本地资源通过；[第 8 轮记录](../2026-10-22-all-defects-regression-08.md)。以下为开发历史，真机未验收。

- 日期：2026-10-22；角色：开发；状态：待回归。没有执行全面回归或新增无关测试。

## 修改内容

| 缺陷 | 改动 |
|---|---|
| HOME-01 | 首页 loadPage 增加请求序号与卸载检查；旧成功、旧失败及卸载后响应不再更新页面。 |
| HOME-02 | 汇总首页统计、推荐医生、门店的失败项，使用已有 loadError 提示区域明确显示；全部失败保留原提示。 |
| HOME-03 | 首页普通业务导航经 navigateOnce 加锁，失败可重试、返回首页 onShow 解锁；包含预约两入口、评估、治疗、已登录档案、医生和门店入口。游客档案登录分流保持原行为。 |
| HOME-04 | 复用项目 UI/static/demo 下原有 doctor-1～4.jpg，放入后端 static/demo；仅允许这四个文件的公共 GET/HEAD 路由，不开放项目目录。 |

- 源码文件：mp-weixin-rewrite/pages/index/index.js；hanjing-clinic-backend/server.js。
- 资源文件：hanjing-clinic-backend/static/demo/doctor-1.jpg～doctor-4.jpg。
- 图片为项目已有演示素材，不是新增真实医生照片；未更改数据库头像记录，不宣称其为真实医生身份照片。
- 首页模板与样式未改动，局部错误复用已有展示区域。未操作微信开发者工具，新增提示的实际视觉及导航栈尚未验收。

## 开发自测

- node tests/mini-program/home.cjs：32/32 通过，原 5 项失败均通过；原断言未修改。
- node --check：首页 JS 与后端 server.js 均通过；git diff --check 通过。
- 已核实并重启本任务启动的本地后端进程，保留数据库与容器配置，服务现运行当前源码。
- 7 项真实 HTTP 开发检查通过：健康和首页统计 200；四张头像均 200、Content-Type=image/jpeg 且 JPEG 文件头正确；/static/demo/server.js 为预期 404。
- [原始结果](home-fix-01-results.json)。自测不代替独立回归；真机、真实登录、预约与支付均未验收。
- 本地开发后端未配置固定 JWT_SECRET 时重启会更换进程密钥，已有本地登录态可能需要重新登录。未新增或修改密钥配置。

## 状态历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 接收四项缺陷 | 修复中 |
| 2026-10-22 | 代码、资源及相关自测完成 | HOME-01～04 待回归；32 项隔离检查和 7 项 HTTP 自测通过，视觉未验收 |
