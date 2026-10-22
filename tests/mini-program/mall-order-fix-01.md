# MALL-01～05 修复记录

- 日期：2026-10-22；状态：实现完成，待独立回归；视觉核验未完成。
- 范围：仅本轮商城及订单已登记问题；未改后端业务、数据库或部署环境，未提交 GitHub。

## 改动点

| 编号 | 文件 | 实现 |
|---|---|---|
| MALL-01 | mp-weixin-rewrite/pages/order/index.js | 订单总件数累加每行 quantity，不再使用商品行数 |
| MALL-02 | mp-weixin-rewrite/pages/order/detail.js | 退款入口状态与后端一致，允许 paid、processing、shipping、shipped |
| MALL-03 | mp-weixin-rewrite/pages/product/index.js、pages/order/index.js、pages/order/detail.js | 加载请求序号校验；旧成功/失败响应不更新页面，卸载使未完成请求失效；详情查询物流完成后再次校验 |
| MALL-04 | mp-weixin-rewrite/pages/order/index.js | 401/403 清空订单及展示列表并重置 hasLoaded；一般网络失败保留缓存 |
| MALL-05 | mp-weixin-rewrite/pages/product/detail.js | 加号在 99 停止并提示；提交前校验数量为 1～99 的整数 |

保留当前工作区此前 POC 修复和其他未提交记录。未新增修复范围外功能。

## 开发自测与限制

- `node tests/mini-program/mall-order.cjs`：25 项通过、0 失败；这是开发自测，不是独立回归。
- 上述 4 个业务页面 JS 的 `node --check` 全部通过。
- 原乱序脚本仅等待一次微任务切换。新增过期请求拦截后，首次运行没有完整输出，不记为通过。将测试时序改为有界等待两个请求实际发出，再控制返回顺序；原 `new` 结果断言保留，后续完整输出 25/25。
- 没有扩大到登录、预约等全面测试，没有新增无关测试用例。
- 未修改 WXML/WXSS；查看了订单底部按钮模板及 flex 布局，复用现有按钮。未控制开发者工具，未进行真实渲染或截图核验；不能确认所有屏宽下新增“申请退款”与“确认收货”并列后的最终效果，该视觉项待验证。
- 本轮未请求真实接口、支付或退款；此前 8 项 HTTP 连接受阻记录保留。数据库并发、真实支付及真机流程仍未验收。

## 状态历史

- 2026-10-22：MALL-01～05 待修复 → 修复中 → 待回归。首轮失败证据保留在原报告及 mall-order-results-01.json。
