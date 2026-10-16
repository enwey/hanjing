export async function createPaidFulfillment(conn, order) {
  const context = typeof order.cashier_context === 'string'
    ? JSON.parse(order.cashier_context) : order.cashier_context;
  if (!context?.technician_id) return null;
  const [[existing]] = await conn.execute('SELECT id FROM fulfillment_cases WHERE order_id=?', [order.id]);
  if (existing) return existing.id;
  const [[patient]] = await conn.execute('SELECT id FROM patients WHERE id=? AND user_id=?', [context.patient_id, order.user_id]);
  if (!patient) throw new Error('Cashier patient no longer belongs to this order');
  const [[technician]] = await conn.execute("SELECT id FROM admin_users WHERE id=? AND status='online'", [context.technician_id]);
  const [records] = order.appointment_id
    ? await conn.execute('SELECT id FROM medical_records WHERE patient_id=? AND appointment_id=? AND store_id=?', [patient.id, order.appointment_id, context.store_id])
    : await conn.execute('SELECT id FROM medical_records WHERE patient_id=? AND store_id=? ORDER BY id DESC LIMIT 2', [patient.id, context.store_id]);
  const [created] = await conn.execute(`INSERT INTO fulfillment_cases
    (order_id,patient_id,store_id,technician_id,status,created_by,medical_record_id)
    VALUES(?,?,?,?,?,?,?)`, [order.id, patient.id, context.store_id, technician?.id || null,
    technician ? 'assigned' : 'pending_assignment', context.actor_id, records.length === 1 ? records[0].id : null]);
  await conn.execute(`INSERT INTO fulfillment_events(fulfillment_case_id,actor_id,event_type,detail)
    VALUES(?,?,'case_created',?)`, [created.insertId, context.actor_id,
    JSON.stringify({ order_id: order.id, source: 'cashier_paid', requested_technician_id: context.technician_id })]);
  return created.insertId;
}
