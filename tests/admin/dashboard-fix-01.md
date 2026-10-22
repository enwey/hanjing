# 数据看板 DASH-01～05 修复记录

## 修复思路

- 为窄屏增加响应式单列布局、表格局部横向滚动，并在 640px 以下自动收起侧栏、压缩内容边距。
- 对本地持久化的统计范围和趋势类型做枚举校验，非法值回退并改写为合法默认值。
- 为预约和订单表格增加独立空状态与独立错误状态，避免一个数据源失败清空另一个成功结果。
- 在看板卸载时移除窗口监听并销毁 ECharts 实例。

## 修改位置

- `hanjing-clinic-管理后台源码-20260607/src/views/dashboard/index.vue`
- `hanjing-clinic-管理后台源码-20260607/src/layouts/BasicLayout.vue`
- `tests/admin/dashboard-functional.mjs`

## 代码/配置

- DASH-01：KPI 在 1100px 下改为两列、640px 下改为单列；图表和列表区域在 1100px 下改单列；数据表包裹独立滚动容器。移动视口自动折叠侧栏，并隐藏不适合窄屏的顶部搜索与用户文字。
- DASH-02：新增 `DashboardRange`、`TrendType` 类型及安全读取函数；非法缓存值统一归一化为 `month`、`appointment`。
- DASH-03：两张表在数据为空时分别显示“暂无今日预约”“暂无最新订单”。
- DASH-04：预约与订单改为两个独立异常边界，分别维护 `appointmentListError`、`orderListError`。
- DASH-05：使用稳定的 `handleChartResize` 引用，并在 `onUnmounted` 中移除监听、调用 `chart.dispose()`。

## 改动说明

- 状态：实现完成，DASH-01～05 均转为待回归。
- 类型检查：`npm.cmd run typecheck` 通过。
- 生产构建：`npm.cmd run build` 通过；仅存在原有大分包体积警告。
- 页面开发自测：1440×900 正常加载；375×812 下 KPI/面板宽度由约 28～104px 提升到 272px，文档宽度保持 375px，宽表格在面板内局部滚动。
- 状态自测：三个损坏缓存值刷新后恢复为本月/月/预约趋势，无加载错误，并被改写成 `month`、`month`、`appointment`。
- 接口自测：今日/本周/本月 200，非法范围 400，无凭据 401。
- 数据清理：临时管理员和对应审计已清理，账号残留 0。
- 限定：开发自测不替代测试角色独立回归；局部接口故障注入和长时内存曲线仍需回归阶段验证。

证据：[dashboard-fix-results.json](dashboard-fix-results.json)。
