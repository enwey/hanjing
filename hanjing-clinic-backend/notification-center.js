import crypto from 'node:crypto';
import { query, get, transaction } from './db.js';
import { getNotificationBusinessDetail } from './notification-details.js';
import { initCommunityNotifications } from './community-notifications.js';
import { resolveImPatient } from './im-access.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const types = new Set(['appointment','treatment','assessment','order','community','promo','system']);
const read = async (conn, sql, params = []) => conn ? (await conn.execute(sql, params))[0] : query(sql, params);

export async function initNotificationCenter(q) {
  const columns = await q('SHOW COLUMNS FROM user_notifications');
  for (const [name, definition] of Object.entries({business_type:'VARCHAR(32) NULL',business_id:'VARCHAR(80) NULL',event_key:'CHAR(64) NULL',event_code:'VARCHAR(100) NULL',metadata:'JSON NULL',read_version:'BIGINT UNSIGNED NOT NULL DEFAULT 0',source_version:'BIGINT UNSIGNED NOT NULL DEFAULT 0'})) {
    if (!columns.some(c => c.Field === name)) await q(`ALTER TABLE user_notifications ADD COLUMN ${name} ${definition}`);
  }
  const indexes = await q('SHOW INDEX FROM user_notifications');
  if (!indexes.some(i => i.Key_name === 'uq_notification_event')) await q('ALTER TABLE user_notifications ADD UNIQUE KEY uq_notification_event(user_id,event_key)');
  if (!indexes.some(i => i.Key_name === 'idx_notification_user_id')) await q('ALTER TABLE user_notifications ADD INDEX idx_notification_user_id(user_id,id)');
  await q(`UPDATE user_notifications SET type=CASE
    WHEN title IN ('预约已改期','预约支付成功','预约付款待核对','预约退款申请已提交','预约已取消') THEN 'appointment'
    WHEN title='就诊已完成' THEN 'treatment'
    WHEN title IN ('佣金已结算','提现审核通过','提现申请已驳回','提现已打款') THEN 'promo'
    ELSE type END WHERE type='system' OR type IS NULL`);
  await q(`CREATE TABLE IF NOT EXISTS notification_event_states (
    stream_key CHAR(64) PRIMARY KEY, signature CHAR(64) NOT NULL DEFAULT '', version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    user_id BIGINT UNSIGNED NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await q(`CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
    delivery_key CHAR(64) NOT NULL UNIQUE, payload JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_error VARCHAR(160) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, delivered_at DATETIME NULL,
    INDEX idx_outbox_pending(status,next_attempt_at,id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await q(`CREATE TABLE IF NOT EXISTS notification_delivery_versions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await initCommunityNotifications(q);
}

const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;

async function deliverNotification(conn, outboxId, input) {
  const {userId,title,content,type,businessType,businessId,event,eventKey,metadata,replaceExisting}=input;
  const [version]=await conn.execute('INSERT INTO notification_delivery_versions VALUES()');
  const replacements = replaceExisting ? `title=IF(source_version<VALUES(source_version),VALUES(title),title),
    content=IF(source_version<VALUES(source_version),VALUES(content),content),
    metadata=IF(source_version<VALUES(source_version),VALUES(metadata),metadata),
    is_read=IF(source_version<VALUES(source_version),0,is_read),
    read_version=IF(source_version<VALUES(source_version),VALUES(read_version),read_version),
    source_version=GREATEST(source_version,VALUES(source_version)),` : '';
  const [result]=await conn.execute(`INSERT INTO user_notifications
    (user_id,title,content,type,business_type,business_id,event_code,event_key,metadata,read_version,source_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ${replacements} id=LAST_INSERT_ID(id)`,
    [userId,title,content,type,businessType,businessId,event,eventKey,metadata ? JSON.stringify(metadata) : null,version.insertId,outboxId]);
  await conn.execute("UPDATE notification_outbox SET status='delivered',delivered_at=NOW(),last_error=NULL WHERE id=?",[outboxId]);
  return result.insertId;
}

async function attemptDelivery(conn, outboxId, input) {
  await conn.query('SAVEPOINT notification_delivery');
  try {
    const id=await deliverNotification(conn,outboxId,input);
    await conn.query('RELEASE SAVEPOINT notification_delivery');
    return id;
  } catch(error) {
    // A deadlock may roll back the entire business transaction. Never swallow it.
    if(error.code==='ER_LOCK_DEADLOCK' || error.fatal) throw error;
    await conn.query('ROLLBACK TO SAVEPOINT notification_delivery');
    await conn.query('RELEASE SAVEPOINT notification_delivery');
    await conn.execute(`UPDATE notification_outbox SET attempts=attempts+1,
      next_attempt_at=DATE_ADD(NOW(),INTERVAL LEAST(3600,POW(2,LEAST(attempts,11))*30) SECOND),last_error=? WHERE id=?`,
      [String(error.code || 'DELIVERY_FAILED').slice(0,160),outboxId]);
    return null;
  }
}

// The event is persisted in the same transaction as the business change. Delivery
// can be retried after a process restart without replaying the business operation.
export async function processNotificationOutbox(limit=100, now=new Date()) {
  const rows=await query(`SELECT id,payload FROM notification_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY id LIMIT ${Math.max(1,Math.min(500,Math.floor(Number(limit)||100)))}`,[now]);
  for(const item of rows)await transaction(async conn=>{
    const input=parseJson(item.payload);
    let staleReminder=false;
    if(input.reminder) {
      const {kind,date,time}=input.reminder;
      let valid;
      if(kind==='appointment') {
        [valid]=await read(conn,`SELECT id FROM appointments WHERE id=? AND status='pending' AND appointment_date=? AND appointment_time=?
          AND TIMESTAMP(appointment_date,LEFT(appointment_time,5))>NOW() FOR UPDATE`,[input.businessId,date,time]);
      } else {
        const table=kind==='followup'?'follow_up_tasks':'treatment_records';
        const column=kind==='followup'?'due_date':'next_adjust_date';
        const comparison=['upcoming','review_upcoming'].includes(input.event)?'>':'=';
        [valid]=await read(conn,`SELECT id FROM ${table} WHERE id=? AND status=? AND ${column}=? AND ${column}${comparison}CURDATE() FOR UPDATE`,[input.businessId,kind==='followup'?'pending':'active',date]);
      }
      staleReminder=!valid;
    }
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[input.userId]);
    const [[row]]=await conn.execute("SELECT * FROM notification_outbox WHERE id=? AND status='pending' AND next_attempt_at<=? FOR UPDATE",[item.id,now]);
    if(!row)return;
    if(staleReminder){await conn.execute("UPDATE notification_outbox SET status='discarded',last_error='REMINDER_NO_LONGER_VALID' WHERE id=?",[row.id]);return;}
    await attemptDelivery(conn,row.id,input);
  });
}

// Call with the business transaction. Unique stream locks serialize callback retries.
// A -> B -> A is a new revision; repeating A without a change is not.
export async function writeNotification(conn, input) {
  if (!input.userId) return null;
  if (!conn) return transaction(tx => writeNotification(tx, input));
  const {userId, title, content, businessType = null, businessId = null, event = title, onceKey} = input;
  // Per-recipient serialization makes visible read versions follow commit order,
  // including when different business transactions update one aggregate card.
  await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
  const type = types.has(input.type) ? input.type : 'system';
  const stream = hash(JSON.stringify([String(userId),businessType,String(businessId || ''),event]));
  const signature = hash(JSON.stringify([title,content,input.revision ?? null,input.metadata ?? null]));
  let eventKey;
  if (onceKey) eventKey = hash(JSON.stringify([stream,onceKey]));
  else {
    await conn.execute('INSERT INTO notification_event_states(stream_key,user_id) VALUES(?,?) ON DUPLICATE KEY UPDATE stream_key=VALUES(stream_key)',[stream,userId]);
    const [[state]] = await conn.execute('SELECT signature,version FROM notification_event_states WHERE stream_key=? FOR UPDATE',[stream]);
    if (state.signature === signature) return null;
    const version = Number(state.version) + 1;
    await conn.execute('UPDATE notification_event_states SET signature=?,version=? WHERE stream_key=?',[signature,version,stream]);
    eventKey = hash(stream+':'+version);
  }
  const payload={userId,title,content,type,businessType,businessId:businessId==null?null:String(businessId),event,eventKey,
    metadata:input.metadata || null,replaceExisting:!!input.replaceExisting,reminder:input.reminder || null};
  const deliveryKey=input.replaceExisting?hash(eventKey+':'+signature):eventKey;
  await conn.execute('INSERT INTO notification_outbox(user_id,delivery_key,payload) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[userId,deliveryKey,JSON.stringify(payload)]);
  const [[outbox]]=await conn.execute('SELECT id,status FROM notification_outbox WHERE delivery_key=? FOR UPDATE',[deliveryKey]);
  if(outbox.status!=='pending') {
    const [[existing]]=await conn.execute('SELECT id FROM user_notifications WHERE user_id=? AND event_key=?',[userId,eventKey]);
    return existing?.id || null;
  }
  return attemptDelivery(conn,outbox.id,payload);
}

const dateText = value => value instanceof Date ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(value) : String(value || '').slice(0,10);
const money = value => '¥'+(Number(value || 0)/100).toFixed(2);
export async function notifyBusiness(conn, kind, id, event, extra = {}) {
  if (!conn) return transaction(tx => notifyBusiness(tx,kind,id,event,extra));
  let row, userId, type, title, content;
  if (kind === 'appointment') {
    [row] = await read(conn,`SELECT a.*,p.name patient_name FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.id=?`,[id]);
    if (!row) return;
    userId=row.user_id;type='appointment';
    const date = row.appointment_date instanceof Date ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(row.appointment_date) : String(row.appointment_date).slice(0,10);
    const summary=`${row.patient_name || '就诊人'}，${row.store_name || '门店'}，${row.doctor_name || '医生'}，${date} ${row.appointment_time}。`;
    const previous=extra.previous;
    const oldSummary=previous ? `${previous.store_name || '原门店'}，${previous.doctor_name || '原医生'}，${dateText(previous.appointment_date)} ${previous.appointment_time}` : '';
    const messages={created:['预约已创建',summary+(row.status==='pending_payment'?`待支付 ${money(Number(row.consult_fee)+Number(row.deposit_amount))}。`:'预约已成功。')],paid:['预约支付成功',summary+`挂号费 ${money(row.consult_fee)}，预约定金 ${money(row.deposit_amount)}。`],rescheduled:['预约已改期',(previous ? `原预约：${oldSummary}。新预约：` : '')+summary],refund_pending:['预约退款处理中','预约退款已申请，请等待退款结果。'],refunded:['预约退款成功',`预约费用已确认退款 ${money(extra.amount)}。`],refund_failed:['预约退款需处理','退款结果异常，工作人员将核对处理，请勿重复申请。'],payment_conflict:['预约付款待核对','收到付款，但预约状态或收费信息已变化，正在核对退款。'],reminder:['就诊提醒',summary+'请按时到诊。'],checkin:['签到成功',summary+'请等待叫号。']};
    [title,content]=messages[event] || ['预约状态更新',summary];
  } else if (kind === 'order') {
    [row]=await read(conn,'SELECT * FROM orders WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='order';
    let shipping={};try{shipping=parseJson(row.shipping_address)||{};}catch{}
    const messages={created:['订单已创建',`订单 ${row.order_no} 已创建，请查看订单和付款信息。`],paid:['商品购买成功',`订单 ${row.order_no} 已收款 ${money(row.pay_amount)}。`],shipped:['商品已发货',`订单 ${row.order_no} 已发货。承运商：${shipping.express_company || '请查看订单'}；运单号：${shipping.tracking_number || '请查看订单'}。`],refund_failed:['退款需处理',`订单 ${row.order_no} 退款结果异常，请等待工作人员核对。`]};
    [title,content]=messages[event] || ['订单状态更新',`订单 ${row.order_no} 状态已更新。`];
  } else if (kind === 'post') {
    [row]=await read(conn,'SELECT * FROM community_posts WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='community';title='帖子审核结果';
    const states={approved:'审核通过',published:'审核通过',rejected:'审核未通过',hidden:'已下架',draft:'已退回草稿',pending:'等待审核'};
    content=`《${row.title}》${states[row.status] || '状态已更新'}${extra.reason?'，原因：'+extra.reason:''}。`;
  } else if (kind === 'report') {
    [row]=await read(conn,'SELECT * FROM community_reports WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='community';title='举报处理进度';content=row.status==='pending'?'举报已提交，等待处理。':`${row.status==='dismissed'?'举报未采纳':'举报已处理'}。${row.result_text || '处理结论尚未补充，请联系门店了解进度。'}`;
  } else if (kind === 'snore') {
    [row]=await read(conn,'SELECT * FROM snore_assessments WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='assessment';title='鼾声分析报告已生成';content='本次录音分析已完成，点击查看报告。';
  } else if (kind === 'medical' || kind === 'treatment' || kind === 'after_sale' || kind === 'followup' || kind === 'message') {
    const table={medical:'medical_records',treatment:'treatment_records',after_sale:'after_sales_tickets',followup:'follow_up_tasks',message:'im_messages'}[kind];
    [row]=await read(conn,`SELECT b.*,p.user_id,p.name patient_name FROM ${table} b JOIN patients p ON p.id=b.patient_id WHERE b.id=?`,[id]);if(!row)return;
    userId=row.user_id;type='treatment';
    const messages={medical:['病历医嘱已更新','医生已更新病历或医嘱，请查看详情。'],treatment:['治疗方案已更新',`治疗设备：${row.device_product_name || row.device_model || '已更新'}。当前前移量：${row.current_advancement ?? '—'}mm。${row.next_adjust_date ? '下次复诊日期：'+dateText(row.next_adjust_date)+'。' : ''}请按医嘱执行。`],after_sale:['售后处理进度',`您的售后申请${({pending:'已受理',assigned:'已安排处理',processing:'正在处理',resolved:'已处理完成',completed:'已处理完成',closed:'已关闭',rejected:'未通过'})[row.status] || '状态已更新'}。${row.resolution || ''}`],followup:[['due','upcoming'].includes(event)?'随访提醒':'随访安排更新',`计划日期：${dateText(row.due_date)}。${row.status==='cancelled'?'该随访已取消。':'请留意门店联系。'}`],message:['客服新回复','您有一条新的服务回复，点击查看。']};
    [title,content]=messages[kind];
    content=`就诊人：${row.patient_name || '您的家人'}。${content}`;
  } else if (kind === 'promoter') {
    [row]=await read(conn,'SELECT * FROM distributors WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='promo';title='推广资格更新';content=`您的推广资格${({active:'已开通',disabled:'已停用',inactive:'已停用',pending:'待审核',rejected:'审核未通过'})[row.status] || '已更新'}。${extra.reason?'原因：'+extra.reason+'。':''}请查看分销中心。`;
  } else if (kind === 'withdraw') {
    [row]=await read(conn,'SELECT * FROM withdraw_records WHERE id=?',[id]);if(!row)return;
    userId=row.user_id;type='promo';title='提现申请已提交';content=`提现申请 ${money(row.amount)} 已提交，等待审核。`;
  }
  if(!userId || !title)return;
  const revision = kind==='report' ? row.status+':'+(row.result_text || '') : ['medical','treatment'].includes(kind) ? hash(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key])=>!['updated_at','created_at'].includes(key))))) : undefined;
  return writeNotification(conn,{userId,type,title,content,businessType:kind,businessId:id,event,revision,...extra});
}

export async function runAndNotify(sql, params, kind, id, event, extra = {}) {
  return transaction(async conn=>{
    const [result]=await conn.execute(sql,params);
    if(result.affectedRows)await notifyBusiness(conn,kind,id || result.insertId,event,extra);
    return {id:result.insertId,changes:result.affectedRows};
  });
}

export async function resolveNotificationTarget(userId, notification) {
  const {business_type:kind,business_id:id}=notification;
  if (!kind || !id) return null; // Old unlinked messages remain readable.
  let row, path;
  if (kind==='appointment') {row=await get('SELECT id FROM appointments WHERE id=? AND user_id=?',[id,userId]);path=`/pages/appointment/detail?id=${id}`;}
  else if(kind==='order'){row=await get('SELECT id FROM orders WHERE id=? AND user_id=?',[id,userId]);path=`/pages/order/detail?id=${id}`;}
  else if(kind==='post'){
    row=await get("SELECT id,status,user_id,user_role FROM community_posts WHERE id=? AND (status IN ('approved','published') OR user_id=?)",[id,userId]);
    path=row && ['approved','published'].includes(row.status)?`/pages/community/detail/index?id=${id}`:row && Number(row.user_id)===Number(userId) && row.user_role!=='admin' && ['draft','pending','rejected'].includes(row.status)?`/pages/community/publish/index?editId=${id}`:null;
    const metadata=parseJson(notification.metadata)||{};
    if(path && path.startsWith('/pages/community/detail/') && metadata.commentId) {
      const comment=await get('SELECT id FROM post_comments WHERE id=? AND post_id=?',[metadata.commentId,id]);
      if(comment)path+='&commentId='+encodeURIComponent(comment.id);
    }
  }
  else if(kind==='snore'){row=await get('SELECT id FROM snore_assessments WHERE id=? AND user_id=?',[id,userId]);path=`/pages/assessment/snore-result/index?id=snore-${id}`;}
  else if(kind==='promoter' || kind==='commission'){row=await get('SELECT id FROM distributors WHERE id=? AND user_id=?',[id,userId]);path=kind==='commission'?'/pages/distribution/commission/index':'/pages/distribution/center/index';}
  else if(kind==='withdraw'){row=await get('SELECT id FROM withdraw_records WHERE id=? AND user_id=?',[id,userId]);path='/pages/distribution/withdraw-records/index';}
  else if(kind==='member'){row=await get('SELECT id FROM users WHERE id=? AND id=?',[id,userId]);path='/pages/profile/member-benefits/index';}
  else if(kind==='fulfillment') {row=await get('SELECT f.id,f.order_id FROM fulfillment_cases f JOIN orders o ON o.id=f.order_id WHERE f.id=? AND o.user_id=?',[id,userId]);if(row)path=`/pages/order/detail?id=${row.order_id}`;}
  else if(['medical','treatment','after_sale','followup','message'].includes(kind)) {
    const table={medical:'medical_records',treatment:'treatment_records',after_sale:'after_sales_tickets',followup:'follow_up_tasks',message:'im_messages'}[kind];
    row=await get(`SELECT b.id,b.patient_id FROM ${table} b JOIN patients p ON p.id=b.patient_id WHERE b.id=? AND p.user_id=?`,[id,userId]);
    if(row && kind==='message') {
      const self=await get('SELECT self_patient_id FROM users WHERE id=?',[userId]);
      const isSelf=String(self?.self_patient_id)===String(row.patient_id);
      await resolveImPatient(userId,isSelf?null:row.patient_id);
      return '/pages/profile/online-service/index'+(isSelf?'':'?patientId='+row.patient_id);
    }
    // Treatment history is projected by its exact ID in the notice detail below.
    // The existing adjustment page only loads the latest plan, so do not misroute.
    if(row)path=kind==='message'?`/pages/profile/online-service/index?patientId=${row.patient_id}`:kind==='medical'?`/pages/profile/medical-records/index?patientId=${row.patient_id}&recordId=${id}`:null;
  } else if(kind==='report'){row=await get('SELECT id FROM community_reports WHERE id=? AND user_id=?',[id,userId]);}
  if(!row)throw Object.assign(new Error('关联内容已不存在或您无权查看'),{statusCode:404});
  return path;
}

export function installNotificationRoutes(app, authenticate) {
  const wrap=fn=>async(req,res)=>{try{res.json({code:0,data:await fn(req)});}catch(error){res.status(error.statusCode||500).json({code:error.statusCode||500,message:error.statusCode?error.message:'通知加载失败，请重试'});}};
  const validNumber=(value,fallback)=>{if(value===undefined)return fallback;if(!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<1)throw Object.assign(new Error('分页参数无效'),{statusCode:400});return Number(value);};
  app.get('/api/v1/user/notifications',authenticate,wrap(async req=>{
    const limit=Math.min(validNumber(req.query.limit,20),100), before=validNumber(req.query.before,null);
    const category=req.query.type;
    if(category && !types.has(category))throw Object.assign(new Error('通知分类无效'),{statusCode:400});
    const params=[req.user.id];let where='user_id=?';
    if(before){where+=' AND id<?';params.push(before);}
    if(category){where+=' AND type=?';params.push(category);}
    const rows=await query(`SELECT * FROM user_notifications WHERE ${where} ORDER BY id DESC LIMIT ${limit+1}`,params);
    const unread=await get('SELECT SUM(is_read=0) count, MAX(id) snapshot, MAX(read_version) version FROM user_notifications WHERE user_id=?',[req.user.id]);
    const hasMore=rows.length>limit;const list=rows.slice(0,limit).map(n=>({id:String(n.id),title:n.title,content:n.content,type:n.type||'system',isRead:n.is_read===1,createdAt:n.created_at,hasTarget:Boolean(n.business_type),changeVersion:String(n.read_version || 0)}));
    return {list,unread:Number(unread.count || 0),snapshotId:unread.snapshot ? String(unread.snapshot) : null,snapshotVersion:String(unread.version || 0),hasMore,nextCursor:hasMore?list.at(-1).id:null};
  }));
  app.get('/api/v1/user/notifications/:id',authenticate,wrap(async req=>{
    validNumber(req.params.id,null);
    const row=await get('SELECT * FROM user_notifications WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if(!row)throw Object.assign(new Error('通知不存在'),{statusCode:404});
    let target=null, unavailable='',businessDetail=null;
    try { target=await resolveNotificationTarget(req.user.id,row); businessDetail=await getNotificationBusinessDetail(req.user.id,row); } catch(error) { if(error.statusCode!==404)throw error; unavailable=error.message;target=null;businessDetail=null; }
    return {id:String(row.id),title:row.title,content:row.content,type:row.type,createdAt:row.created_at,target,unavailable,businessDetail};
  }));
  app.post('/api/v1/user/notifications/read-all',authenticate,wrap(async req=>{
    const through=validNumber(req.body?.through,null);
    const version=req.body?.throughVersion;
    if(version!==undefined && (!/^\d+$/.test(String(version)) || !Number.isSafeInteger(Number(version))))throw Object.assign(new Error('已读快照无效'),{statusCode:400});
    const params=[req.user.id];if(through)params.push(through);if(version!==undefined)params.push(Number(version));
    await query(`UPDATE user_notifications SET is_read=1 WHERE user_id=?${through?' AND id<=?':''}${version!==undefined?' AND read_version<=?':''}`,params);
    const unread=await get('SELECT COUNT(*) count FROM user_notifications WHERE user_id=? AND is_read=0',[req.user.id]);
    return {success:true,unread:Number(unread.count)};
  }));
  app.post('/api/v1/user/notifications/:id/read',authenticate,wrap(async req=>{
    validNumber(req.params.id,null);
    const row=await get('SELECT id FROM user_notifications WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if(!row)throw Object.assign(new Error('通知不存在'),{statusCode:404});
    const version=req.body?.throughVersion;
    if(version!==undefined && (!/^\d+$/.test(String(version)) || !Number.isSafeInteger(Number(version))))throw Object.assign(new Error('已读快照无效'),{statusCode:400});
    await query(`UPDATE user_notifications SET is_read=1 WHERE id=? AND user_id=?${version!==undefined?' AND read_version<=?':''}`,version!==undefined?[row.id,req.user.id,Number(version)]:[row.id,req.user.id]);
    const current=await get('SELECT is_read FROM user_notifications WHERE id=? AND user_id=?',[row.id,req.user.id]);
    const unread=await get('SELECT COUNT(*) count FROM user_notifications WHERE user_id=? AND is_read=0',[req.user.id]);
    return {success:true,isRead:current?.is_read===1,unread:Number(unread.count)};
  }));
}

// Independent in-app job. Each item is rechecked under its business row lock;
// repeated runs and multiple service instances share the event-key constraint.
export async function processInAppReminders() {
  const appointments=await query(`SELECT id FROM appointments WHERE user_id IS NOT NULL AND status='pending'
    AND TIMESTAMP(appointment_date,LEFT(appointment_time,5)) > NOW()
    AND TIMESTAMP(appointment_date,LEFT(appointment_time,5)) <= DATE_ADD(NOW(),INTERVAL 1 HOUR)`);
  for(const item of appointments)await transaction(async conn=>{
    const [[row]]=await conn.execute(`SELECT id,appointment_date,appointment_time FROM appointments WHERE id=? AND status='pending'
      AND TIMESTAMP(appointment_date,LEFT(appointment_time,5)) > NOW()
      AND TIMESTAMP(appointment_date,LEFT(appointment_time,5)) <= DATE_ADD(NOW(),INTERVAL 1 HOUR) FOR UPDATE`,[item.id]);
    if(row)await notifyBusiness(conn,'appointment',row.id,'reminder',{onceKey:dateText(row.appointment_date)+':'+row.appointment_time,reminder:{kind:'appointment',date:dateText(row.appointment_date),time:row.appointment_time}});
  });
  const tasks=await query("SELECT id FROM follow_up_tasks WHERE status='pending' AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 1 DAY)");
  for(const item of tasks)await transaction(async conn=>{
    const [[row]]=await conn.execute("SELECT id,due_date,due_date>CURDATE() upcoming FROM follow_up_tasks WHERE id=? AND status='pending' AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 1 DAY) FOR UPDATE",[item.id]);
    if(row)await notifyBusiness(conn,'followup',row.id,row.upcoming?'upcoming':'due',{onceKey:dateText(row.due_date),reminder:{kind:'followup',date:dateText(row.due_date)}});
  });
  const treatments=await query("SELECT id FROM treatment_records WHERE status='active' AND next_adjust_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 1 DAY)");
  for(const item of treatments)await transaction(async conn=>{
    const [[row]]=await conn.execute("SELECT t.*,p.user_id,p.name patient_name,t.next_adjust_date>CURDATE() upcoming FROM treatment_records t JOIN patients p ON p.id=t.patient_id WHERE t.id=? AND t.status='active' AND t.next_adjust_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 1 DAY) FOR UPDATE",[item.id]);
    if(row)await writeNotification(conn,{userId:row.user_id,type:'treatment',businessType:'treatment',businessId:row.id,event:row.upcoming?'review_upcoming':'review_due',onceKey:dateText(row.next_adjust_date),reminder:{kind:'treatment',date:dateText(row.next_adjust_date)},title:'复诊提醒',content:`就诊人：${row.patient_name}。计划复诊日期为 ${dateText(row.next_adjust_date)}，请查看安排并联系门店。`});
  });
  // Only reports accepted by this notification version; do not replay historic reports.
  const reports=await query(`SELECT r.id,r.status FROM community_reports r WHERE r.status<>'pending'
    AND EXISTS(SELECT 1 FROM user_notifications n WHERE n.business_type='report' AND CAST(n.business_id AS UNSIGNED)=r.id AND n.event_code='submitted')`);
  for(const row of reports)await notifyBusiness(null,'report',row.id,'processed');
  // Recover a service reply committed just before a process/socket failure.
  // Read receipts win; never turn an already-read conversation back to unread.
  const replies=await query(`SELECT m.id,m.patient_id,p.user_id,(u.self_patient_id=p.id) is_self
    FROM im_messages m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=p.user_id
    WHERE m.sender='doctor' AND m.is_read=0 AND m.created_at<=DATE_SUB(NOW(),INTERVAL 15 SECOND)
    AND (u.self_patient_id=p.id OR EXISTS(SELECT 1 FROM user_patient_links l WHERE l.patient_id=p.id AND l.user_id=p.user_id))
    AND NOT EXISTS(SELECT 1 FROM user_notifications n WHERE n.business_type='message' AND CAST(n.business_id AS UNSIGNED)=m.id)
    ORDER BY m.id LIMIT 100`);
  const {isPatientConversationOpen}=await import('./im-socket.js');
  for(const item of replies) {
    if(await isPatientConversationOpen(item.patient_id))continue;
    await transaction(async conn=>{
      let patient;
      try {patient=await resolveImPatient(item.user_id,item.is_self?null:item.patient_id,conn);}
      catch(error){if(error.statusCode===404)return;throw error;}
      if(Number(patient.id)!==Number(item.patient_id))return;
      const [[message]]=await conn.execute("SELECT id FROM im_messages WHERE id=? AND patient_id=? AND sender='doctor' AND is_read=0 FOR UPDATE",[item.id,patient.id]);
      if(message && !await isPatientConversationOpen(patient.id))await notifyBusiness(conn,'message',message.id,'reply');
    });
  }
}
