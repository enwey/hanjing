# REG-P0-01 授权更换手机号同步本人档案

- 日期：2026-11-06（Asia/Shanghai）。当前状态：回归通过（接口/隔离库范围；真机未验证）。风险：中。
- 原缺陷及失败证据：[首批P0执行报告](registration-login-p0-batch01-2026-11-06.md)。本轮为修复及开发自测，不代替独立回归，原失败历史保留。
- 原因：显式授权更新了账号手机号；复用已有本人档案时，非空旧号码不触发补填流程，导致账号与本人档案号码不同。

后续已按独立测试任务完成[独立回归](registration-login-phone-regression-2026-11-06.md)，5项检查通过。下方开发自测描述和历史保持原阶段记录。

## 实现范围

- 修改`hanjing-clinic-backend/routes/client.js`的`/api/v1/auth/wx-login`：显式手机号授权完成本人档案选择/复用后，发现号码不一致则同步本人档案号码。
- 更新条件同时限定患者ID、当前账号ID及`relation='self'`；仅更新phone，复用已经加密的授权号码，不再加密。用户/患者ID、姓名、证件及其他资料保持原值，家庭成员不在更新范围。
- 无phoneCode的续期路径仍提前返回，不执行该更新。未改通用认领逻辑、其他换号入口或历史数据迁移，未部署/重启业务后端或操作生产库。
- 在原测试脚本`tests/mini-program/registration-login-p0-batch01.integration.mjs`增加`REG_P0_FIX_SELFTEST=1`定向开发检查模式，只运行REG-006并输出到独立目录，保留原始10条执行证据。

## 实际开发自测

命令（PowerShell）：`$env:REG_P0_FIX_SELFTEST='1'; node tests/mini-program/registration-login-p0-batch01.integration.mjs`。

- 使用真实Express路由、MySQL临时库、实际JWT鉴权及加解密；仅微信上游响应模拟，不发送真实微信请求。
- 运行1条定向场景REG-006，通过；未重跑其他9条或235条用例。

| 验证范围 | 实际结果 |
|---|---|
| 原失败场景：同一微信授权未占用的新号码 | users、本人patients及鉴权profile号码一致；用户/本人ID保持，身份及本人唯一 |
| 加密 | 本人复用账号单层加密值，解密一次得到新授权号码 |
| 既有资料保留 | 对比本人更新前后所有字段，除phone与updated_at外均不变，包括姓名、证件、年龄、性别及ID |
| 家庭成员 | 同账号非本人档案完整行快照不变，即使其号码与原本人号码相同也不被修改 |
| 重复授权 | 再次授权新号码后本人ID稳定，无重复身份或本人 |
| 无phoneCode续期 | 续期成功，users/patients/user_patient_links/user_memberships/user_membership_history五表完整快照不变 |
| 脚本与源码语法、Git空白检查 | `node --check`两文件及`git diff --check`完成，无语法/空白错误；另有其他文件的Git换行提示，不属于本改动 |

- [脱敏开发自测证据](artifacts/registration-login-phone-fix-selftest-2026-11-06/results.json)：executed=1、passed=1、failed=0、cleanup=true；临时数据库已删除，HTTP监听与连接池已关闭。
- 本轮只改上述业务文件中的定向同步代码；工作区其他任务改动保持。测试使用当时工作区源码，不等于纯净提交或生产部署版本验证。
- 未执行微信原生授权、开发者工具或真机测试；未执行独立回归，未验证生产历史不一致号码，不能标为“回归通过”。无页面改动。

## 历史

| 日期 | 阶段 | 状态 | 范围与结果 |
|---|---|---|---|
| 2026-11-06 | 修复开始 | 修复中 | 同步原报告索引、详情和用例状态，保留失败证据 |
| 2026-11-06 | 实现及开发自测完成 | 待回归 | 定向同步实现；REG-006开发自测及关联保留/续期检查通过，独立回归及真机未执行 |

| 2026-11-06 | 后续独立回归 | 回归通过 | 新进程、新隔离库的5项检查全部通过，真机未验证；见独立回归报告 |
