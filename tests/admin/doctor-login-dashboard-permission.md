# 医生登录后仪表盘权限提示

状态：待回归

日期：2026-11-04

现象：医生登录成功后进入统计首页，连续提示没有此操作的权限。

原因：登录页固定跳转 /dashboard，路由只校验登录状态，没有根据权限选择落地页。首页加载两次统计接口及一次订单列表，医生角色无 system:view 和 order:view 权限，被后端正常拒绝。

实际验证：本地医生账号登录 HTTP 200；统计接口 HTTP 403；订单列表 HTTP 403；今日预约接口 HTTP 200。未打印或记录令牌、密码、患者数据。未操作浏览器。

代码核对：login/index.vue 固定跳转；dashboard/index.vue 挂载调用 fetchDashboardStats、fetchTrendChartData、fetchDataLists；admin-permissions.js 的 dashboard 对应 system:view。

历史：2026-11-04 只读排查确认，待修复；未修改业务代码。

2026-11-04：按用户确认的新规则完成修改，见 dashboard-menu-scope.md。原无权限接口现已由专门看板查询替代，真实医生登录及看板接口自测通过；待独立回归。
