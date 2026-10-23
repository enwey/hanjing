# MALL-06～09 开发修复记录

- 日期：2026-10-22；状态：实现完成、待独立回归。
- 保留原业务工作区改动；未提交或推送 GitHub；未更改数据库、后端业务或部署环境。

## 改动点

| 缺陷 | 文件 | 实现 |
|---|---|---|
| MALL-06 | stores/session-store.js、pages/product/detail.js | 暴露已有 loginGeneration 只读方法，支付流程使用登录代次而非每次令牌刷新都会变化的 revision；正常刷新可继续，退出或新登录仍拒绝旧订单操作 |
| MALL-07 | pages/product/detail.js、pages/order/detail.js | 卸载时标记页面失效；创建/查询/支付参数/微信支付/确认支付异步边界检查卸载标志；忽略迟到提示与跳转，不再发起后续支付或刷新 |
| MALL-08 | pages/product/detail.js | 加载请求序号保护成功与失败结果，卸载使请求失效，旧结果不覆盖商品和价格 |
| MALL-09 | pages/order/detail.js | 静默刷新 401/403 清除订单、物流及相关操作显示；一般网络错误保留缓存；鉴权失败后再次 onShow 可重新请求 |

字段路径均相对 `mp-weixin-rewrite`。保持原 getRevision 的认证并发语义不变；新增 getLoginGeneration 只读访问，不改令牌刷新计数逻辑。

已发出的创建请求不能被页面卸载撤销，订单仍可能由后端创建；已启动的微信支付也不声明可被本次代码撤销。本次保证卸载后不继续发起尚未开始的支付交互或页面更新。

## 开发自测

- `node tests/mini-program/mall-order-round-02.cjs`：13/13 通过。保留原 8 项，新增 5 项直接相关边界：新登录阻断、旧商品请求失败、详情 403/500 区分、鉴权失败后再次进入重试。
- `node tests/backend-api/promotion-order-commission.cjs`：22/22 通过。
- `node tests/backend-api/promotion-order-commission-regression.cjs`：6/6 通过。
- 合计 41 项；[完整输出](mall-order-fix-02-results.json)。关联测试桩增加 getLoginGeneration，其模拟账号切换仍递增标识；不弱化原断言。
- 上述 3 个业务脚本 `node --check` 通过；`git diff --check` 通过。
- 未扩展全项目全面测试，也未运行登录/预约全部回归；开发自测不替代独立测试回归。

## 未验证边界

- 没有修改 WXML/WXSS，没有控制开发者工具。仅验证逻辑调用；真实页面视觉、加载提示和微信原生支付交互尚未核验。
- 未请求真实接口、下单、支付、退款或提现；前轮 8 项 HTTP 受阻记录保留，没有标记为通过。
- 真实认证服务自动刷新及微信支付到账仍待验证。

## 历史

- 2026-10-22：MALL-06～09 标记修复中，完成实现及相关自测后标记待回归；原 mall-order-results-02.json 失败证据保留。
