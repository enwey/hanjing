# 推广等级无效比例常量清理

- 日期：2026-10-23
- 状态：待回归
- 范围：小程序分销概览等级展示

## 修改

- 删除未参与任何佣金计算的推广等级 `level1Rate`、`level2Rate` 常量。
- 将原等级规则对象收敛为单纯的等级中文名称映射。
- 佣金计算仍只读取商品佣金配置和订单快照，业务口径没有变化。

## 开发自测

- `node --check hanjing-clinic-backend/routes/client.js`：通过。
- `node --test hanjing-clinic-backend/tests/backend-referral-mini.test.js`：1 项通过。
- 全后端源码检索确认旧常量和旧方法名已无残留。
- `git diff --check`：通过，仅有既有行尾转换提示。

开发自测不替代独立回归。

