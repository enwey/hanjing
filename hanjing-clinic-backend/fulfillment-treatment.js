import { lockFulfillmentCase } from './fulfillment-guard.js';
import { resolveFulfillmentMedicalRecord } from './fulfillment-clinical.js';
const fail = (message, statusCode=400) => { throw Object.assign(new Error(message), {statusCode}); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

// Caller owns the transaction: device, treatment, follow-up and fulfillment commit together.
export async function completeFittingTreatment(conn, caseId, body, actorId) {
  const c = await lockFulfillmentCase(conn, caseId);
  if (c.status !== 'ready_for_fitting') fail('交付状态已变化，请刷新后确认是否待试戴',409);
  if (!c.technician_id) fail('履约单未分配技师');
  const advancement = body.initial_advancement;
  if (advancement === '' || advancement == null || typeof advancement === 'boolean' || !Number.isFinite(Number(advancement)) || Number(advancement)<0 || Number(advancement)>15) fail('初始前移量必须在0至15mm之间');
  if (!validDate(body.start_date)) fail('请选择有效的治疗启动日期');
  const next = body.next_adjust_date || null;
  if (next && (!validDate(next) || next < body.start_date)) fail('下次复诊日期不能早于治疗启动日期');
  if (!Number.isSafeInteger(Number(body.device_product_id)) || Number(body.device_product_id)<=0) fail('请选择订单中的设备');
  const [[product]] = await conn.execute(`SELECT p.id, oi.product_name AS name, oi.product_image AS image_url, oi.price, p.description
    FROM order_items oi JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id=? AND p.id=? AND COALESCE(oi.product_category_snapshot,p.category)='device' ORDER BY oi.id LIMIT 1`,[c.order_id,body.device_product_id]);
  if (!product) fail('所选设备不属于当前交付订单');
  const db = {get:async(sql,params)=>(await conn.execute(sql,params))[0][0],query:async(sql,params)=>(await conn.execute(sql,params))[0]};
  const record = await resolveFulfillmentMedicalRecord(c,db);
  if (!record) fail('交付单未关联明确的门诊病历，请先核对病历关联');
  const [[patient]] = await conn.execute('SELECT id,user_id FROM patients WHERE id=? FOR UPDATE',[c.patient_id]);
  if (!patient) fail('患者档案不存在',404);
  // Only reuse an active legacy record belonging to this exact consultation and product.
  const [existing] = await conn.execute(`SELECT * FROM treatment_records WHERE patient_id=? AND medical_record_id=? AND device_product_id=? AND status='active' FOR UPDATE`,[c.patient_id,record.id,product.id]);
  if (existing.length>1) fail('存在多个匹配的治疗档案，请先核对设备绑定',409);
  let treatmentId=existing[0]?.id, deviceId=existing[0]?.patient_device_id;
  if (body.patient_device_id && Number(body.patient_device_id)!==Number(deviceId)) fail('所选患者设备与交付病历及商品不一致');
  if (treatmentId) {
    const [fitted] = await conn.execute('SELECT id FROM fulfillment_fittings WHERE patient_device_id=? LIMIT 1',[deviceId || null]);
    if (fitted.length) fail('该设备已完成交付，请核对交付单',409);
    const [adjustments]=await conn.execute('SELECT id FROM device_adjustments WHERE treatment_id=? LIMIT 1',[treatmentId]);
    if(adjustments.length) fail('该治疗档案已有复诊微调记录，不能重新登记初次试戴',409);
    const [[device]] = await conn.execute('SELECT * FROM patient_devices WHERE id=? FOR UPDATE',[deviceId || null]);
    if (!device || Number(device.patient_id)!==Number(c.patient_id) || Number(device.bind_treatment_record_id)!==Number(treatmentId) || Number(device.device_product_id)!==Number(product.id) || Number(device.bind_medical_record_id)!==Number(record.id) || device.status!=='active') fail('已有治疗档案的设备绑定不一致',409);
  }
  await conn.execute("UPDATE treatment_records SET status='paused' WHERE patient_id=? AND status='active' AND id<>?",[c.patient_id,treatmentId || 0]);
  await conn.execute("UPDATE patient_devices SET status='replaced' WHERE patient_id=? AND status='active' AND id<>?",[c.patient_id,deviceId || 0]);
  const name=product.name, model=product.name.slice(0,100), image=product.image_url || null, price=product.price || 0, description=product.description || null, value=Number(advancement);
  if (!treatmentId) {
    const [tr]=await conn.execute(`INSERT INTO treatment_records
      (patient_id,doctor_id,medical_record_id,device_product_id,device_product_name,device_product_image_url,device_product_price,device_product_description,device_model,initial_advancement,current_advancement,start_date,next_adjust_date,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,[c.patient_id,record.doctor_id,record.id,product.id,name,image,price,description,model,value,value,body.start_date,next]);
    treatmentId=tr.insertId;
    const [pd]=await conn.execute(`INSERT INTO patient_devices
      (patient_id,bind_treatment_record_id,bind_medical_record_id,bind_doctor_id,device_product_id,device_name_snapshot,device_image_snapshot,device_price_snapshot,device_description_snapshot,device_model,initial_advancement,current_advancement,bound_at,next_adjust_date,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,[c.patient_id,treatmentId,record.id,record.doctor_id,product.id,name,image,price,description,model,value,value,body.start_date,next]);
    deviceId=pd.insertId;
    await conn.execute('UPDATE treatment_records SET patient_device_id=? WHERE id=?',[deviceId,treatmentId]);
  } else {
    await conn.execute('UPDATE treatment_records SET initial_advancement=?,current_advancement=?,start_date=?,next_adjust_date=? WHERE id=?',[value,value,body.start_date,next,treatmentId]);
    await conn.execute('UPDATE patient_devices SET initial_advancement=?,current_advancement=?,bound_at=?,next_adjust_date=? WHERE id=?',[value,value,body.start_date,next,deviceId]);
  }
  const [[doctor]]=await conn.execute('SELECT name FROM doctors WHERE id=?',[record.doctor_id]);
  await conn.execute(`INSERT INTO treatment_timelines(user_id,patient_id,treatment_id,event_date,event_title,event_desc,event_type,doctor_name,color,icon)
    VALUES(?,?,?,?,?,?,'milestone',?,'#3B6BF5','device')`,[patient.user_id,c.patient_id,treatmentId,body.start_date,'完成首次佩戴交付',`绑定设备：${name}，初始前伸量 ${value}mm`,doctor?.name || '']);
  if(next) await conn.execute(`INSERT INTO follow_up_tasks(patient_id,follower_id,title,description,due_date,status)
    VALUES(?,?,?,?,?,'pending')`,[c.patient_id,actorId,'阻鼾器物理微调复查',`交付单 #${c.id}：${name}，初始前伸量 ${value}mm`,next]);
  await conn.execute(`UPDATE fulfillment_cases SET status='fitted',medical_record_id=? WHERE id=?`,[record.id,c.id]);
  await conn.execute(`INSERT INTO fulfillment_fittings(fulfillment_case_id,technician_id,patient_device_id,note) VALUES(?,?,?,?)`,[c.id,c.technician_id,deviceId,body.note || null]);
  await conn.execute(`INSERT INTO fulfillment_events(fulfillment_case_id,actor_id,event_type,detail) VALUES(?,?,'fitting_completed',?)`,[c.id,actorId,JSON.stringify({patient_device_id:deviceId,treatment_id:treatmentId,initial_advancement:value,start_date:body.start_date,next_adjust_date:next})]);
  return {patient_device_id:deviceId,treatment_id:treatmentId};
}
