# 管理端端到端浏览器脚本跨平台兼容性修复记录

- 日期：2026-10-22
- 角色：开发
- 关联缺陷：`ADMIN-ENV-01`
- 状态：实现完成、待回归

## 修复改动清单

1. `tests/admin/auth-browser-regression.mjs`
2. `tests/admin/appointment-functional.mjs`
3. `tests/admin/dashboard-functional.mjs`

## 改动说明

- 移除了硬编码的 Windows Chrome 绝对路径（`C:\Program Files\Google\Chrome\Application\chrome.exe`）。
- 增加了跨平台 `resolveChromePath()` 解析器，优先读取环境变量 `CHROME_PATH`，其次自动依次检索常见系统的默认 Chrome 安装路径（macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`、Windows 32/64位路径、Linux `/usr/bin/google-chrome` 等）。
- 开发自测：在 macOS 环境下分别自测执行三个端到端脚本，均能成功启动无头浏览器完成 CDP 交互断言，退出码均为 0。
