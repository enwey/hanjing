# MALL-10、MALL-11 修复记录

- 后续独立回归：MALL-10 回归不通过（页面重建残留）；MALL-11 模块回归通过。[第 5 轮记录](../2026-10-22-all-defects-regression-05.md)。以下为开发历史，不代表当前均待回归。

- 日期：2026-10-22；角色：开发；状态：实现完成，待回归。
- 仅修复第 3 轮报告中的两项现有问题；保留其他未提交修改，未提交 Git、未发起真实交易。

## 修改内容

### MALL-10

- 文件：mp-weixin-rewrite/pages/product/detail.js，submitOrder。
- 在创建请求发出前记录结果未确认状态；只有收到有效订单 ID 或明确拒绝响应（400/401/403/404/422）才解除此状态。
- 网络错误、超时、服务端错误及响应缺 ID 时，当前结算页禁止再次创建；再次提交提示核对订单并进入订单列表。
- 已取得 ID 的取消支付重试继续复用原订单，不改变已登记 POC-02 的行为。
- 范围：当前页面生命周期内的重试保护；没有新增服务端幂等协议或跨页面/重启持久化去重，不宣称解决跨设备重复下单。结果不明确时不自动判定创建失败，需用户核对订单。

### MALL-11

- 文件：mp-weixin-rewrite/pages/order/detail.js，onPayOrder。
- 引入实际 session-store，以登录代次校验获取支付参数后、微信支付完成后、同步支付状态后是否仍是原会话。
- 退出或新登录后中止后续付款/同步/成功提示；同账号正常刷新令牌不改变登录代次，不误阻断。
- 保留既有卸载检查、付款锁与异常清理。

## 开发自测

| 命令 | 结果 |
|---|---|
| node tests/mini-program/mall-order-round-03.cjs | 7/7 通过 |
| node tests/mini-program/mall-order-round-02.cjs | 13/13 通过 |
| node tests/backend-api/promotion-order-commission-regression.cjs | 6/6 通过 |
| node --check mp-weixin-rewrite/pages/product/detail.js | 通过 |
| node --check mp-weixin-rewrite/pages/order/detail.js | 通过 |

共 26 项相关隔离自测通过；未新增无关测试用例，未执行全面回归。[自测原始结果](mall-order-fix-03-results.json)。

未操作开发者工具；未验收新增提示与跳转的真机效果、真实订单和支付、跨页面重启场景。此前 HTTP 受阻结论保留，本次未重新检查接口。开发自测不代替独立回归。

## 状态历史

| 日期 | 阶段 | 状态 |
|---|---|---|
| 2026-10-22 | 接收 MALL-10、11 修复任务 | 修复中 |
| 2026-10-22 | 完成两处业务修改及相关自测 | 待回归 |
| 2026-10-22 | 后续独立回归 | MALL-10 回归不通过；MALL-11 模块回归通过 |
