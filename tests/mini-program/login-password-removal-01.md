# 小程序登录页面手机号密码登录功能移除记录

- 日期：2026-10-23
- 端：微信小程序 (`mp-weixin-rewrite`)
- 模块：认证登录 (`pages/auth/login`)
- 状态：待回归（代码与自动化逻辑验证通过，真机视觉及原生授权交互验证受阻）

## 目标

按照需求移除小程序登录页面上的“使用手机号码+密码登录”入口与弹窗功能，使小程序端统一使用微信手机号快捷登录，同时确保不影响其他功能和既有业务逻辑（如微信手机号授权、协议勾选与弹窗、跳转重定向、会话管理等）。

## 变更范围

1. **模板 (`mp-weixin-rewrite/pages/auth/login.wxml`)**：
   - 移除了密码登录触发入口 `<view class="password-entry" bindtap="openPasswordLoginModal">`。
   - 移除了密码登录弹窗容器 `<view wx:if="{{showPasswordLoginModal}}" class="password-modal-mask"...>` 及其包含的输入框与提交按钮。
   - 校验所有标签成对闭合，无外露多余角括号 `>`，保留微信快捷登录按钮（分别对应已同意/未同意协议状态）及隐私政策组件。

2. **样式 (`mp-weixin-rewrite/pages/auth/login.wxss`)**：
   - 清理已废弃的密码登录入口及弹窗相关样式类（`.password-entry`, `.password-modal-mask`, `.password-modal-card`, `.password-login-input` 等）。

3. **逻辑 (`mp-weixin-rewrite/pages/auth/login.js`)**：
   - `COPY` 与 `TOAST` 中清理密码登录相关展示文案。
   - `data` 中移除 `showPasswordLoginModal`、`phone`、`password` 状态字段。
   - 移除已废弃的弹窗控制与输入处理方法：`openPasswordLoginModal`、`closePasswordLoginModal`、`handlePhoneInput`、`handlePasswordInput`、`onPasswordLoginTap`。
   - `completeLogin` 中移除多余的弹窗关闭调用。
   - 完整保留微信授权登录 `onGetPhoneNumber`、`onLoginTap`、协议检查、接口环境切换及路由回跳等业务逻辑。

4. **会话存储层 (`mp-weixin-rewrite/stores/session-store.js` & `api/modules/auth-api.js`)**：
   - 完整保留 `sessionStore.passwordLogin` 与 `authApi.passwordLogin` 方法，确保不影响测试桩、集成验证或底层非页面依赖。

5. **自动化测试 (`tests/mini-program/login-comprehensive.cjs`)**：
   - 针对登录页 UI 结构调整断言（校验密码输入与弹窗已从模板与页面中移除，页面仅保留微信快捷登录）。
   - 保留全量 119 个测试用例，覆盖登录态流转、协议门禁、会话并发、网络故障、令牌过期、退出归档等。

## 独立测试执行记录

本轮测试遵循“只做测试和记录，不编写修复代码或方案”约定，对改动进行了多维度验证：

| 验证维度 | 测试项 | 结果 | 详细说明 |
|---|---|---|---|
| 静态规范检查 | WXML 标签闭合与外露符号 | 通过 | 遍历所有开闭标签严格匹配，未发现裸 `>` 或残留标签字符。 |
| 静态规范检查 | 登录页文件 password 残留检索 | 通过 | `login.wxml`、`login.wxss`、`login.js`、`login.json` 四个文件检索零残留匹配。 |
| 运行时定义 | 页面数据与方法完整性自检 | 通过 | 31 项断言全通：16 个必须方法存在，6 个废除方法不存在，3 个废除字段不存在，必要状态字段完整。 |
| 核心单测套件 | 登录综合套件 (`login-comprehensive.cjs`) | 通过 | 119 项断言全部 PASS（119 通过、0 失败），覆盖协议拦截、快捷授权、失败重试、会话归档等。 |
| 子系统关联回归 | 评估依赖检查 (`assessment-fix-01-check.cjs`) | 通过 | 8/8 通过，验证新增变更未影响评估与会话归档。 |
| 子系统关联回归 | 量表回归 (`ess-regression-01.cjs`) | 通过 | 6/6 通过，量表与答题逻辑不受影响。 |
| 子系统关联回归 | 社区回归 (`community-round-02.cjs`) | 通过 | 5/5 通过，社区模块各页面行为正常。 |
| 子系统关联回归 | 首页回归 (`home-regression.cjs`) | 通过 | 6/6 通过，首页导航及状态重置不受影响。 |
| 服务端就绪性 | 后端服务健康度 (`/health/ready`) | 通过 | HTTP 200，`{"ok":true}` 响应正常。 |
| 接口联调性 | 微信授权登录接口 (`/api/v1/auth/wx-login`) | 通过 | 服务端路由与参数校验响应正常（空参返回 400，符合预期）。 |
| 界面视觉与真机 | 微信开发者工具渲染与真机交互 | 验证受阻 | 命令行环境缺少微信开发者工具自动化连接权限与真机设备，真机原生手机号授权与视觉效果无法自动化判定。 |

## 未验证范围与阻碍原因

- **未验证**：微信客户端真机环境下的原生授权弹窗（`getPhoneNumber` 原生组件触发）、键盘弹起与遮挡情况、物理屏幕多分辨率适配效果。
- **阻碍原因**：受限于当前环境无微信开发者工具 GUI 自动化桥接与真机连接，按规范如实标记为“验证受阻”，不代替人工真机回归。

## 历史

- 2026-10-23：开始实施登录页密码登录功能清理，状态标为“修复中”。
- 2026-10-23：完成 WXML、WXSS、JS 及综合单测适配，全量 119 项测试自测通过，真机视觉验证受阻，状态更新为“待回归”。
- 2026-10-23：下发“测试：测试此次改动”任务，完成 6 大维度 176 项检查与接口连通测试，逻辑层面全部通过；真机与视觉验证受环境阻碍，状态保持为“待回归”。
