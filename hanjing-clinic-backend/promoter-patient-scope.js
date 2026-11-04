// Promoter patient detail is reached from a personally referred appointment.
// A user-level referral alone never grants access to all family medical files.
export function referredPatient(promoterId, alias='p') {
  return {sql:`EXISTS(SELECT 1 FROM appointments permitted_visit WHERE permitted_visit.patient_id=${alias}.id AND permitted_visit.referral_promoter_id=?)`,params:[promoterId]};
}
export function referredMedical(promoterId, alias='r') {
  return {sql:`EXISTS(SELECT 1 FROM appointments permitted_visit WHERE permitted_visit.id=${alias}.appointment_id AND permitted_visit.patient_id=${alias}.patient_id AND permitted_visit.referral_promoter_id=?)`,params:[promoterId]};
}
export function referredDevice(promoterId, alias='pd') {
  const medical=referredMedical(promoterId,'permitted_record');
  return {sql:`EXISTS(SELECT 1 FROM medical_records permitted_record WHERE permitted_record.patient_id=${alias}.patient_id AND permitted_record.id=COALESCE(${alias}.bind_medical_record_id,(SELECT bound_record.medical_record_id FROM treatment_records bound_record WHERE bound_record.id=${alias}.bind_treatment_record_id AND bound_record.patient_id=${alias}.patient_id)) AND ${medical.sql})`,params:medical.params};
}
export function referredPatientOrder(promoterId, patientId, alias='o') {
  // Patient attribution must be explicit. Sharing a payer account is not proof.
  return {sql:`(EXISTS(SELECT 1 FROM appointments permitted_visit WHERE permitted_visit.id=${alias}.appointment_id AND permitted_visit.patient_id=? AND permitted_visit.referral_promoter_id=?) OR
    (EXISTS(SELECT 1 FROM distribution_orders permitted_commission WHERE permitted_commission.order_id=${alias}.id AND permitted_commission.distributor_id=?) AND
      (EXISTS(SELECT 1 FROM appointments order_visit WHERE order_visit.id=${alias}.appointment_id AND order_visit.patient_id=?) OR
       (${alias}.appointment_id IS NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(${alias}.cashier_context) THEN ${alias}.cashier_context ELSE NULL END,'$.patient_id')) AS UNSIGNED)=?))))`,params:[patientId,promoterId,promoterId,patientId,patientId]};
}
