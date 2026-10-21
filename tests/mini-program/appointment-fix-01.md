# 预约缺陷开发修复记录

- 日期：2026-10-21；范围：APT-01～07；当前状态：待回归。
- 本轮业务改动仅涉及预约页面的 4 个 JS 文件；保留既有工作区变更。不修改 WXML/WXSS，不操作开发者工具，不创建真实预约或支付。

## 思路与改动点

| 缺陷 | 文件 | 改动 |
|---|---|---|
| APT-01 | pages/appointment/booking/index.js | 使用实际导出的 payAppointmentDeposit，并解包响应后传入微信支付参数 |
| APT-02 | pages/appointment/time-select.js | 日期、页面请求序号隔离；过期成功/失败响应不再覆盖当前选择 |
| APT-03 | pages/appointment/confirm.js | 同一登录令牌下按患者 ID 保留当前选择；新增患者优先选择逻辑保留，患者不存在时使用默认选择；加载响应也校验请求序号与令牌 |
| APT-04 | pages/appointment/confirm.js | 记录已创建预约 ID，清除持久草稿及页面草稿；后续提交不再创建第二笔，创建后保持提交锁直至离页；创建失败则解除锁供重试；支付弹窗失败引导至预约记录 |
| APT-05 | pages/appointment/confirm.js | 优先展示服务端返回的错误消息，无消息时才使用通用提示 |
| APT-06 | pages/appointment/booking/index.js | 列表加载核对请求序号与登录令牌，退出/换令牌时清空旧列表，拒绝旧响应回填 |
| APT-07 | pages/appointment/reschedule.js | 页面、日期排班和时段分别使用请求序号；日期切换使旧时段请求失效，过期成功/失败响应不更新页面 |

## 开发验证

- `node tests/mini-program/appointment.cjs`：18/18 通过。
- 在原专项检查基础上，强化支付参数解包断言，增加创建失败可重试、创建成功清除草稿两项直接相关检查；未开展全项目测试。
- 对 4 个业务 JS 执行 `node --check`，全部通过；`git diff --check` 通过。
- [本轮结果](appointment-fix-results-01.json)；首次失败结果 appointment-results-01.json 保留。
- wx、API、导航和支付回调为模拟依赖；不代表微信真实支付、视觉交互、真实账号预约或 MySQL 并发通过。未进行真机/页面视觉验收，没有更改页面布局，也没有启动或重启服务。
- 开发自测不代替独立回归，7 项均保持待回归。

## 状态历史

- 2026-10-21：APT-01～07 待修复 → 修复中 → 待回归。
