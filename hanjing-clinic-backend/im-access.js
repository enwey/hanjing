import { get } from './db.js';
const missing=()=>Object.assign(new Error('就诊人不存在或无权访问'),{statusCode:404});
// Family conversations require a live link AND patient ownership. A removed link
// cannot keep access merely because patients.user_id is preserved for history.
export async function resolveImPatient(userId, rawPatientId, conn = null) {
 const read=async(sql,params)=>conn?(await conn.execute(sql,params))[0][0]:get(sql,params);
 const lock=conn?' FOR UPDATE':'';
 if(rawPatientId != null && rawPatientId !== '' && rawPatientId !== 'pat-self') {
  if(!/^\d+$/.test(String(rawPatientId)) || !Number.isSafeInteger(Number(rawPatientId)) || Number(rawPatientId)<1)throw missing();
  const row=await read(`SELECT p.id,p.name,p.user_id FROM patients p LEFT JOIN user_patient_links l ON l.patient_id=p.id AND l.user_id=p.user_id WHERE p.id=? AND p.user_id=? AND (l.id IS NOT NULL OR p.relation='self')${lock}`,[rawPatientId,userId]);
  if(!row)throw missing();return row;
 }
 const row=await read(`SELECT p.id,p.name,p.user_id FROM users u JOIN patients p ON p.id=u.self_patient_id AND p.user_id=u.id WHERE u.id=?${lock}`,[userId]) || await read(`SELECT id,name,user_id FROM patients WHERE user_id=? AND relation='self' ORDER BY id LIMIT 1${lock}`,[userId]);
 if(!row)throw missing();return row;
}
export function validateImText(value) {
 if(typeof value!=='string' || !value.trim() || value.length>10000)throw Object.assign(new Error('消息内容不能为空且不能超过10000字'),{statusCode:400});
 return value.trim();
}
