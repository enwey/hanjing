import { get, query } from './db.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const date = value => value instanceof Date ? new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit' }).format(value) : String(value || '').slice(0,10);
const money = cents => `¥${(Number(cents || 0)/100).toFixed(2)}`;
const field = (label,value) => ({label,value:value == null || value === '' ? '—' : String(value)});
const section = (title,fields) => ({title,fields});
const unavailable = () => { throw Object.assign(new Error('关联内容已不存在或您无权查看'),{statusCode:404}); };
const action = (label,path) => ({label,path});
const statusText = (status,map) => map[status] || '处理中';
const refundStates = {pending:'等待处理',processing:'退款处理中',refunding:'退款处理中',success:'退款成功',refunded:'退款成功',failed:'退款异常',abnormal:'退款异常',closed:'退款关闭',rejected:'申请未通过',refund_pending:'等待审核'};

// Patient-facing projection only: do not return raw medical/CRM/payment rows.
// Re-check business ownership even though the caller has checked notification ownership.
export async function getNotificationBusinessDetail(userId, notification, db = {get,query}) {
  const kind=notification.business_type,id=notification.business_id;
  if (!kind || !id) return null;
  const detail={title:'相关详情',sections:[],actions:[]};
  if(kind==='appointment') {
    const row=await db.get('SELECT a.*,p.name patient_name FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.id=? AND a.user_id=?',[id,userId]);
    if(!row) return unavailable();
    const refunds=await db.query(`SELECT r.id,r.refund_no,r.amount,r.status,r.reason,r.refunded_at,c.charge_no FROM appointment_charge_refunds r JOIN appointment_charges c ON c.id=r.charge_id WHERE c.appointment_id=? ORDER BY r.id DESC`,[id]);
    const oldOrders=await db.query('SELECT order_no,status,pay_amount,refund_at,shipping_address,wechat_refund_no FROM orders WHERE appointment_id=? AND user_id=? ORDER BY id DESC',[id,userId]);
    detail.title='预约收费详情';
    detail.sections.push(section('预约信息',[field('就诊人',row.patient_name),field('预约编号',row.appointment_no),field('就诊时间',`${date(row.appointment_date)} ${row.appointment_time || ''}`)]));
    for(const r of refunds) detail.sections.push(section('预约退款',[field('退款编号',r.refund_no),field('退款金额',money(r.amount)),field('当前状态',statusText(r.status,refundStates)),field('退款原因',r.reason),field('完成日期',date(r.refunded_at))]));
    for(const order of oldOrders) { const address=parse(order.shipping_address); if(order.refund_at || order.wechat_refund_no || address.refund_applied_at) detail.sections.push(orderRefund(order)); }
    if(!refunds.length && !detail.sections.some(s=>s.title==='订单退款')) detail.sections.push(section('收费信息',[field('挂号费',money(row.consult_fee)),field('预约定金',money(row.deposit_amount))]));
  } else if(kind==='order') {
    const row=await db.get('SELECT * FROM orders WHERE id=? AND user_id=?',[id,userId]);if(!row)return unavailable();
    const address=parse(row.shipping_address);
    if(!row.refund_at && !row.wechat_refund_no && !address.refund_applied_at && !String(notification.event_code || '').includes('refund') && !String(notification.title || '').includes('退款')) return null;
    detail.title='退款详情';detail.sections.push(orderRefund(row,notification));
  } else if(['medical','treatment','after_sale','followup','message'].includes(kind)) {
    const table={medical:'medical_records',treatment:'treatment_records',after_sale:'after_sales_tickets',followup:'follow_up_tasks',message:'im_messages'}[kind];
    const row=await db.get(`SELECT b.*,p.name patient_name,p.user_id FROM ${table} b JOIN patients p ON p.id=b.patient_id WHERE b.id=? AND p.user_id=?`,[id,userId]);if(!row)return unavailable();
    const person=field('就诊人',row.patient_name);
    if(kind==='medical') {
      detail.title='本次病历';detail.sections.push(section('就诊信息',[person,field('就诊日期',date(row.visit_date))]),section('诊疗内容',[field('诊断',row.diagnosis),field('处方／方案',row.prescription),field('医嘱',row.doctor_advice)]));
    } else if(kind==='treatment') {
      detail.title='治疗方案详情';detail.sections.push(section('当前方案',[person,field('设备',row.device_product_name || row.device_model),field('当前前移量',`${row.current_advancement ?? '—'} mm`),field('开始日期',date(row.start_date)),field('下次复诊',date(row.next_adjust_date)),field('状态',statusText(row.status,{active:'治疗中',completed:'已完成',paused:'已暂停',cancelled:'已取消'}))]));
      detail.actions.push(action('预约复诊','/pages/appointment/booking/index'));
    } else if(kind==='after_sale') {
      detail.title='售后详情';detail.sections.push(section('售后进度',[person,field('问题说明',row.description),field('当前状态',statusText(row.status,{pending:'已受理',assigned:'已安排处理',processing:'处理中',resolved:'已处理完成',completed:'已处理完成',closed:'已关闭',rejected:'未通过'})),field('处理结果',row.resolution),field('完成日期',date(row.resolved_at))]));
      // Internal technician notes and assignment identities are deliberately excluded.
    } else if(kind==='followup') {
      detail.title='随访安排';detail.sections.push(section('安排详情',[person,field('随访事项',row.title),field('计划日期',date(row.due_date)),field('当前状态',statusText(row.status,{pending:'待随访',completed:'已完成',cancelled:'已取消',overdue:'待联系'}))]));
      if(row.status!=='cancelled')detail.actions.push(action('预约就诊','/pages/appointment/booking/index'));
    } else {
      detail.title='服务回复';detail.sections.push(section('回复内容',[person,field('服务人员',row.sender_name || '诊所客服'),field('回复日期',date(row.created_at))]));
      const text=String(row.text || '');
      if(text.startsWith('[image]')) {
        const src=text.slice(7);
        if(/^https:\/\//i.test(src) || /^\/uploads\//.test(src))detail.image=src;
        else detail.sections.push(section('消息',[field('内容','图片消息暂无法查看，请联系门店。')]));
      } else detail.sections.push(section('消息',[field('内容',text)]));
      const self=await db.get('SELECT self_patient_id FROM users WHERE id=?',[userId]);
      if(String(self?.self_patient_id)===String(row.patient_id))detail.actions.push(action('继续咨询','/pages/profile/online-service/index'));
      else {
        const linked=await db.get('SELECT p.id FROM patients p JOIN user_patient_links l ON l.patient_id=p.id AND l.user_id=p.user_id WHERE p.id=? AND p.user_id=?',[row.patient_id,userId]);
        if(!linked)return unavailable();
        detail.actions.push(action('继续咨询','/pages/profile/online-service/index?patientId='+row.patient_id));
      }
    }
  } else if(kind==='report') {
    const row=await db.get('SELECT * FROM community_reports WHERE id=? AND user_id=?',[id,userId]);if(!row)return unavailable();
    detail.title='举报处理详情';detail.sections.push(section('处理进度',[field('举报原因',row.reason),field('提交日期',date(row.created_at)),field('当前状态',statusText(row.status,{pending:'待处理',processing:'处理中',resolved:'已处理',rejected:'未采纳',dismissed:'未采纳',closed:'已处理',processed:'已处理'})),field('处理结论',row.result_text || (row.status==='pending'?'等待审核处理':'暂无公开处理说明')),field('处理日期',date(row.handled_at))]));
  } else return null;
  return detail;
}

function orderRefund(row,notification) {
  const address=parse(row.shipping_address);
  const state=address.refund_rejected_at?'申请未通过':row.status==='refunding' && notification?.event_code==='refund_failed'?'退款异常，等待核对':statusText(row.status,refundStates);
  return section('订单退款',[field('订单编号',row.order_no),field('退款编号',row.wechat_refund_no),field('申请金额',money(row.pay_amount)),field('当前状态',state),field('退款原因',address.refund_reason),field('完成日期',date(row.refund_at))]);
}
