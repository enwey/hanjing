import { writeNotification } from './notification-center.js';
import { randomUUID } from 'node:crypto';

const day = value => value instanceof Date
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)
  : String(value || '').slice(0, 10);

async function appointmentContext(conn, appointment) {
  const [[patient]] = await conn.execute('SELECT name FROM patients WHERE id=?', [appointment.patient_id]);
  return `${patient?.name || '就诊人'}，${appointment.store_name || '预约门店'}，${appointment.doctor_name || '预约医生'}，${day(appointment.appointment_date)} ${appointment.appointment_time}。`;
}

export async function notifyAppointmentStatus(conn, appointment, status, cancelReason) {
  const messages = {
    pending: ['预约待就诊', '请按预约时间到诊。'],
    confirmed: ['签到成功', '您已进入候诊队列，请留意门店叫号。'],
    waiting: ['进入候诊队列', '请在候诊区等待门店叫号。'],
    called: ['就诊叫号提醒', '已叫到您就诊，请前往预约医生诊室；如不清楚诊室位置，请联系门店工作人员。'],
    checked_in: ['开始接诊提醒', '请前往预约医生诊室就诊；如不清楚诊室位置，请联系门店工作人员。'],
    arrived: ['就诊结算完成', '本次就诊已完成结算。'],
    completed: ['就诊已完成', '本次就诊已完成。'],
    cancelled: ['预约已取消', '请查看预约及退款进度。'],
    no_show: ['预约已结束', '本次预约已标记为未到诊，如仍需就诊请重新预约。']
  };
  const [title, description] = messages[status] || ['预约状态更新', '请查看预约详情。'];
  if (status === 'completed') {
    const [[record]] = await conn.execute('SELECT id FROM medical_records WHERE appointment_id=? ORDER BY id DESC LIMIT 1', [appointment.id]);
    if (record) return notifyConsultationCompleted(conn, appointment, record.id);
  }
  return writeNotification(conn, {
    userId: appointment.user_id, type: 'appointment', businessType: 'appointment', businessId: appointment.id,
    event: 'status', title, content: await appointmentContext(conn, appointment) + description + (cancelReason ? `原因：${cancelReason}。` : ''),
    revision: status
  });
}

export async function notifyConsultationCompleted(conn, appointment, medicalRecordId) {
  return writeNotification(conn, {
    userId: appointment.user_id, type: 'treatment', businessType: 'medical', businessId: medicalRecordId,
    event: 'consultation_completed', onceKey: String(appointment.id), title: '就诊已完成',
    content: await appointmentContext(conn, appointment) + '本次就诊已完成，点击查看本次病历和医嘱。'
  });
}

// Archiving a schedule preserves existing bookings. Only notify when the patient's
// original place/time is affected; capacity/interval-only edits are not a cancellation.
export async function notifyScheduleImpact(conn, scheduleId, nextSchedule = null) {
  const [appointments] = await conn.execute(`SELECT * FROM appointments
    WHERE schedule_id=? AND status IN ('pending_payment','pending','confirmed','waiting','called','checked_in')
    AND TIMESTAMP(appointment_date,RIGHT(appointment_time,5)) > NOW() ORDER BY id FOR UPDATE`, [scheduleId]);
  for (const appointment of appointments) {
    const [start, end] = String(appointment.appointment_time).split('-').map(s => s.trim());
    const affected = !nextSchedule || Number(nextSchedule.store_id) !== Number(appointment.store_id)
      || start < String(nextSchedule.start_time).slice(0, 5) || end > String(nextSchedule.end_time).slice(0, 5);
    if (!affected) continue;
    await writeNotification(conn, {
      userId: appointment.user_id, type: 'appointment', businessType: 'appointment', businessId: appointment.id,
      event: 'schedule_impact', onceKey: String(scheduleId), title: nextSchedule ? '出诊安排变更提醒' : '医生停诊提醒',
      content: await appointmentContext(conn, appointment) + (nextSchedule ? '医生出诊门店或时间安排有变动。' : '该时段已调整为休息。')
        + '原预约尚未自动取消或改期，请查看预约并联系门店确认；如需变更，可办理改约或取消。'
    });
  }
}

export async function notifyAvailabilityImpact(conn, kind, id) {
  const column = kind === 'doctor' ? 'doctor_id' : 'store_id';
  const revision = randomUUID();
  const [appointments] = await conn.execute(`SELECT * FROM appointments WHERE ${column}=?
    AND status IN ('pending_payment','pending','confirmed','waiting','called','checked_in')
    AND TIMESTAMP(appointment_date,RIGHT(appointment_time,5))>NOW() ORDER BY id FOR UPDATE`, [id]);
  for (const appointment of appointments) await writeNotification(conn, {
    userId: appointment.user_id, type: 'appointment', businessType: 'appointment', businessId: appointment.id,
    event: `${kind}_unavailable`, revision, title: kind === 'doctor' ? '医生出诊安排变更' : '门店服务安排变更',
    content: await appointmentContext(conn, appointment) + (kind === 'doctor' ? '预约医生已暂停出诊。' : '预约门店已暂停服务。')
      + '原预约尚未自动取消或改期，请联系门店确认后续安排，或在预约详情办理改约、取消。'
  });
}

export async function notifyFittingDateChange(conn, fulfillmentCase, nextDate) {
  if (day(fulfillmentCase.expected_fitting_date) === day(nextDate)) return;
  const [[patient]] = await conn.execute('SELECT name FROM patients WHERE id=?', [fulfillmentCase.patient_id]);
  const [[order]] = await conn.execute('SELECT user_id FROM orders WHERE id=?', [fulfillmentCase.order_id]);
  await writeNotification(conn, {userId: order?.user_id, type:'treatment', businessType:'fulfillment', businessId:fulfillmentCase.id,
    event:'fitting_date_changed', title:'试戴安排已更新', revision:randomUUID(),
    content:`就诊人：${patient?.name || '您的家人'}。原预计试戴日期：${day(fulfillmentCase.expected_fitting_date) || '尚未安排'}；新预计试戴日期：${day(nextDate) || '待确认'}。请留意门店联系，实际到店时间以门店确认为准。`});
}

export async function notifyFollowupCompleted(conn, task) {
  const [[patient]] = await conn.execute('SELECT user_id,name FROM patients WHERE id=?', [task.patient_id]);
  await writeNotification(conn, {userId:patient?.user_id,type:'treatment',businessType:'followup',businessId:task.id,event:'completed',onceKey:String(task.id),
    title:'随访已完成',content:`就诊人：${patient?.name || '您的家人'}。${day(task.due_date)}的随访已完成，请按已沟通的安排继续复诊。`});
}
