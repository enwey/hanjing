import { get, query } from './db.js';
const defaultDB = { get, query };

// Prefer an explicit consultation link. Legacy cases are inferred only when
// exactly one record existed at creation; never silently choose today's latest.
export async function resolveFulfillmentMedicalRecord(c, db = defaultDB) {
  const { get, query } = db;
  if (c.medical_record_id) {
    return get('SELECT * FROM medical_records WHERE id=? AND patient_id=?', [c.medical_record_id, c.patient_id]);
  }
  const order = await get('SELECT appointment_id FROM orders WHERE id=?', [c.order_id]);
  const records = order?.appointment_id
    ? await query('SELECT * FROM medical_records WHERE appointment_id=? AND patient_id=?', [order.appointment_id, c.patient_id])
    : await query('SELECT * FROM medical_records WHERE patient_id=? AND created_at<=? ORDER BY id DESC LIMIT 2', [c.patient_id, c.created_at]);
  return records.length === 1 ? records[0] : null;
}

export async function readFulfillmentClinical(c, db = defaultDB) {
  const { get, query } = db;
  const record = await resolveFulfillmentMedicalRecord(c, db);
  const appointment = record?.appointment_id
    ? await get('SELECT * FROM appointments WHERE id=? AND patient_id=?', [record.appointment_id, c.patient_id]) : null;
  const medicalRecord = record ? await get(`SELECT m.*, d.name AS doctor_name, d.title AS doctor_title, s.name AS store_name
    FROM medical_records m LEFT JOIN doctors d ON d.id=m.doctor_id LEFT JOIN stores s ON s.id=m.store_id WHERE m.id=?`, [record.id]) : null;
  // Only the treatment explicitly bound to this record supplies device settings.
  const treatments = record ? await query(`SELECT * FROM treatment_records WHERE patient_id=? AND
    (medical_record_id=? OR id IN (SELECT treatment_id FROM device_adjustments WHERE medical_record_id=?)) ORDER BY id`,
    [c.patient_id, record.id, record.id]) : [];
  for (const treatment of treatments) {
    treatment.patient_device = treatment.patient_device_id
      ? await get('SELECT * FROM patient_devices WHERE id=? AND patient_id=?', [treatment.patient_device_id, c.patient_id]) : null;
    treatment.adjustments = await query(`SELECT a.*, d.name AS operator_name FROM device_adjustments a
      LEFT JOIN doctors d ON d.id=a.operator_id WHERE a.treatment_id=? ORDER BY a.adjust_date DESC,a.id DESC`, [treatment.id]);
    treatment.logs = treatment.patient_device_id ? await query(`SELECT date,wear_duration,comfort FROM wearing_logs
      WHERE patient_device_id=? AND source='mini_program_checkin' ORDER BY date DESC LIMIT 30`, [treatment.patient_device_id]) : [];
  }
  const [preExam, ess, snore] = await Promise.all([
    appointment ? get('SELECT * FROM appointment_pre_exams WHERE appointment_id=?', [appointment.id]) : null,
    appointment?.ess_assessment_id ? get('SELECT * FROM ess_assessments WHERE id=? AND patient_id=?', [appointment.ess_assessment_id, c.patient_id]) : null,
    appointment?.snore_assessment_id ? get('SELECT * FROM snore_assessments WHERE id=? AND patient_id=?', [appointment.snore_assessment_id, c.patient_id]) : null
  ]);
  return { medical_record: medicalRecord, treatments, appointment, pre_exam: preExam, ess_report: ess, snore_report: snore };
}
