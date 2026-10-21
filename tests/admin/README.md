# 管理后台测试

- 最新结论：推广绑定 BIND-01～07 在隔离模块范围内回归通过；BIND-RISK-01 保持待验证。[第 2 轮报告](../mini-program/promoter-binding-regression-02.md)：96 项隔离检查中 95 通过、1 项规则探测未通过，另 4 项真实 HTTP 鉴权检查通过。以下先前记录保留为历史，真机/真实数据库并发未验收。

- 源码：`hanjing-clinic-管理后台源码-20260607`。
- 本地参考端口：3000。
- 状态：部分验证；[推广绑定跨入口报告](promoter-binding-additional.md)，管理端路由隔离测试，未进行页面/真实数据库验收。
- 后续按模块创建 Markdown 报告，使用上级目录模板。
