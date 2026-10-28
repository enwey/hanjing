# 小程序本地模拟登录

- 日期：2026-10-28
- 状态：待回归
- 范围：mp-weixin-rewrite 登录页、API/会话存储；后端独立本地登录入口与本地令牌鉴权。

## 实现

- 仅develop版本、微信开发者工具、明确切换local时出现“本地模拟登录”。无需wx.login或手机号授权，不更改正式微信登录。
- 后端需development、ENABLE_LOCAL_DEV_LOGIN=true、本地数据库、直接回环连接；转发请求/正式环境禁用。当前本地.env已启用开关，.env.example默认false。
- 使用固定独立测试用户及本人档案，不按手机号查找、接管或合并现有用户，不伪造手机验证。返回8小时带local-dev标识JWT，受保护用户接口在非本地条件拒绝该令牌；常规令牌验证分支保留。
- 前端沿用正常登录后资料加载、待绑定邀请码、本人档案、权限和业务API。切换环境退出登录，local:账号缓存独立；取消/退出阻止迟到响应恢复会话；本地会话不走微信刷新。
- 保留协议勾选、重复提交锁、失败提示、卸载取消和原登录后跳转。

## 实际执行的开发自测

- node tests/mini-program/local-login.test.cjs：后端环境/数据库/回环/代理限制，前端环境限制，取消、令牌、缓存隔离、跨环境失效通过。（此前本地遗留脚本，本轮实际重跑。）
- node tests/mini-program/local-mock-login.test.cjs：页面协议、平台/环境限制、重复提交锁、本地标记令牌鉴权门禁通过。
- node tests/mini-program/login-comprehensive.cjs：119项通过。
- node mp-weixin-rewrite/test-environment-isolation.js：4项通过。
- WXML闭合、按钮分支、JS语法与git diff --check通过。
- 当前真实HTTP：本地登录code=0；携令牌读取user/profile、user/family-members、appointments、orders、assessments、distribution/info均code=0；再次登录用户ID一致；伪造转发头登录404。仅使用独立本地测试账户，没有发送微信消息、发起支付或改写现有微信账户。
- 当前后端已重启启用入口；Docker MySQL继续使用既有配置。

## 验证边界

- 登录按钮复用原auth-btn样式；微信开发者工具原生视觉和真机未执行。
- 上述接口读取和隔离检查不等同完整预约/商城/支付/分享端到端回归；需要微信真实授权的能力仍按原要求执行，未加入假成功。
- 开发自测不代替独立回归，状态待回归。

## 历史

- 2026-10-28 开始实现：修复中。
- 2026-10-28 实现和定向开发自测完成：待回归。
