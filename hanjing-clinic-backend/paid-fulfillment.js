import { FULFILLMENT_PAID_STATUSES } from './fulfillment-guard.js';
export async function createPaidFulfillment(conn, order) {
  // The caller may hold the pre-payment object; use the locked, persisted payment state.
  const [[current]] = await conn.execute('SELECT * FROM orders WHERE id=? FOR UPDATE',[order.id]);
  if (!current || !FULFILLMENT_PAID_STATUSES.includes(current.status)) return null;
  order=current;
  const context = typeof order.cashier_context === 'string'
    ? JSON.parse(order.cashier_context) : order.cashier_context;
  // Mall orders without an explicit patient/store/actor must not be assigned by guessing.
  if (!context?.patient_id || !context?.store_id || !context?.actor_id) return null;
  const [[device]] = await conn.execute(`SELECT oi.id FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id=? AND COALESCE(oi.product_category_snapshot,p.category)='device' LIMIT 1`,[order.id]);
  if (!device) return null;
  const [[existing]] = await conn.execute('SELECT id FROM fulfillment_cases WHERE order_id=?', [order.id]);
  if (existing) return existing.id;
  const [[patient]] = await conn.execute('SELECT id FROM patients WHERE id=? AND user_id=?', [context.patient_id, order.user_id]);
  if (!patient) throw new Error('Cashier patient no longer belongs to this order');
  const [[technician]] = context.technician_id
    ? await conn.execute("SELECT id FROM admin_users WHERE id=? AND status='online'", [context.technician_id]) : [[]];
  const [records] = order.appointment_id
    ? await conn.execute('SELECT id FROM medical_records WHERE patient_id=? AND appointment_id=? AND store_id=?', [patient.id, order.appointment_id, context.store_id])
    : await conn.execute('SELECT id FROM medical_records WHERE patient_id=? AND store_id=? ORDER BY id DESC LIMIT 2', [patient.id, context.store_id]);
  const [created] = await conn.execute(`INSERT INTO fulfillment_cases
    (order_id,patient_id,store_id,technician_id,status,created_by,medical_record_id)
    VALUES(?,?,?,?,?,?,?)`, [order.id, patient.id, context.store_id, technician?.id || null,
    technician ? 'assigned' : 'pending_assignment', context.actor_id, records.length === 1 ? records[0].id : null]);
  await conn.execute(`INSERT INTO fulfillment_events(fulfillment_case_id,actor_id,event_type,detail)
    VALUES(?,?,'case_created',?)`, [created.insertId, context.actor_id,
    JSON.stringify({ order_id: order.id, source: 'cashier_paid', requested_technician_id: context.technician_id || null })]);
  return created.insertId;
}
