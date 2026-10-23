# 管理后台浏览器自动化跨平台兼容性专项测试

- 日期：2026-10-22
- 角色：测试
- 执行环境：macOS (Darwin 24.3.0), Node.js v25.9.0

## 缺陷索引

| 编号 | 模块 | 现象与影响 | 风险等级 | 当前状态 |
|---|---|---|---|---|
| ADMIN-ENV-01 | 管理端自动化测试 | 浏览器测试脚本硬编码 Windows 路径，macOS/Linux 执行 CDP 超时失败 | 高 | 待回归 |

---

## 缺陷详情

### ADMIN-ENV-01：管理端端到端浏览器脚本硬编码 Windows Chrome 路径导致非 Windows 环境验证受阻

- **现象**：
  在 macOS 环境下执行管理端端到端测试脚本：
  - `tests/admin/auth-browser-regression.mjs`
  - `tests/admin/appointment-functional.mjs`
  - `tests/admin/dashboard-functional.mjs`
  脚本均在启动 Chrome 步骤超时并抛出未捕获异常：
  ```text
  Error: Timed out waiting for Chrome DevTools
      at waitFor (...)
  ```
- **预期结果**：
  测试脚本应自适应检测当前操作系统（`process.platform`），动态选用对应平台的 Chrome 可执行文件路径（如 macOS 下 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，或读取环境变量 `CHROME_PATH`），在各类开发与 CI 环境中均能稳定拉起无头浏览器完成 CDP 测试。
- **实际结果**：
  三个脚本均硬编码了：
  ```javascript
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  ```
  在 macOS 上 `spawn(chromePath)` 无法找到对应可执行文件，CDP 端口无法就绪，导致后续所有 UI 渲染与浏览器交互断言全部中断跳出。
- **复现步骤**：
  1. 在 macOS 终端中执行 `node tests/admin/auth-browser-regression.mjs`。
  2. 等待 15 秒后脚本报 `Timed out waiting for Chrome DevTools` 并以退出码 1 异常退出。
  3. 执行 `tests/admin/appointment-functional.mjs` 与 `dashboard-functional.mjs`，复现相同超时中断。
- **影响范围**：
  管理后台中涉及浏览器端多标签页同步、375px 视口表格滚动及 Canvas 图表挂载的端到端自动化验证受阻。
