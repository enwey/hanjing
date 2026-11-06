# 新建预约手机号搜索患者

日期：2026-11-06
状态：待回归。

## 原因与修复

- 患者列表原先仅用明文 LIKE 匹配 patients.phone，小程序建档号码为 det: 加密格式，无法命中。
- 新建预约下拉框对后端结果再次本地过滤，完整手机号与脱敏选项不匹配。
- 后端支持完整加密手机号精确检索，同时兼容既有明文姓名/电话检索及登记账号联系电话。分页与非分页使用相同条件，继续应用数据范围与脱敏规则，不解密全表、不新增明文存储。
- 前端以远程结果为准，查询参数编码，过期请求不得覆盖新查询或清空后的选项。
- 加密号码本次支持完整号码查询，未扩展为加密号码任意片段搜索。

## 开发自测

- `appointment-patient-phone-search.integration.mjs`：8 项真实 HTTP/MySQL 检查通过，业务数据经后台建档和小程序家庭成员 API 创建；验证加密手机号、明文兼容、账号关联就诊人、姓名、空格、分页总数、无结果及个人数据范围，保持手机号脱敏。
- `appointment-patient-phone-search-preview.mjs`：实际 Vue/TDesign 组件、模拟业务接口；完整手机号输入后脱敏选项可见，浏览器检查及截图人工核对通过。
- `vue-tsc --noEmit`、`git diff --check` 通过。
- 隔离测试库已删除，未修改正式数据；独立回归未执行，开发自测不替代回归。
- 本地后端已重启（PID 11800），健康检查通过；前端由 Vite 热更新。

证据：[接口结果](artifacts/appointment-patient-phone-search/api.json)、[页面结果](artifacts/appointment-patient-phone-search/preview.json)、[页面截图](artifacts/appointment-patient-phone-search/search.png)。

## 历史

修复开始标为修复中；实现和限定范围开发自测完成后标为待回归。本次未提交代码。
