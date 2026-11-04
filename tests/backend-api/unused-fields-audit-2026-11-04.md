# 本地数据库字段用途只读检查

- 日期：2026-11-04。
- 状态：静态检查完成；候选字段为“待验证”，不构成可直接删除的结论。
- 代码基线：8b701f8；数据库：本机 hanjing_clinic，81 张表、770 个字段。
- 用户要求：列出可能多余字段、解释原因，不改代码。仅新增本报告和索引；未修改业务代码、表结构、数据或执行同步。

## 方法与覆盖边界

读取 information_schema 的所有字段及键依赖；从 server.js 的本地模块导入关系追踪到51个文件，分离建表定义与业务消费者，逐字段检索引用，再按表、路由及返回映射检查候选项。交叉搜索管理后台、患者PC、推广端、重写版与旧版小程序的字段名/驼峰名；候选项进一步检查数据库默认值、整行读取及本地非空数量。检索覆盖不等于逐项动态业务验收；同名字段、动态SQL、通用返回、外部脚本不能凭字符串计数确定用途。

没有启动初始化、参考库生成或同步程序。只执行元数据及聚合 SELECT，不导出业务内容。该库视图、触发器、存储例程和事件数量均为0。本轮未连接生产库，未覆盖仓库外的数据导入、报表、第三方调用。

## 第一组：7个当前业务流程未见实际使用的候选字段

| 字段 | 原本含义及当前情况 | 判断和限制 |
|---|---|---|
| community_posts.image_urls | 帖子图片列表。后台新增/编辑及患者发帖不写入此列；当前展示读取 content、cover_url。 | 较明确的遗留候选。管理后台文章详情仍以 p.* 返回，删除会减少返回属性，不能视为完全无接口影响。 |
| device_feedback.feedback_type | 反馈类型。提交只写 rating、feedback_desc 等字段，列表不返回此列。 | 当前无业务读写消费者；可能是尚未接入的分类功能。 |
| device_feedback.contact_phone | 反馈联系电话。提交未接收或保存，列表映射也未使用。 | 当前无业务读写消费者；其他表同名 contact_phone 的使用不代表此列被使用。 |
| device_feedback.processed_at | 反馈处理时间。没有查到当前处理时间写入入口，也没有列表展示。 | 当前未接入；如果未来补反馈处理流程可能需要。 |
| device_maintenance.service_store | 维护门店。维护列表仅映射日期、类型、描述、费用等，不使用此列；未发现当前维护新增接口。 | 当前未消费，但定义为 NOT NULL；可能来自历史导入/原计划维护登记功能，需核对外部录入。 |
| device_maintenance.service_operator | 维护操作人。当前维护列表未返回，未发现业务写入入口。 | 当前未消费；与 service_store 同属未接入的维护信息。 |
| device_maintenance.status | 维护状态，默认 completed。列表既不返回也不按此列筛选；未发现状态流转入口。 | 当前由默认值占位；后续若有维护工单流程仍有潜在含义。 |

依据：

- [反馈读写及维护列表](../../hanjing-clinic-backend/routes/client.js)：维护列表7662行附近，反馈列表7704行附近，反馈提交7747行附近。
- [文章详情及新增](../../hanjing-clinic-backend/routes/admin.js)：6255行 p.* 返回；6301行 INSERT 未写 image_urls；6394行 UPDATE 未写该列。
- [患者社区展示与发布](../../hanjing-clinic-backend/routes/client.js)：2702行附近列表映射、2940行附近发帖。
- [维护/反馈建表定义](../../hanjing-clinic-backend/db.js)：2213及2261行附近。

## 第二组：3个需要保留判断余地的履约字段

| 字段 | 观察 | 为什么不能直接认定无用 |
|---|---|---|
| fulfillment_fittings.fitted_at | 插入试戴记录时未显式赋值，数据库自动记录当前时间；未查到当前业务显式读取。 | 与 created_at 在当前写入路径中通常重复，但代表试戴时间，仍有审计语义；不是未写入字段。 |
| fulfillment_fittings.result | 默认 completed；当前首次佩戴接口写履约状态 fitted 并记 fitting_completed 事件，未设置或读取 result。 | 可能是重复状态，也可能预留失败/重试结果。表本身绝不能据此认定无用：退款判断会查询试戴记录是否存在。 |
| fulfillment_molds.taken_at | 自动记录当前时间；实际取模日期来自 fulfillment_mold_profiles.details.taken_date。当前页面未查到 taken_at 消费。 | 口模接口 SELECT * 并原样返回 mold，taken_at 确实被间接读取/返回；自动记录时间与用户填写日期也不完全等价。 |

依据：[首次佩戴写入](../../hanjing-clinic-backend/routes/admin.js) 4768–4783行附近；[退款使用试戴记录](../../hanjing-clinic-backend/refunds.js) 63行附近；[口模日期校验与整行返回](../../hanjing-clinic-backend/delivery-workflow.js) 35–48、93–96行附近；[默认值定义](../../hanjing-clinic-backend/db.js) 1905、1948行附近。

## 本地数据核对

| 表 | 行数 | 候选字段数据情况 |
|---|---:|---|
| community_posts | 1 | image_urls 非NULL数量0 |
| device_feedback | 0 | 空表，无法以现有数据判断历史使用 |
| device_maintenance | 0 | 空表，无法以现有数据判断历史使用 |
| fulfillment_fittings | 0 | 空表，无法验证 fitted_at 与 created_at 历史上是否相同 |
| fulfillment_molds | 0 | 空表，无法验证两种取模日期是否相同 |

这不是生产数据统计。“当前本地为空”不能作为删除生产字段的依据。

## 已排除的误判

- admin_users.all_stores、doctor_id、token_version 有权限、医生关联、登录令牌校验用途；此前同步列表中定义相同是字段顺序调整，不是闲置证据。
- distributors.invite_qr_url 有二维码生成、缓存读取及更新逻辑（routes/client.js 1237–1289行附近）。
- mini_program_logs 的环境/版本/设备/网络字段由日志上报统一写入（routes/client.js 114行附近），不是无用字段。
- stores.image_urls 有门店图片读写用途，不能与 community_posts.image_urls 混淆。
- 交易、商品、治疗、预约的快照字段即使与其他表字段重复，也可能用于保留历史值；未列为可删除字段。
- 自动时间、主外键、唯一约束及迁移标记不能因为没有页面展示而判定无用。

以上10项均仍存在于当前代码的建表定义中。因此“按代码同步”并不会因为它们没被页面使用就自动删除。此次仅检查，不变更其定义。

## 全量字段盘点

下表覆盖此次数据库实际返回的全部81张表、770字段。它是范围清单，不表示未列为候选的字段均已逐条运行验证；本轮未发现足够证据将其余字段列为闲置候选。

| 表 | 字段数 | 字段清单 |
|---|---:|---|
| admin_user_stores | 3 | `admin_user_id`、`store_id`、`created_at` |
| admin_users | 13 | `id`、`username`、`password_hash`、`name`、`phone`、`role_id`、`status`、`last_login_at`、`created_at`、`doctor_id`、`all_stores`、`token_version`、`data_scope` |
| after_sales_tickets | 13 | `id`、`fulfillment_case_id`、`patient_id`、`patient_device_id`、`assigned_technician_id`、`created_by`、`issue_type`、`description`、`status`、`resolution`、`resolved_at`、`created_at`、`updated_at` |
| app_migrations | 2 | `name`、`applied_at` |
| appointment_charge_refunds | 10 | `id`、`charge_id`、`refund_no`、`amount`、`status`、`provider_refund_id`、`reason`、`refunded_at`、`created_at`、`updated_at` |
| appointment_charges | 13 | `id`、`appointment_id`、`charge_no`、`consult_fee`、`deposit_amount`、`status`、`payment_method`、`provider_transaction_id`、`paid_at`、`credited`、`payment_reference`、`qr_code_url`、`created_at` |
| appointment_evaluations | 7 | `id`、`appointment_id`、`doctor_id`、`user_id`、`rating`、`content`、`created_at` |
| appointment_number_sequences | 2 | `appointment_date`、`last_number` |
| appointment_pre_exams | 10 | `id`、`appointment_id`、`user_id`、`height`、`weight`、`systolic_bp`、`diastolic_bp`、`neck_circumference`、`bmi`、`created_at` |
| appointment_reschedule_history | 8 | `id`、`appointment_id`、`source`、`operator_id`、`operator_name`、`before_snapshot`、`after_snapshot`、`created_at` |
| appointments | 28 | `id`、`appointment_no`、`user_id`、`patient_id`、`store_id`、`doctor_id`、`schedule_id`、`appointment_date`、`appointment_time`、`type`、`status`、`symptom_desc`、`cancel_reason`、`source`、`ess_assessment_id`、`snore_assessment_id`、`created_at`、`updated_at`、`doctor_name`、`doctor_title`、`doctor_specialty`、`doctor_avatar`、`consult_fee`、`store_name`、`deposit_amount`、`postpone_count`、`referral_promoter_id`、`referral_code` |
| article_categories | 4 | `id`、`name`、`sort_order`、`created_at` |
| audit_logs | 10 | `id`、`admin_id`、`action`、`target_type`、`target_id`、`details`、`created_at`、`ip_address`、`status`、`error_message` |
| community_post_favorites | 4 | `id`、`post_id`、`user_id`、`created_at` |
| community_post_likes | 4 | `id`、`post_id`、`user_id`、`created_at` |
| community_post_views | 5 | `id`、`post_id`、`user_id`、`view_date`、`created_at` |
| community_posts | 22 | `id`、`user_id`、`user_role`、`title`、`summary`、`content`、`cover_url`、`image_urls`、`tags`、`related_product_name`、`related_doctor_name`、`publish_at`、`sort_weight`、`likes_count`、`comments_count`、`views_count`、`favorites_count`、`shares_count`、`is_top`、`status`、`created_at`、`updated_at` |
| community_reports | 6 | `id`、`post_id`、`user_id`、`reason`、`status`、`created_at` |
| content_banners | 10 | `id`、`title`、`preview_text`、`preview_color`、`link_url`、`validity`、`status`、`sort_order`、`created_at`、`updated_at` |
| coupons | 9 | `id`、`title`、`type`、`value`、`min_spend`、`status`、`valid_start`、`valid_end`、`created_at` |
| device_adjustments | 9 | `patient_device_id`、`id`、`treatment_id`、`adjust_date`、`operator_id`、`adjusted_advancement`、`patient_feedback`、`instructions`、`medical_record_id` |
| device_feedback | 12 | `id`、`user_id`、`patient_device_id`、`treatment_id`、`feedback_type`、`feedback_desc`、`contact_phone`、`rating`、`status`、`reply_content`、`processed_at`、`created_at` |
| device_maintenance | 12 | `id`、`user_id`、`patient_device_id`、`treatment_id`、`service_date`、`service_type`、`service_store`、`service_operator`、`description`、`cost`、`status`、`created_at` |
| distribution_orders | 13 | `id`、`order_id`、`distributor_id`、`buyer_name`、`order_amount`、`commission_amount`、`commission_level`、`status`、`settled_at`、`created_at`、`lock_until`、`commission_kind`、`calculation_snapshot` |
| distribution_relationships | 6 | `id`、`parent_user_id`、`child_user_id`、`level`、`created_at`、`parent_distributor_id` |
| distributors | 15 | `id`、`user_id`、`nickname`、`avatar_url`、`level`、`invite_code`、`invite_qr_url`、`total_commission`、`available_commission`、`withdrawn_amount`、`status`、`created_at`、`source_type`、`contact_phone`、`created_by` |
| doctor_schedules | 12 | `id`、`doctor_id`、`store_id`、`date`、`period`、`start_time`、`end_time`、`total_slots`、`booked_slots`、`status`、`people_per_slot`、`slot_interval_minutes` |
| doctor_store_mapping | 3 | `id`、`doctor_id`、`store_id` |
| doctors | 14 | `id`、`name`、`avatar_url`、`title`、`specialty`、`hospital`、`intro`、`experience_years`、`rating`、`consult_fee`、`status`、`expertise`、`exposure_count`、`is_new` |
| ess_assessments | 7 | `id`、`user_id`、`total_score`、`risk_level`、`answers`、`created_at`、`patient_id` |
| follow_up_records | 6 | `id`、`task_id`、`follower_id`、`contact_type`、`summary`、`created_at` |
| follow_up_tasks | 8 | `id`、`patient_id`、`follower_id`、`title`、`description`、`due_date`、`status`、`created_at` |
| fulfillment_cases | 12 | `id`、`order_id`、`patient_id`、`store_id`、`technician_id`、`status`、`expected_fitting_date`、`note`、`created_by`、`created_at`、`updated_at`、`medical_record_id` |
| fulfillment_device_receipts | 9 | `id`、`fulfillment_case_id`、`receiver_id`、`device_serial_no`、`storage_location`、`inspection_result`、`received_at`、`note`、`created_at` |
| fulfillment_events | 6 | `id`、`fulfillment_case_id`、`actor_id`、`event_type`、`detail`、`created_at` |
| fulfillment_factory_batches | 10 | `id`、`batch_no`、`factory_name`、`status`、`carrier`、`tracking_no`、`sent_at`、`sender_id`、`created_by`、`created_at` |
| fulfillment_factory_items | 11 | `id`、`batch_id`、`fulfillment_case_id`、`mold_id`、`active_mold_id`、`snapshot`、`status`、`feedback`、`received_at`、`returned_at`、`updated_at` |
| fulfillment_fittings | 8 | `id`、`fulfillment_case_id`、`technician_id`、`patient_device_id`、`fitted_at`、`result`、`note`、`created_at` |
| fulfillment_mold_files | 6 | `id`、`fulfillment_case_id`、`name`、`content`、`created_by`、`created_at` |
| fulfillment_mold_profiles | 7 | `fulfillment_case_id`、`mold_id`、`details`、`status`、`revision`、`updated_by`、`updated_at` |
| fulfillment_mold_shipments | 8 | `id`、`fulfillment_case_id`、`sender_id`、`carrier`、`tracking_no`、`sent_at`、`note`、`created_at` |
| fulfillment_molds | 8 | `id`、`fulfillment_case_id`、`technician_id`、`mold_no`、`storage_location`、`taken_at`、`note`、`created_at` |
| im_messages | 7 | `id`、`patient_id`、`sender`、`sender_name`、`text`、`is_read`、`created_at` |
| live_rooms | 17 | `id`、`title`、`cover_url`、`anchor_name`、`anchor_avatar`、`status`、`start_time`、`end_time`、`viewer_count`、`replay_url`、`product_ids`、`description`、`tags`、`wechat_room_id`、`wechat_anchor_wechat`、`wechat_cover_media_id`、`wechat_share_media_id` |
| medical_records | 13 | `id`、`patient_id`、`doctor_id`、`store_id`、`appointment_id`、`visit_date`、`diagnosis`、`prescription`、`doctor_advice`、`note`、`created_at`、`type`、`attachments` |
| member_levels | 11 | `id`、`code`、`name`、`spent_required`、`sort_order`、`color`、`bg_color`、`benefits`、`status`、`created_at`、`updated_at` |
| mini_program_logs | 20 | `id`、`user_id`、`openid`、`level`、`event`、`route`、`message`、`api_url`、`method`、`status_code`、`trace_id`、`env_version`、`app_version`、`platform`、`device_model`、`sdk_version`、`network_type`、`extra`、`ip_address`、`created_at` |
| order_items | 14 | `id`、`order_id`、`product_id`、`product_name`、`product_image`、`price`、`quantity`、`is_distribution_snapshot`、`commission_rate_snapshot`、`commission_rate_level1_snapshot`、`commission_rate_level2_snapshot`、`backend_referral_enabled_snapshot`、`backend_rate_x_snapshot`、`backend_rate_y_snapshot` |
| orders | 25 | `id`、`order_no`、`user_id`、`type`、`total_amount`、`discount_amount`、`coupon_id`、`pay_amount`、`pay_method`、`pay_at`、`status`、`appointment_id`、`wechat_transaction_id`、`wechat_prepay_id`、`wechat_refund_id`、`wechat_refund_no`、`refund_at`、`shipping_address`、`created_at`、`updated_at`、`invoice_info`、`cashier_context`、`referral_promoter_id`、`referral_mode`、`distribution_processed` |
| patient_crm_records | 6 | `id`、`patient_id`、`follower_id`、`content`、`stage`、`created_at` |
| patient_devices | 18 | `id`、`patient_id`、`bind_treatment_record_id`、`bind_medical_record_id`、`bind_doctor_id`、`device_product_id`、`device_name_snapshot`、`device_image_snapshot`、`device_price_snapshot`、`device_description_snapshot`、`device_model`、`initial_advancement`、`current_advancement`、`bound_at`、`next_adjust_date`、`status`、`created_at`、`updated_at` |
| patient_store_registrations | 5 | `patient_id`、`store_id`、`doctor_id`、`created_by`、`created_at` |
| patients | 21 | `id`、`user_id`、`name`、`relation`、`gender`、`age`、`phone`、`has_snore`、`created_at`、`updated_at`、`medical_history`、`allergy_history`、`source`、`patient_no`、`id_card`、`card_no`、`avatar_url`、`birthday`、`store_id`、`region`、`address` |
| permissions | 3 | `id`、`role_id`、`permission_resource` |
| points_logs | 6 | `id`、`user_id`、`points`、`type`、`description`、`created_at` |
| post_comment_likes | 4 | `id`、`comment_id`、`user_id`、`created_at` |
| post_comments | 8 | `id`、`post_id`、`user_id`、`parent_id`、`content`、`likes_count`、`status`、`created_at` |
| private_uploads | 4 | `file_path`、`user_id`、`admin_id`、`created_at` |
| product_categories | 5 | `id`、`code`、`name`、`sort_order`、`created_at` |
| products | 20 | `id`、`name`、`category`、`image_url`、`gallery_urls`、`price`、`original_price`、`description`、`stock`、`sales_count`、`is_distribution`、`commission_rate`、`commission_rate_level1`、`commission_rate_level2`、`status`、`deleted_at`、`created_at`、`backend_referral_enabled`、`backend_rate_x`、`backend_rate_y` |
| promoter_accounts | 5 | `distributor_id`、`login_name`、`password_hash`、`token_version`、`created_at` |
| promoter_codes | 7 | `code`、`distributor_id`、`active`、`image`、`created_at`、`qr_environment`、`qr_app_id` |
| promoter_conversions | 5 | `appointment_id`、`order_id`、`distributor_id`、`mode`、`created_at` |
| role_member_data_scopes | 3 | `role_id`、`admin_user_id`、`data_scope` |
| roles | 7 | `id`、`name`、`code`、`created_at`、`description`、`status`、`data_scope` |
| snore_assessments | 15 | `id`、`user_id`、`file_url`、`duration`、`avg_decibel`、`peak_decibel`、`snore_rate`、`apnea_events`、`risk_level`、`created_at`、`patient_id`、`risk_score`、`client_record_key`、`client_payload_hash`、`analysis_version` |
| store_features | 3 | `id`、`store_id`、`feature` |
| store_hours | 4 | `id`、`store_id`、`open_time`、`close_time` |
| stores | 16 | `id`、`name`、`code`、`address`、`city`、`district`、`latitude`、`longitude`、`phone`、`open_time`、`close_time`、`status`、`has_parking`、`created_at`、`cover_url`、`image_urls` |
| system_settings | 4 | `key_name`、`key_value`、`description`、`updated_at` |
| treatment_records | 17 | `id`、`patient_id`、`doctor_id`、`medical_record_id`、`patient_device_id`、`device_product_id`、`device_product_name`、`device_product_image_url`、`device_product_price`、`device_product_description`、`device_model`、`initial_advancement`、`current_advancement`、`start_date`、`next_adjust_date`、`status`、`created_at` |
| treatment_timelines | 12 | `id`、`user_id`、`patient_id`、`treatment_id`、`event_date`、`event_title`、`event_desc`、`event_type`、`doctor_name`、`color`、`icon`、`created_at` |
| user_coupons | 6 | `id`、`user_id`、`coupon_id`、`status`、`used_at`、`created_at` |
| user_membership_history | 7 | `id`、`user_id`、`from_level_id`、`to_level_id`、`total_spent`、`reason`、`created_at` |
| user_memberships | 5 | `user_id`、`level_id`、`effective_at`、`updated_at`、`protected_level_id` |
| user_notifications | 7 | `id`、`user_id`、`title`、`content`、`type`、`is_read`、`created_at` |
| user_patient_links | 6 | `id`、`user_id`、`patient_id`、`relation`、`created_at`、`updated_at` |
| users | 14 | `id`、`openid`、`unionid`、`phone`、`phone_verified_at`、`password_hash`、`nickname`、`avatar_url`、`gender`、`birthday`、`points`、`created_at`、`updated_at`、`self_patient_id` |
| wearing_logs | 13 | `patient_id`、`patient_device_id`、`id`、`treatment_id`、`date`、`wear_duration`、`comfort`、`pain_score`、`pain_locations`、`ahi_index`、`note`、`created_at`、`source` |
| wechat_subscribe_logs | 9 | `id`、`user_id`、`openid`、`event`、`template_id`、`business_id`、`status`、`error_message`、`sent_at` |
| withdraw_records | 13 | `id`、`user_id`、`amount`、`fee`、`actual_amount`、`status`、`account_info`、`completed_at`、`created_at`、`remark`、`reviewed_at`、`payout_reference`、`distributor_id` |

## 历史

- 2026-11-04：完成全库字段清单、代码静态引用及候选数据聚合检查；列出7项未消费候选、3项履约待确认项。未实施修复或删除，候选状态待验证。
