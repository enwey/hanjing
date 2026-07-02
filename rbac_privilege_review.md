# 鼾静健康诊所 - RBAC 权限访问控制体系审计报告

对于“鼾静健康诊所”后台服务系统在**角色划分**、**功能权限验证**以及**多门店/多医生横向与纵向数据隔离（Data Isolation）**等安全维度的 RBAC 权限设计，我们进行了全面审计。以下是详细的权限体系架构情况：

---

## 一、 系统角色划分与定义 (Roles)

系统已经在数据库底层 [roles 表](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/db.js) 与后端鉴权层定义了 3 大典型业务角色：
1. **超级管理员 (`super_admin`)**：具有系统全局的最高读写权限。负责诊所整体入驻、多门店开设、医生入档排班、分销提现放款、商品价格及卡券配置、以及管理员权限分配。
2. **店长/门店管理员 (`store_mgr`)**：绑定特定的 `store_id`。权限仅局限于自己所管理的这家线下实体门店，无法越权查看或管理其他门店的数据。
3. **主治医生 (`doctor`)**：绑定特定的 `doctor_id` 和关联门店。其核心职责仅在于就诊诊断，权限仅局限于分配给自己名下的预约就诊和病历记录。

---

## 二、 纵向越权防御：核心功能强制拦截 (Vertical Privilege Isolation)

系统通过 JWT 令牌解析出 `req.user.role`，在各个涉及诊所核心配置的接口上强制实施了纵向拦截器，拒绝低级角色非法调用接口：
* **敏感系统配置与医生入档**：添加医生（`create_doctor`）、编辑医生档案、创建或禁用线下门店（`disable_store`）等核心基础路由，均强制声明拦截：
  ```javascript
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有超级管理员有权执行此操作' });
  }
  ```
* **商品与活动卡券**：商品上架及卡券增删改操作，同样限制只有 `super_admin` 可以操作，店长与医生仅具有只读查看权。

---

## 三、 横向越权防御：门店与医生行级数据隔离 (Horizontal Privilege Isolation)

这是医疗诊所系统最关键的隐私与商业机密防线。即使属于同级别角色（如不同门店的两位店长，或同门店的两位医生），也必须进行横向隔离，杜绝数据越权：

### 1. 门店横向隔离 (`store_mgr` 视角)
* **挂号与就诊过滤**：店长在拉取预约（`GET /api/admin/appointments`）或查看订单明细时，SQL 语句会自动绑定当前用户的 `store_id`：
  ```javascript
  if (req.user.role !== 'super_admin' && req.user.store_id) {
    listWhere += ` AND a.store_id = ?`;
    listParams.push(req.user.store_id);
  }
  ```
* **非授权查看阻断**：店长如果通过直接拼装 URL 传入其他门店的就诊 ID 试图更新，接口会进行行级属权校验，如果 `Number(req.user.store_id) !== Number(target_store_id)`，直接返回 `403 Forbidden`。

### 2. 医生横向隔离 (`doctor` 视角)
* **名下就诊数据独占**：医生在拉取预约挂号看板时，系统会硬性绑定其名下的 `doctor_id`：
  ```javascript
  if (req.user.role === 'doctor' && req.user.doctor_id) {
    listWhere += ` AND a.doctor_id = ?`;
    listParams.push(req.user.doctor_id);
  }
  ```
* **跨医生病历编辑阻断**：当医生尝试对某个挂号就诊单写入临床前检（`pre-exam`）或保存诊断结论（`save_consultation`）时，系统会在事务内锁行，核对该挂号单的 `doctor_id` 是否为操作人本人，彻底杜绝了医生越权修改他人病人病历的医疗事故隐患。

---

## 四、 审计结论

“鼾静健康诊所”的 RBAC 访问控制在架构设计上做到了“角色划分明确、纵向功能严格拦截、横向多门店与多医生数据行级隔离”。权限校验在 Express Controller 鉴权层与 SQL 数据检索层进行了双重绑定，未发现越权绕过漏洞，符合医疗数据系统权限标准。
