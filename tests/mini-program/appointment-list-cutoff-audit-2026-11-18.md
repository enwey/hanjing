# 预约列表改约点击截止补测（2026-11-18）

- 最新状态为回归通过（客户端模块范围）。独立重跑 38 项全部通过，其中三时区点击专项 9 项、预约基础 18 项、既有边界 11 项。截止后原 3 项失败均已通过，实际捕获改约提示且无跳转。真机尚未验证。[本轮专项证据](artifacts/appointment-list-cutoff-regression-2026-11-18/results.json)

- 后续修复从修复中更新为待回归。列表点击改约时使用北京时间解析预约时段，以点击时的当前时间与配置时限比较。截止后提示并拦截，截止前和截止时正常跳转。三时区 9 项专项及 29 项既有模块开发自测全部通过，真机尚未验证。[修复后自测](artifacts/appointment-list-cutoff-fix-2026-11-18/results.json)

新增一个问题，待修复。列表刷新时会按截止时间决定按钮是否显示，但列表的改约点击处理没有重新检查时间。页面在截止前打开并停留时，旧按钮仍可能把用户带进改约页。

用实际列表页面事件处理模拟点击。固定预约为北京时间 09:00，截止为 07:00。上海、UTC、东京三个时区在 06:59 和 07:00 的改约入口均放行，符合预期。07:01 的改约点击在三个时区均发出跳转，未通过。同一时刻取消点击会正确提示已不足两小时。共 9 项，6 项通过、3 项失败。

上述证据覆盖点击处理与路由调用。真机停留和后端实际改约未执行，未修改业务代码。[测试证据](artifacts/appointment-list-cutoff-audit-2026-11-18/results.json)

测试入口为 `node tests/mini-program/appointment-timezone-2026-11-18.cjs`，设置 `APPOINTMENT_LIST_CLICK_AUDIT=1` 和 `APPOINTMENT_TIMEZONE_OUTPUT=artifacts/appointment-list-cutoff-audit-2026-11-18`。本次退出码为 1。
