import { dashboardScope } from './dashboard-scope.js';
function valid(alias) { if (!/^[a-z_]+$/i.test(alias)) throw new Error('Invalid SQL alias'); }
export function dataStoreScope(user, column) {
  const scope=dashboardScope(user);
  if(scope.kind==='all') return {sql:'1=1',params:[]};
  if(scope.kind==='stores') return scope.stores.length ? {sql:`${column} IN (${scope.stores.map(()=>'?').join(',')})`,params:scope.stores} : {sql:'1=0',params:[]};
  return null;
}
export function appointmentReadScope(user, alias='a') {
 valid(alias);
 const stores=dataStoreScope(user,`${alias}.store_id`); if(stores) return stores;
 return {sql:`(${alias}.doctor_id=? OR EXISTS (SELECT 1 FROM audit_logs own_log WHERE own_log.admin_id=? AND own_log.target_type='appointment' AND own_log.action='create_appointment' AND own_log.status='success' AND own_log.target_id=${alias}.id))`,params:[Number(user.doctor_id)||0,Number(user.id)||0]};
}
export function patientReadScope(user, alias='p') {
 valid(alias);
 const scope=dashboardScope(user); if(scope.kind==='all') return {sql:'1=1',params:[]};
 const appointment=appointmentReadScope(user,'own_appt');
 if(scope.kind==='self') return {sql:`(EXISTS(SELECT 1 FROM appointments own_appt WHERE own_appt.patient_id=${alias}.id AND ${appointment.sql}) OR EXISTS(SELECT 1 FROM medical_records own_mr WHERE own_mr.patient_id=${alias}.id AND own_mr.doctor_id=?) OR EXISTS(SELECT 1 FROM patient_store_registrations own_reg WHERE own_reg.patient_id=${alias}.id AND (own_reg.doctor_id=? OR own_reg.created_by=?)) OR EXISTS(SELECT 1 FROM follow_up_tasks own_task WHERE own_task.patient_id=${alias}.id AND own_task.follower_id=?) OR EXISTS(SELECT 1 FROM patient_crm_records own_crm WHERE own_crm.patient_id=${alias}.id AND own_crm.follower_id=?) OR EXISTS(SELECT 1 FROM after_sales_tickets own_ticket WHERE own_ticket.patient_id=${alias}.id AND (own_ticket.created_by=? OR own_ticket.assigned_technician_id=?)) OR EXISTS(SELECT 1 FROM fulfillment_cases own_case WHERE own_case.patient_id=${alias}.id AND (own_case.created_by=? OR own_case.technician_id=?)))`,params:[...appointment.params,Number(user.doctor_id)||0,Number(user.doctor_id)||0,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0]};
 const stores=dataStoreScope(user,'own_reg.store_id');
 return {sql:`(EXISTS(SELECT 1 FROM appointments own_appt WHERE own_appt.patient_id=${alias}.id AND ${appointment.sql}) OR EXISTS(SELECT 1 FROM patient_store_registrations own_reg WHERE own_reg.patient_id=${alias}.id AND ${stores.sql}) OR EXISTS(SELECT 1 FROM medical_records own_reg WHERE own_reg.patient_id=${alias}.id AND ${stores.sql}))`,params:[...appointment.params,...stores.params,...stores.params]};
}
export function orderReadScope(user, alias='o') {
 valid(alias);
 const scope=dashboardScope(user); if(scope.kind==='all') return {sql:'1=1',params:[]};
 const appt=appointmentReadScope(user,'own_appt');
 const base=`EXISTS(SELECT 1 FROM appointments own_appt WHERE own_appt.id=${alias}.appointment_id AND ${appt.sql})`;
 if(scope.kind==='self') return {sql:`(${base} OR EXISTS(SELECT 1 FROM audit_logs own_log WHERE own_log.admin_id=? AND own_log.target_type='order' AND own_log.action='create_cashier_order' AND own_log.status='success' AND own_log.target_id=${alias}.id) OR EXISTS(SELECT 1 FROM fulfillment_cases own_case WHERE own_case.order_id=${alias}.id AND (own_case.created_by=? OR own_case.technician_id=?)))`,params:[...appt.params,Number(user.id)||0,Number(user.id)||0,Number(user.id)||0]};
 const stores=dataStoreScope(user,`CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.shipping_address,'$.storeId')) AS UNSIGNED)`);
 return {sql:`(${base} OR (${alias}.appointment_id IS NULL AND JSON_VALID(${alias}.shipping_address) AND ${stores.sql}))`,params:[...appt.params,...stores.params]};
}

// Patient-wide information (assessments and contact history) has no store of
// its own. Its visibility follows the patient, rather than the staff member's
// current operational store assignment.
export function userReadScope(user, column) {
 const scope=patientReadScope(user,'scope_patient');
 if(dashboardScope(user).kind==='all') return scope;
 return {sql:`EXISTS(SELECT 1 FROM patients scope_patient WHERE scope_patient.user_id=${column} AND ${scope.sql})`,params:scope.params};
}
export function medicalReadScope(user, alias='m') {
 valid(alias);
 const store=dataStoreScope(user,`${alias}.store_id`); if(store) return store;
 const appt=appointmentReadScope(user,'scope_visit');
 return {sql:`(${alias}.doctor_id=? OR EXISTS(SELECT 1 FROM appointments scope_visit WHERE scope_visit.id=${alias}.appointment_id AND ${appt.sql}) OR EXISTS(SELECT 1 FROM fulfillment_cases scope_case WHERE scope_case.medical_record_id=${alias}.id AND (scope_case.created_by=? OR scope_case.technician_id=?)))`,params:[Number(user.doctor_id)||0,...appt.params,Number(user.id)||0,Number(user.id)||0]};
}
export function treatmentReadScope(user, alias='t', device=false) {
 valid(alias);
 if(dashboardScope(user).kind==='all') return {sql:'1=1',params:[]};
 const medical=medicalReadScope(user,'scope_medical');
 const medicalId=device
  ? `COALESCE(${alias}.bind_medical_record_id,(SELECT bound_treatment.medical_record_id FROM treatment_records bound_treatment WHERE bound_treatment.id=${alias}.bind_treatment_record_id AND bound_treatment.patient_id=${alias}.patient_id))`
  : `${alias}.medical_record_id`;
 const record=`EXISTS(SELECT 1 FROM medical_records scope_medical WHERE scope_medical.id=${medicalId} AND ${medical.sql})`;
 // Manually established treatment has no visit/store attribution. Like patient
 // follow-up records, it follows the patient; an explicit visit always wins.
 const patient=patientReadScope(user,'treatment_patient');
 return dashboardScope(user).kind==='self'
  ? {sql:`(${alias}.${device?'bind_doctor_id':'doctor_id'}=? OR ${record})`,params:[Number(user.doctor_id)||0,...medical.params]}
  : {sql:`(${record} OR (${medicalId} IS NULL AND EXISTS(SELECT 1 FROM patients treatment_patient WHERE treatment_patient.id=${alias}.patient_id AND ${patient.sql})))`,params:[...medical.params,...patient.params]};
}
export function followupReadScope(user, alias='t') {
 valid(alias);
 if(dashboardScope(user).kind==='self') return {sql:`${alias}.follower_id=?`,params:[Number(user.id)||0]};
 const patient=patientReadScope(user,'scope_patient');
 return {sql:`EXISTS(SELECT 1 FROM patients scope_patient WHERE scope_patient.id=${alias}.patient_id AND ${patient.sql})`,params:patient.params};
}
export function doctorReadScope(user, alias='d') {
 valid(alias);
 const stores=dataStoreScope(user,'scope_mapping.store_id');
 if(dashboardScope(user).kind==='all') return stores;
 if(stores) return {sql:`EXISTS(SELECT 1 FROM doctor_store_mapping scope_mapping WHERE scope_mapping.doctor_id=${alias}.id AND ${stores.sql})`,params:stores.params};
 const appt=appointmentReadScope(user,'scope_visit');
 return {sql:`(${alias}.id=? OR EXISTS(SELECT 1 FROM appointments scope_visit WHERE scope_visit.doctor_id=${alias}.id AND ${appt.sql}))`,params:[Number(user.doctor_id)||0,...appt.params]};
}
export function storeReadScope(user, column='s.id') {
 const stores=dataStoreScope(user,column); if(stores)return stores;
 const appt=appointmentReadScope(user,'scope_visit');
 return {sql:`(EXISTS(SELECT 1 FROM doctor_store_mapping scope_mapping WHERE scope_mapping.store_id=${column} AND scope_mapping.doctor_id=?) OR EXISTS(SELECT 1 FROM appointments scope_visit WHERE scope_visit.store_id=${column} AND ${appt.sql}) OR EXISTS(SELECT 1 FROM patient_store_registrations scope_reg WHERE scope_reg.store_id=${column} AND scope_reg.created_by=?))`,params:[Number(user.doctor_id)||0,...appt.params,Number(user.id)||0]};
}
export function auditReadScope(user, alias='l') {
 valid(alias);
 const kind=dashboardScope(user).kind;
 if(kind==='all')return {sql:'1=1',params:[]};
 if(kind==='self')return {sql:`${alias}.admin_id=?`,params:[Number(user.id)||0]};
 const resources=[
  ['appointment','appointments','scope_visit',appointmentReadScope(user,'scope_visit')],
  ['order','orders','scope_order',orderReadScope(user,'scope_order')],
  ['patient','patients','scope_patient',patientReadScope(user,'scope_patient')],
  ['doctor','doctors','scope_doctor',doctorReadScope(user,'scope_doctor')],
  ['store','stores','scope_store',storeReadScope(user,'scope_store.id')],
  ['medical_record','medical_records','scope_record',medicalReadScope(user,'scope_record')]
 ];
 return {sql:`(${resources.map(([type,table,name,scope])=>`(${alias}.target_type='${type}' AND EXISTS(SELECT 1 FROM ${table} ${name} WHERE ${name}.id=${alias}.target_id AND ${scope.sql}))`).join(' OR ')})`,params:resources.flatMap(([, , ,scope])=>scope.params)};
}
