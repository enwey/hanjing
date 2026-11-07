import { notifyBusiness } from './notification-center.js';

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// The caller locks the patient and ticket and commits the whole resolution atomically.
export async function completeAfterSalesAdjustment(conn, ticket, body, actorId) {
  const value = body.adjusted_advancement;
  if (value === '' || value == null || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 15 || Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) > 0.000001) fail('下颌前移量须为0至15mm，最多两位小数');
  if (typeof body.needs_follow_up !== 'boolean') fail('请选择继续复查或无需再复查');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const next = body.needs_follow_up ? body.next_adjust_date : null;
  if (body.needs_follow_up && (!validDate(next) || next <= today)) fail('下次复查日期须晚于今天');
  if (!body.needs_follow_up && body.next_adjust_date) fail('无需再复查时不能设置下次日期');
  if (!ticket.patient_device_id) fail('工单未关联患者设备，请先核对设备绑定', 409);
  const [[device]] = await conn.execute('SELECT * FROM patient_devices WHERE id=? AND patient_id=? FOR UPDATE', [ticket.patient_device_id, ticket.patient_id]);
  if (!device || device.status !== 'active') fail('该设备已停用或更换，不能继续微调', 409);
  const [[treatment]] = await conn.execute('SELECT * FROM treatment_records WHERE id=? AND patient_id=? FOR UPDATE', [device.bind_treatment_record_id, ticket.patient_id]);
  if (!treatment || treatment.status !== 'active' || Number(treatment.patient_device_id) !== Number(device.id)) fail('设备治疗档案已变化，请刷新后核对', 409);
  if (body.expected_advancement === undefined || Number(body.expected_advancement) !== Number(device.current_advancement)) fail('设备参数已被调整，请刷新后重新确认', 409);
  const [[actor]] = await conn.execute('SELECT id,name,username FROM admin_users WHERE id=?', [actorId]);
  const operator = actor?.name || actor?.username;
  if (!operator) fail('操作账号不存在', 409);
  const [adjustment] = await conn.execute(`INSERT INTO device_adjustments
    (patient_device_id,treatment_id,adjust_date,operator_id,operator_admin_id,operator_name_snapshot,adjusted_advancement,instructions)
    VALUES(?,?,?,NULL,?,?,?,?)`, [device.id,treatment.id,today,actorId,operator,Number(value),body.resolution.trim()]);
  await conn.execute('UPDATE patient_devices SET current_advancement=?,next_adjust_date=? WHERE id=?', [Number(value),next,device.id]);
  await conn.execute('UPDATE treatment_records SET current_advancement=?,next_adjust_date=? WHERE id=?', [Number(value),next,treatment.id]);
  const [[patient]] = await conn.execute('SELECT user_id FROM patients WHERE id=?', [ticket.patient_id]);
  await conn.execute(`INSERT INTO treatment_timelines(user_id,patient_id,treatment_id,event_date,event_title,event_desc,event_type,doctor_name,color,icon)
    VALUES(?,?,?,?,'设备参数调整',?,'adjust',?,'#F59E0B','adjust')`, [patient.user_id,ticket.patient_id,treatment.id,today,`前移量由 ${device.current_advancement}mm 调整至 ${Number(value)}mm；${body.resolution.trim()}`,operator]);
  let nextTicketId = null;
  if (next) {
    const [followup] = await conn.execute(`INSERT INTO follow_up_tasks(patient_id,follower_id,title,description,due_date,status)
      VALUES(?,?,?,?,?,'pending')`, [ticket.patient_id,ticket.assigned_technician_id,'阻鼾器物理微调复查',`售后工单 #${ticket.id}：${device.device_name_snapshot || device.device_model}，前移量 ${Number(value)}mm`,next]);
    const [created] = await conn.execute(`INSERT INTO after_sales_tickets
      (fulfillment_case_id,patient_id,patient_device_id,assigned_technician_id,created_by,issue_type,description,status,next_service_date,follow_up_task_id,parent_ticket_id)
      VALUES(?,?,?,?,?,'微调复查',?,'assigned',?,?,?)`, [ticket.fulfillment_case_id,ticket.patient_id,device.id,ticket.assigned_technician_id,actorId,`继续微调复查，当前下颌前移量 ${Number(value)}mm`,next,followup.insertId,ticket.id]);
    nextTicketId = created.insertId;
    await notifyBusiness(conn, 'followup', followup.insertId, 'scheduled');
  }
  const snapshot = { before_advancement: Number(device.current_advancement), adjusted_advancement: Number(value), adjusted_date: today, operator_id: actorId, operator_name: operator, needs_follow_up: body.needs_follow_up, next_adjust_date: next, next_ticket_id: nextTicketId };
  await conn.execute('UPDATE after_sales_tickets SET adjustment_id=?,adjustment_snapshot=? WHERE id=?', [adjustment.insertId,JSON.stringify(snapshot),ticket.id]);
  await notifyBusiness(conn, 'treatment', treatment.id, 'updated');
  return { adjustment_id: adjustment.insertId, next_ticket_id: nextTicketId };
}
