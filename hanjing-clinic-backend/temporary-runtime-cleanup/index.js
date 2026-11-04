import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { syncUserMembership } from '../membership.js';

export const groups = [
  {id:'appointments',label:'预约管理',description:'预约、改约、预检、评价、预约收费退款及关联订单和诊疗记录',tables:['appointments']},
  {id:'patients',label:'患者管理',description:'患者档案及其预约、收费、订单、诊疗、评估和交付记录；保留登录账号',tables:['patients']},
  {id:'clinical',label:'接诊工作台',description:'病历、治疗、设备、佩戴、随访及关联交付',tables:['medical_records','treatment_records','patient_devices','wearing_logs','follow_up_tasks']},
  {id:'orders',label:'订单管理',description:'订单、明细、支付退款信息及关联交付、分销流水',tables:['orders']},
  {id:'fulfillment',label:'交付管理 / 售后工作台',description:'交付、口模、生产批次、配送、试戴和售后',tables:['fulfillment_cases','fulfillment_factory_batches','after_sales_tickets']},
  {id:'distribution',label:'分销总览 / 提现审核',description:'推广转化、佣金和提现记录；保留推广员账号和绑定关系',tables:['promoter_conversions','distribution_orders','withdraw_records']},
  {id:'assessments',label:'患者管理 · 睡眠评估',description:'ESS、鼾声评估；预约中的评估关联将解除',tables:['ess_assessments','snore_assessments']},
  {id:'products',label:'商品管理',description:'全部商品及包含这些商品的整笔订单、支付退款、交付和分销流水；保留商品分类',tables:['products']},
  {id:'product_categories',label:'商品分类',description:'全部商品分类及分类下商品，连带清理商品关联的整笔订单及后续记录',tables:['product_categories']},
  {id:'articles',label:'科普文章',description:'全部科普文章和用户帖子，以及评论、点赞、收藏、浏览和举报；保留内容分类',tables:['community_posts']},
  {id:'article_categories',label:'内容分类',description:'全部内容分类及带有对应分类标签的文章、帖子和互动记录',tables:['article_categories']},
  {id:'community',label:'科普文章 · 互动记录',description:'评论、点赞、收藏、浏览和举报；保留帖子与科普文章',tables:['post_comments','community_post_likes','community_post_favorites','community_post_views','community_reports']}
];
const allowed = new Set(`patients user_memberships user_membership_history user_coupons points_logs user_notifications user_patient_links patient_store_registrations patient_crm_records appointments appointment_charges appointment_charge_refunds appointment_pre_exams appointment_evaluations appointment_reschedule_history orders order_items medical_records treatment_records patient_devices wearing_logs device_adjustments device_feedback device_maintenance ess_assessments snore_assessments follow_up_tasks follow_up_records treatment_timelines im_messages fulfillment_cases fulfillment_molds fulfillment_mold_profiles fulfillment_mold_files fulfillment_mold_shipments fulfillment_device_receipts fulfillment_fittings fulfillment_events fulfillment_factory_batches fulfillment_factory_items after_sales_tickets promoter_conversions distribution_orders withdraw_records post_comments post_comment_likes community_post_likes community_post_favorites community_post_views community_reports`.split(' '));
for(const t of ['products','product_categories','community_posts','article_categories'])allowed.add(t);
const labels={products:'商品',product_categories:'商品分类',community_posts:'科普文章及用户帖子',article_categories:'内容分类',patients:'患者档案',appointments:'预约',orders:'订单（含支付退款信息）',appointment_charges:'预约收费',appointment_charge_refunds:'预约退款',appointment_reschedule_history:'改约历史',medical_records:'诊疗病历',treatment_records:'治疗记录',patient_devices:'患者设备',distribution_orders:'佣金流水',withdraw_records:'提现流水',fulfillment_cases:'交付记录',ess_assessments:'ESS评估',snore_assessments:'鼾声评估'};
Object.assign(labels, {
 user_patient_links:'患者账号关联',patient_store_registrations:'患者门店登记',patient_crm_records:'患者跟进资料',
 user_memberships:'患者会员记录',user_membership_history:'患者会员变更',user_coupons:'患者优惠券',points_logs:'患者积分流水',user_notifications:'患者业务通知',
 appointment_pre_exams:'预约预检',appointment_evaluations:'就诊评价',order_items:'订单明细',wearing_logs:'佩戴打卡',device_adjustments:'设备调整',device_feedback:'设备反馈',device_maintenance:'设备维护',
 follow_up_tasks:'随访任务',follow_up_records:'随访记录',treatment_timelines:'治疗动态',im_messages:'医患消息',
 fulfillment_molds:'口模记录',fulfillment_mold_profiles:'口模资料',fulfillment_mold_files:'口模附件数据',fulfillment_mold_shipments:'口模寄送',fulfillment_device_receipts:'设备入库',fulfillment_fittings:'试戴记录',fulfillment_events:'交付动态',fulfillment_factory_batches:'生产批次',fulfillment_factory_items:'生产明细',after_sales_tickets:'售后工单',promoter_conversions:'推广转化',post_comments:'社区评论',post_comment_likes:'评论点赞',community_post_likes:'帖子点赞',community_post_favorites:'帖子收藏',community_post_views:'帖子浏览',community_reports:'社区举报'
});
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const quote=s=>{if(!/^[a-z_]+$/.test(s))throw fail('无效的数据表');return '`'+s+'`';};
const tmp=t=>quote('tmp_cleanup_'+t);
const plans=new Map();
const nullOnly = new Set(['treatment_records.device_product_id','patient_devices.device_product_id','appointments.ess_assessment_id','appointments.snore_assessment_id']);
export function validateGroups(ids) {
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>!groups.some(g=>g.id===id)))throw fail('请选择有效的业务范围');
 return [...new Set(ids)].sort();
}
async function connection() {return mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'root',database:process.env.DB_NAME||'hanjing_clinic',timezone:'+08:00'});}

// 独立模块：不接受客户端表名/SQL，不关闭外键，不执行 TRUNCATE。
export async function runCleanupPlan(ids, execute=false, expectedHash=null, actor={}) {
 ids=validateGroups(ids);
 const conn=await connection();
 try {
  await conn.query("SET time_zone='+08:00'");
  await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  await conn.beginTransaction();
  const [meta]=await conn.query("SELECT TABLE_NAME t,COLUMN_NAME c,COLUMN_KEY k,IS_NULLABLE n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
  const columns=new Map();for(const r of meta){if(!columns.has(r.t))columns.set(r.t,[]);columns.get(r.t).push(r);}
  const tables=[...allowed].filter(t=>columns.has(t)).sort();
  const [engines]=await conn.query("SELECT TABLE_NAME t,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
  if(engines.some(t=>tables.includes(t.t)&&t.engine!=='InnoDB'))throw fail('存在不支持事务的业务表，已停止清理',409);
  const pk=t=>columns.get(t).filter(c=>c.k==='PRI').map(c=>c.c);
  const join=(t,a,b)=>pk(t).map(c=>`${a}.${quote(c)}=${b}.${quote(c)}`).join(' AND ');
  for(const t of tables){
   if(!pk(t).length)throw fail('业务表缺少主键，已停止清理：'+t,409);
   // 串行化期间锁定业务表范围，避免确认范围之外的新记录被外键连带删除。
   await conn.query(`SELECT ${pk(t).map(quote).join(',')} FROM ${quote(t)} FOR UPDATE`);
   await conn.query(`CREATE TEMPORARY TABLE ${tmp(t)} LIKE ${quote(t)}`);
  }
  const [fkRows]=await conn.query('SELECT TABLE_NAME t,COLUMN_NAME c,REFERENCED_TABLE_NAME p,REFERENCED_COLUMN_NAME pc FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
  const edges=[...new Map(fkRows.map(r=>[`${r.t}.${r.c}.${r.p}`,r])).values()];
  for(const [t,c,p] of [['orders','appointment_id','appointments'],['appointment_reschedule_history','appointment_id','appointments'],['fulfillment_factory_items','active_mold_id','fulfillment_molds']]){
   if(columns.get(t)?.some(x=>x.c===c)&&!edges.some(e=>e.t===t&&e.c===c&&e.p===p))edges.push({t,c,p,pc:'id'});
  }
  edges.push({t:'products',c:'category',p:'product_categories',pc:'code'});
  for(const t of [...new Set(groups.filter(g=>ids.includes(g.id)).flatMap(g=>g.tables))]){
   if(!tables.includes(t))throw fail('数据库缺少业务表，请先同步结构：'+t,409);
   await conn.query(`INSERT IGNORE INTO ${tmp(t)} SELECT * FROM ${quote(t)}`);
  }
  let changed=true,round=0;
  while(changed){
   if(++round>tables.length+5)throw fail('关联范围未收敛，已停止清理',409);
   changed=false;
   for(const e of edges.filter(e=>tables.includes(e.t)&&tables.includes(e.p)&&e.t!==e.p&&!nullOnly.has(e.t+'.'+e.c))){
    const [r]=await conn.query(`INSERT IGNORE INTO ${tmp(e.t)} SELECT c.* FROM ${quote(e.t)} c JOIN ${tmp(e.p)} p ON c.${quote(e.c)}=p.${quote(e.pc)}`);changed ||= r.affectedRows>0;
   }
   for(const table of ['user_memberships','user_membership_history','user_coupons','points_logs','user_notifications']) {
    const [r]=await conn.query(`INSERT IGNORE INTO ${tmp(table)} SELECT c.* FROM ${quote(table)} c JOIN ${tmp('patients')} p ON c.user_id=p.user_id`);changed ||= r.affectedRows>0;
   }
   // 收银订单患者在 JSON 上下文中；交付记录也可能独立关联订单。
   for(const sql of [
    `INSERT IGNORE INTO ${tmp('orders')} SELECT o.* FROM orders o JOIN ${tmp('order_items')} i ON i.order_id=o.id`,
    `INSERT IGNORE INTO ${tmp('community_posts')} SELECT p.* FROM community_posts p JOIN ${tmp('article_categories')} c ON JSON_CONTAINS(p.tags,JSON_QUOTE(c.name))`,
    `INSERT IGNORE INTO ${tmp('orders')} SELECT o.* FROM orders o JOIN ${tmp('patients')} p ON JSON_UNQUOTE(JSON_EXTRACT(o.cashier_context,'$.patient_id'))=p.id`,
    `INSERT IGNORE INTO ${tmp('orders')} SELECT o.* FROM orders o JOIN ${tmp('fulfillment_cases')} f ON f.order_id=o.id JOIN ${tmp('patients')} p ON p.id=f.patient_id`,
    `INSERT IGNORE INTO ${tmp('orders')} SELECT o.* FROM orders o JOIN ${tmp('patients')} p ON p.user_id=o.user_id WHERE o.appointment_id IS NULL AND o.cashier_context IS NULL`,
    `INSERT IGNORE INTO ${tmp('fulfillment_factory_batches')} SELECT b.* FROM fulfillment_factory_batches b JOIN (SELECT batch_id, COUNT(*) n FROM ${tmp('fulfillment_factory_items')} GROUP BY batch_id) x ON x.batch_id=b.id WHERE x.n=(SELECT COUNT(*) FROM fulfillment_factory_items i WHERE i.batch_id=b.id)`,
    // 删除部分佣金后无法可靠拆分同一推广员的提现，整个该推广员流水纳入预览。
    `INSERT IGNORE INTO ${tmp('withdraw_records')} SELECT w.* FROM withdraw_records w JOIN distributors d ON w.distributor_id=d.id OR (w.distributor_id IS NULL AND w.user_id=d.user_id) JOIN ${tmp('distribution_orders')} x ON x.distributor_id=d.id`,
    `INSERT IGNORE INTO ${tmp('distribution_orders')} SELECT d.* FROM distribution_orders d JOIN distributors p ON p.id=d.distributor_id JOIN ${tmp('withdraw_records')} w ON w.distributor_id=p.id OR (w.distributor_id IS NULL AND w.user_id=p.user_id)`
   ]) {const [r]=await conn.query(sql);changed ||= r.affectedRows>0;}
  }
  const affected=[];const hash=crypto.createHash('sha256');hash.update(JSON.stringify(ids));
  for(const t of tables){const [rows]=await conn.query(`SELECT ${pk(t).map(quote).join(',')} FROM ${tmp(t)} ORDER BY ${pk(t).map(quote).join(',')}`);if(rows.length){affected.push({table:t,label:labels[t]||t,count:rows.length});hash.update(t+JSON.stringify(rows));}}
  const fingerprint=hash.digest('hex');
  const updates=[];
  // 禁止通过数据库级联触及未开放的系统表。仅解除用户的自建患者引用。
  for(const e of edges.filter(e=>tables.includes(e.p)&&!tables.includes(e.t))){
   const [[r]]=await conn.query(`SELECT COUNT(*) n FROM ${quote(e.t)} c JOIN ${tmp(e.p)} p ON c.${quote(e.c)}=p.${quote(e.pc)}`);
   if(Number(r.n)){
    if(e.t==='users'&&e.c==='self_patient_id')updates.push({table:e.t,column:e.c,count:Number(r.n),label:'解除患者账号的本人档案关联'});
    else throw fail(`关联到受保护表 ${e.t}，已停止清理`,409);
   }
  }
  for(const e of edges.filter(e=>nullOnly.has(e.t+'.'+e.c))){const [[r]]=await conn.query(`SELECT COUNT(*) n FROM ${quote(e.t)} c JOIN ${tmp(e.p)} p ON c.${quote(e.c)}=p.${quote(e.pc)}`);if(Number(r.n))updates.push({table:e.t,column:e.c,count:Number(r.n),label:e.c==='device_product_id'?'解除诊疗设备的商品引用，保留诊疗记录':'解除预约的评估引用'});}
  if(affected.some(t=>t.table==='patients'))updates.push({table:'users',label:'保留登录账号，清零关联账号积分；会员与优惠券使用记录随患者清理',count:0});
  if(affected.some(t=>t.table==='appointments'))updates.push({table:'doctor_schedules',label:'重算相关排班的预约占用',count:0});
  if(affected.some(t=>t.table==='distribution_orders'))updates.push({table:'distributors',label:'重算涉及推广员的佣金余额；其完整佣金和提现流水已纳入清理',count:0});
  if(affected.some(t=>['orders','appointment_charges'].includes(t.table)))updates.push({table:'user_memberships',label:'按剩余消费重算相关账号会员等级，保留人工设置的等级',count:0});
  if(affected.some(t=>t.table==='order_items'))updates.push({table:'products',label:'重算相关商品销量，保留库存',count:0});
  if(ids.includes('community'))updates.push({table:'community_posts',label:'保留文章，重算互动计数',count:0});
  const digest=crypto.createHash('sha256').update(fingerprint+JSON.stringify(updates)).digest('hex');
  const [[databaseRow]]=await conn.query('SELECT DATABASE() AS name');
  const result={database:databaseRow.name,groups:ids,tables:affected,updates,total:affected.reduce((n,t)=>n+t.count,0),fingerprint:digest};
  if(!execute){await conn.rollback();return result;}
  if(!result.total)throw fail('没有可清理的记录，请重新选择业务',409);
  if(digest!==expectedHash)throw fail('业务数据已变化，请重新预览并确认清理范围',409);
  for(const e of edges.filter(e=>tables.includes(e.p))){
   const col=columns.get(e.t)?.find(c=>c.c===e.c);
   if(col?.n!=='YES')continue;
   if(tables.includes(e.t))await conn.query(`UPDATE ${quote(e.t)} c JOIN ${tmp(e.p)} p ON c.${quote(e.c)}=p.${quote(e.pc)} SET c.${quote(e.c)}=NULL`);
   else if(e.t==='users'&&e.c==='self_patient_id')await conn.query(`UPDATE users c JOIN ${tmp(e.p)} p ON c.self_patient_id=p.id SET c.self_patient_id=NULL`);
  }
  const remaining=new Set(tables);const order=[];
  while(remaining.size){const leaf=[...remaining].find(p=>!edges.some(e=>e.p===p&&remaining.has(e.t)&&e.t!==p&&columns.get(e.t)?.find(c=>c.c===e.c)?.n!=='YES'));if(!leaf)throw fail('存在不可清理的循环关联，已回滚',409);order.push(leaf);remaining.delete(leaf);}
  for(const t of order)await conn.query(`DELETE c FROM ${quote(t)} c JOIN ${tmp(t)} p ON ${join(t,'c','p')}`);
  await conn.query(`UPDATE doctor_schedules s JOIN (SELECT DISTINCT schedule_id FROM ${tmp('appointments')}) x ON x.schedule_id=s.id SET s.booked_slots=(SELECT COUNT(*) FROM appointments a WHERE a.schedule_id=s.id AND a.status IN ('pending_payment','pending','confirmed','checked_in','arrived'))`);
  await conn.query(`UPDATE distributors d SET d.total_commission=(SELECT COALESCE(SUM(commission_amount),0) FROM distribution_orders WHERE distributor_id=d.id AND status!='refunded'), d.available_commission=(SELECT COALESCE(SUM(commission_amount),0) FROM distribution_orders WHERE distributor_id=d.id AND status='settled'), d.withdrawn_amount=0 WHERE EXISTS(SELECT 1 FROM ${tmp('distribution_orders')} x WHERE x.distributor_id=d.id) OR EXISTS(SELECT 1 FROM ${tmp('withdraw_records')} w WHERE w.distributor_id=d.id OR (w.distributor_id IS NULL AND w.user_id=d.user_id))`);
  await conn.query(`UPDATE products p JOIN (SELECT DISTINCT product_id FROM ${tmp('order_items')}) x ON x.product_id=p.id SET p.sales_count=(SELECT COALESCE(SUM(i.quantity),0) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=p.id AND o.status IN ('paid','processing','shipping','shipped','delivered','completed'))`);
  await conn.query(`UPDATE users u JOIN (SELECT DISTINCT user_id FROM ${tmp('patients')}) x ON x.user_id=u.id SET u.points=0`);
  if(ids.includes('community'))await conn.query('UPDATE community_posts p SET p.likes_count=(SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id=p.id), p.comments_count=(SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id), p.favorites_count=(SELECT COUNT(*) FROM community_post_favorites f WHERE f.post_id=p.id), p.views_count=(SELECT COUNT(*) FROM community_post_views v WHERE v.post_id=p.id), p.shares_count=0');
  const [membershipUsers]=await conn.query(`SELECT DISTINCT x.user_id FROM (SELECT user_id FROM ${tmp('orders')} UNION SELECT user_id FROM ${tmp('appointments')}) x LEFT JOIN ${tmp('patients')} p ON p.user_id=x.user_id WHERE p.id IS NULL`);
  for(const user of membershipUsers)await syncUserMembership(user.user_id,conn,'temporary_cleanup');
  await conn.execute("INSERT INTO audit_logs(admin_id,action,target_type,details,status,ip_address) VALUES(?,'temporary_runtime_cleanup','system',?,'success',?)",[actor.id,JSON.stringify(result),actor.ip||null]);
  await conn.commit();return result;
 }catch(e){await conn.rollback();throw e;}finally{await conn.end();}
}

export function installTemporaryRuntimeCleanup(app, authenticateToken) {
 const gate=(req,res,next)=>{if(req.user.role!=='super_admin')return res.status(403).json({code:403,message:'仅超级管理员可清理运行数据'});next();};
 const wrap=fn=>async(req,res)=>{try{res.json({code:200,data:await fn(req)});}catch(e){res.status(e.statusCode||500).json({code:e.statusCode||500,message:e.statusCode?e.message:'清理结果未确认，请重新预览核对并检查服务日志'});if(!e.statusCode)console.error('Temporary cleanup failed:',e);}};
 app.get('/api/admin/database/temporary-cleanup',authenticateToken,gate,wrap(async()=>({groups:groups.map(({tables,...g})=>g)})));
 app.post('/api/admin/database/temporary-cleanup/preview',authenticateToken,gate,wrap(async req=>{
  const result=await runCleanupPlan(req.body.groups);
  for(const [k,p] of plans)if(p.expires<Date.now()||p.user===req.user.id)plans.delete(k);
  const token=crypto.randomBytes(32).toString('hex');plans.set(token,{user:req.user.id,groups:result.groups,hash:result.fingerprint,expires:Date.now()+5*60*1000});return {...result,token};
 }));
 app.post('/api/admin/database/temporary-cleanup/execute',authenticateToken,gate,wrap(async req=>{
  if(req.body.confirmation!=='确认清理')throw fail('请输入“确认清理”');
  const plan=plans.get(req.body.token);if(!plan||plan.user!==req.user.id||plan.expires<Date.now())throw fail('预览已失效，请重新预览',409);
  plans.delete(req.body.token);
  return runCleanupPlan(plan.groups,true,plan.hash,{id:req.user.id,ip:req.ip});
 }));
}
