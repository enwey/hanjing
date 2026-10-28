import {esc,btn,action,kv,empty} from './ui.js';
import {appointmentActions} from './appointment-detail.js';
const active=['pending_payment','pending','confirmed','reminded','checked_in'];
const statuses={pending_payment:'待支付',pending:'待确认',confirmed:'已确认',reminded:'待就诊',checked_in:'已签到',completed:'已完成',cancelled:'已取消',no_show:'已爽约',refunded:'已退款'};
export function appointmentCard(a,settings={}){
 const rules=appointmentActions(a,settings),show=a.status==='pending_payment'||(a.status==='pending'&&rules.canChange);
 const fields=[['门店',a.storeName||a.store_name||'—'],['就诊人',a.patientName||a.patient_name||'—'],['医生',a.doctorName||a.doctor_name||'—'],['时间',`${a.appointmentDate||a.appointment_date||''} ${a.appointmentTime||a.appointment_time||''}`],['类型',({first:'初诊',followup:'复诊',adjust:'调整'})[a.type]||'门诊预约']];
 if(a.symptomDesc||a.symptom_desc)fields.push(['主诉',a.symptomDesc||a.symptom_desc]);
 return `<article class="appointment-list-card"><header><span>${esc(a.appointmentNo||a.appointment_no||'APT'+a.id)}</span><strong class="appointment-list-status state-${esc(a.status)}">${esc(statuses[a.status]||'待确认')}</strong></header>${kv(fields)}<footer>${btn('查看详情','appointment',{id:a.id})}${show?(a.status==='pending_payment'?'':btn('改约','booking',{id:a.id}))+action('取消','cancel-appointment',`data-appointment-id="${esc(a.id)}"`):''}</footer></article>`;
}
export function appointmentList(c){
 const tab=c.appointmentTab==='history'?'history':'upcoming';
 const rows=c.appointments.filter(a=>active.includes(a.status)===(tab==='upcoming'));
 return `<div class="appointment-list-tabs" role="group" aria-label="预约记录分组">${[['upcoming','进行中'],['history','历史记录']].map(([key,label])=>action(label,'appointment-tab',`data-tab="${key}" aria-pressed="${tab===key}"`)).join('')}</div><div class="appointment-list-grid">${rows.length?rows.map(a=>appointmentCard(a,c.bookingSettings)).join(''):empty(tab==='upcoming'?'暂无进行中的预约':'暂无历史预约',tab==='upcoming'?btn('去预约','stores'):'')}</div>`;
}
