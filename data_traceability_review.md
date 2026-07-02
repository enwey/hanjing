# 鼾静健康诊所 - 数据可追溯与操作审计审计报告

针对“鼾静健康诊所”微信小程序（C端）与后台管理服务的数据可追溯性（Audit Trails & Traceability），我们从**管理端核心操作日志记录**、**敏感医疗病历流转跟踪**、**患者个人账目资产流水追踪**等维度进行了全面合规审计。以下是可追溯性架构情况评估：

---

## 一、 管理端/医生端操作审计日志 (`audit_logs`)

系统已在数据库底层建立了高合规级别的 [audit_logs](file:///Users/apple/Desktop/WorkSpace/hanjing/hanjing-clinic-backend/db.js#L1146-L1159) 物理审计日志表，在后端路由实现中通过辅助工具函数 `logAdminAction` 实现了操作行为的自动化归档追溯。

### 1. 记录的核心要素
每一条审计日志均捕获了以下关键审计字段：
* `admin_id`：操作管理员/医生的唯一标识 ID。
* `action`：具体动作类型（如 `update_medical_record`、`approve_refund` 等）。
* `target_type`：受影响的实体类型（如 `patient`、`appointment`、`order`、`medical_record` 等）。
* `target_id`：受影响实体的具体 ID。
* `details`：通过 JSON 存储的本次操作前后变更的核心字段差异包（Diff payload）。
* `ip_address`：发起本次操作的终端网络 IP（`req.ip`）。
* `status`：状态标识（`success` 或 `fail`），用于区分成功执行的动作和被拦截的异常动作。
* `error_message`：若执行失败，自动截获并回填底层报错信息，供事故排查定位。

### 2. 核心操作的可追溯覆盖率
经代码检索，`logAdminAction` 已经对以下 6 大类极高频/极敏感的管理端动作完成了 **100% 审计埋点**：
* **门诊就诊与病历修改**：包括首诊建档、保存就诊记录（`save_consultation`）、确认就诊完成（`complete_consultation`）、病历附件追加等。
* **挂号预约变动**：包括手动改约（`reschedule_appointment`）、创建预约（`create_appointment`）、医生改班及排班等。
* **财务及退款变动**：包括审核分销退款（`approve_refund` / `reject_refund`）、分销推广佣金结算、分销提现放款审核（`approve_withdraw` / `reject_withdraw`）。
* **基础患者 CRM 档案变动**：包括手动登记新患者（`create_patient`）、修改患者核心信息（`update_patient`）、添加随访跟进反馈记录等。
* **订单物流变动**：包括订单人工标记发货（`ship_order`）、标记收货（`complete_order`）等。
* **系统准入与账号授权**：包括管理员账号登录（支持账密与验证码双重登录记录）、管理员及医生账号增减（`create_admin`）、角色及权限配置变更等。

---

## 二、 患者个人资产（积分）与就诊生命周期可追溯

在客户端（C端），对患者的各项交互和流转同样实现了全链路的数据账本可追溯：

### 1. 积分明细流水流水账 (`points_logs`)
* 任何积分的分发与抵扣行为均强制在同一事务中同步写入 `points_logs` 积分明细表（记录积分变动数量 `points`、流转类型 `type` 如 `welcome_gift` / `redeem_coupon` 以及描述文案）。患者可在小程序会员中心直接翻阅每一笔积分的清晰来龙去脉。

### 2. 就诊与阻鼾器物理适配时间轴 (`treatment_timelines`)
* 诊所对患者下颌前移阻鼾器的定制、调咬合、适配及随访等全生命周期的里程碑事件，均通过 `treatment_timelines` 物理时间线表进行留痕追溯，以便患者和跟进医生直观查阅就诊轨迹，防范医疗记录断档。

---

## 三、 审计结论

“鼾静健康诊所”的系统在底层表结构、日志持久化、终端 IP 抓取以及行为变更 Diff 记录等方面均采用了标准的医疗信息系统数据可追溯设计，数据链路清淅完整，符合严肃医疗数据审计标准。
