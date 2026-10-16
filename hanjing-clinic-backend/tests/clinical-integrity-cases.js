import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

export async function runClinicalIntegrityTests({ t, db, control, api, root, staff, helpers }) {
  for (const permission of ['appointment:edit', 'medical_record:edit', 'schedule:add']) {
    await db.run('INSERT IGNORE INTO permissions(role_id,permission_resource) VALUES(1001,?)', [permission]);
  }
  await db.run('INSERT IGNORE INTO doctor_store_mapping(doctor_id,store_id) VALUES(1,1),(1,2)');
  await db.run("INSERT INTO doctors(id,name,title,specialty) VALUES(9000,'Other doctor','Doctor','Sleep')");
  await db.run("INSERT INTO roles(id,name,code,status) VALUES(9000,'F1 doctor','doctor','active') ON DUPLICATE KEY UPDATE status='active'");
  const doctorRole = await db.get("SELECT id FROM roles WHERE code='doctor'");
  for (const permission of ['appointment:edit', 'medical_record:edit', 'schedule:add']) {
    await db.run('INSERT IGNORE INTO permissions(role_id,permission_resource) VALUES(?,?)', [doctorRole.id, permission]);
  }
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id,doctor_id,status) VALUES(9000,'f1-doctor','unused','Doctor',?,9000,'online'),(9001,'f1-unbound','unused','Unbound',?,NULL,'online')", [doctorRole.id, doctorRole.id]);
  await db.run('INSERT INTO admin_user_stores(admin_user_id,store_id) VALUES(9000,1),(9001,1)');
  const doctor = jwt.sign({ id:9000, role:'doctor' }, helpers.JWT_SECRET);
  const unbound = jwt.sign({ id:9001, role:'doctor' }, helpers.JWT_SECRET);
  await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(9000,'F1-LOCAL',1,1,1,1,1,'2099-01-02','10:00','pending'),(9001,'F1-FOREIGN',2,2,2,1,1,'2099-01-02','11:00','pending')");
  await t.test('F1 postpone rejects foreign stores, other doctors and unbound doctors', async () => {
    assert.equal((await api('/appointments/9001/postpone', {})).status, 403);
    for (const token of [doctor, unbound]) assert.equal((await api('/appointments/9000/postpone', {}, token)).status, 403);
    assert.equal(Number((await db.get('SELECT postpone_count FROM appointments WHERE id=9001')).postpone_count), 0);
  });
  await t.test('F1 postpone is serialized, permits authorized staff and rejects ended appointments', async () => {
    const results = await Promise.all([api('/appointments/9000/postpone', {}), api('/appointments/9000/postpone', {})]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    assert.equal(new Set(results.map(r => r.body.data.postpone_count)).size, 2);
    assert.equal((await api('/appointments/9001/postpone', {}, root)).status, 200);
    await db.run("UPDATE appointments SET status='cancelled' WHERE id=9000");
    assert.equal((await api('/appointments/9000/postpone', {})).status, 409);
  });
  await db.run("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(9000,1,2,'2099-02-01','morning','09:00','12:00'),(9001,1,1,'2099-02-02','morning','09:00','12:00'),(9002,1,1,'2099-03-01','morning','09:00','12:00'),(9003,1,2,'2099-04-01','morning','09:00','12:00')");
  await t.test('F1 single schedule cannot archive or move another store schedule', async () => {
    for (const patch of [{is_rest:true}, {store_id:1}]) {
      assert.equal((await api('/schedules', {doctor_id:1,date:'2099-02-01',period:'morning',...patch})).status, 403);
    }
    assert.equal((await db.get('SELECT status FROM doctor_schedules WHERE id=9000')).status, 'available');
  });
  await t.test('F1 batch schedule rejects foreign entries atomically', async () => {
    const r = await api('/schedules/batch', {doctor_id:1,list:[{date:'2099-02-02',period:'morning',is_rest:true},{date:'2099-02-01',period:'morning',is_rest:true}]});
    assert.equal(r.status, 403, JSON.stringify(r));
    assert.equal((await db.get('SELECT status FROM doctor_schedules WHERE id=9001')).status, 'available');
    assert.equal((await db.get('SELECT status FROM doctor_schedules WHERE id=9000')).status, 'available');
  });
  await t.test('F1 copying schedules cannot overwrite a foreign target store', async () => {
    assert.equal((await api('/schedules/copy-last-month', {doctor_id:1,year:2099,month:4})).status, 403);
    assert.equal(Number((await db.get('SELECT store_id FROM doctor_schedules WHERE id=9003')).store_id), 2);
  });
  await t.test('F1 authorized schedule edits work and doctor scope fails closed', async () => {
    for (const token of [doctor, unbound]) {
      assert.equal((await api('/schedules', {doctor_id:1,date:'2099-02-02',period:'morning',is_rest:true}, token)).status, 403);
      assert.equal((await api('/schedules/batch', {doctor_id:1,list:[{date:'2099-02-02',period:'morning',is_rest:true}]}, token)).status, 403);
      assert.equal((await api('/schedules/copy-last-month', {doctor_id:1,year:2099,month:4}, token)).status, 403);
    }
    assert.equal((await api('/schedules', {doctor_id:1,date:'2099-02-02',period:'morning',is_rest:true})).status, 200);
    assert.equal((await api('/schedules', {doctor_id:1,date:'2099-02-01',period:'morning',is_rest:true}, root)).status, 200);
  });
  await t.test('F1 normal schedule create, edit, batch and copy preserve existing bookings', async () => {
    const slot = {doctor_id:1,store_id:1,date:'2099-05-01',period:'morning',start_time:'09:00:00',end_time:'12:00:00',total_slots:6};
    assert.equal((await api('/schedules', slot)).status, 200);
    const original = await db.get("SELECT id FROM doctor_schedules WHERE doctor_id=1 AND date='2099-05-01' AND status='available'");
    assert.equal((await api('/schedules', {...slot,total_slots:8})).status, 200);
    assert.equal((await db.get('SELECT total_slots FROM doctor_schedules WHERE id=?',[original.id])).total_slots, 8);
    await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(9012,'F1-SCHEDULE-BOOKED',1,1,1,1,?,'2099-05-01','10:00','pending')", [original.id]);
    assert.equal((await api('/schedules', {...slot,total_slots:9})).status, 200);
    assert.equal((await db.get('SELECT status FROM doctor_schedules WHERE id=?',[original.id])).status, 'archived');
    assert.equal(Number((await db.get('SELECT schedule_id FROM appointments WHERE id=9012')).schedule_id), Number(original.id));
    assert.equal((await db.get("SELECT COUNT(*) n FROM doctor_schedules WHERE date='2099-05-01' AND status='available'")).n, 1);
    const list = ['2099-08-01','2099-09-01'].map(date => ({...slot,date}));
    assert.equal((await api('/schedules/batch', {doctor_id:1,list})).status, 200);
    assert.equal((await api('/schedules/batch', {doctor_id:1,list:list.map(item=>({...item,total_slots:7}))})).status, 200);
    assert.deepEqual((await db.query("SELECT total_slots FROM doctor_schedules WHERE date IN ('2099-08-01','2099-09-01') AND status='available'")).map(row=>row.total_slots), [7,7]);
    const copy = await api('/schedules/copy-last-month', {doctor_id:1,year:2099,month:4}, root);
    assert.equal(copy.status, 200, JSON.stringify(copy));
    assert.equal(Number((await db.get('SELECT store_id FROM doctor_schedules WHERE id=9003')).store_id), 1);
    assert.equal((await api('/schedules/copy-last-month', {doctor_id:1,year:2099,month:4})).status, 200);
  });
  await db.run("INSERT INTO treatment_records(id,patient_id,doctor_id,device_model,start_date,status,current_advancement) VALUES(9000,2,1,'Foreign','2099-01-01','active',1),(9001,1,1,'Local','2099-01-01','active',1)");
  await db.run("INSERT INTO patient_devices(id,patient_id,bind_treatment_record_id,bind_doctor_id,device_model,bound_at,status,current_advancement) VALUES(9000,2,9000,1,'Foreign','2099-01-01','active',1),(9001,1,9001,1,'Local','2099-01-01','active',1)");
  await db.run('UPDATE treatment_records SET patient_device_id=id WHERE id IN (9000,9001)');
  const adjustment = {treatment_id:9001,operator_id:1,adjust_date:'2099-01-02',adjusted_advancement:5};
  await t.test('F1 adjustments bind the actual treatment and device to the URL patient', async () => {
    assert.equal((await api('/patients/1/treatment/adjustments', {...adjustment,treatment_id:9000})).status, 404);
    assert.equal(Number((await db.get('SELECT current_advancement FROM treatment_records WHERE id=9000')).current_advancement), 1);
    await db.run('UPDATE treatment_records SET patient_device_id=9000 WHERE id=9001');
    try { assert.equal((await api('/patients/1/treatment/adjustments', adjustment)).status, 409); }
    finally { await db.run('UPDATE treatment_records SET patient_device_id=9001 WHERE id=9001'); }
  });
  async function failAt(sql, body) {
    await control.query(sql);
    try { await body(); } finally { await control.query('DROP TRIGGER f1_failure'); }
  }
  await t.test('F1 adjustment timeline failure rolls back all clinical writes', async () => {
    const before = (await db.get('SELECT COUNT(*) n FROM device_adjustments WHERE treatment_id=9001')).n;
    await failAt("CREATE TRIGGER f1_failure BEFORE INSERT ON treatment_timelines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F1 injected failure'", async () => {
      assert.equal((await api('/patients/1/treatment/adjustments', adjustment)).status, 500);
      assert.equal((await db.get('SELECT COUNT(*) n FROM device_adjustments WHERE treatment_id=9001')).n, before);
      assert.equal(Number((await db.get('SELECT current_advancement FROM treatment_records WHERE id=9001')).current_advancement), 1);
      assert.equal(Number((await db.get('SELECT current_advancement FROM patient_devices WHERE id=9001')).current_advancement), 1);
    });
  });
  const treatment = {doctor_id:1,device_product_id:1,initial_advancement:2,start_date:'2099-01-03'};
  await t.test('F1 invalid doctor cannot deactivate existing treatment', async () => {
    assert.equal((await api('/patients/1/treatment', {...treatment,doctor_id:999999})).status, 400);
    assert.equal((await db.get('SELECT status FROM treatment_records WHERE id=9001')).status, 'active');
    assert.equal((await db.get('SELECT status FROM patient_devices WHERE id=9001')).status, 'active');
  });
  await t.test('F1 replacement failure restores the entire previous treatment', async () => {
    const count = (await db.get('SELECT COUNT(*) n FROM treatment_records WHERE patient_id=1')).n;
    await failAt("CREATE TRIGGER f1_failure BEFORE INSERT ON treatment_timelines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F1 injected failure'", async () => {
      assert.equal((await api('/patients/1/treatment', treatment)).status, 500);
      assert.equal((await db.get('SELECT COUNT(*) n FROM treatment_records WHERE patient_id=1')).n, count);
      assert.equal((await db.get('SELECT status FROM treatment_records WHERE id=9001')).status, 'active');
      assert.equal((await db.get('SELECT status FROM patient_devices WHERE id=9001')).status, 'active');
    });
  });
  await t.test('F1 concurrent treatment replacement leaves one matched active pair', async () => {
    const r = await Promise.all([api('/patients/1/treatment', treatment), api('/patients/1/treatment', treatment)]);
    assert.deepEqual(r.map(x => x.status), [200,200], JSON.stringify(r));
    const treatments = await db.query("SELECT * FROM treatment_records WHERE patient_id=1 AND status='active'");
    const devices = await db.query("SELECT * FROM patient_devices WHERE patient_id=1 AND status='active'");
    assert.equal(treatments.length, 1); assert.equal(devices.length, 1);
    assert.equal(Number(treatments[0].patient_device_id), Number(devices[0].id));
    assert.equal(Number(devices[0].bind_treatment_record_id), Number(treatments[0].id));
    assert.equal((await api('/patients/1/treatment/adjustments', {...adjustment,treatment_id:treatments[0].id})).status, 200);
    assert.equal(Number((await db.get('SELECT current_advancement FROM patient_devices WHERE id=?',[devices[0].id])).current_advancement), 5);
    assert.equal((await api('/patients/1/treatment/adjustments', adjustment)).status, 409);
  });
  await t.test('F1 every replacement write failure rolls back without losing the active pair', async () => {
    for (const operation of ['BEFORE INSERT ON treatment_records', 'BEFORE INSERT ON patient_devices', 'BEFORE UPDATE ON treatment_records']) {
      const before = await db.query("SELECT id,patient_device_id FROM treatment_records WHERE patient_id=1 AND status='active'");
      const counts = await db.get('SELECT (SELECT COUNT(*) FROM treatment_records WHERE patient_id=1) treatments, (SELECT COUNT(*) FROM patient_devices WHERE patient_id=1) devices, (SELECT COUNT(*) FROM treatment_timelines WHERE patient_id=1) events');
      await failAt(`CREATE TRIGGER f1_failure ${operation} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F1 injected failure'`, async () => {
        assert.equal((await api('/patients/1/treatment', treatment)).status, 500);
        assert.deepEqual(await db.query("SELECT id,patient_device_id FROM treatment_records WHERE patient_id=1 AND status='active'"), before);
        assert.deepEqual(await db.get('SELECT (SELECT COUNT(*) FROM treatment_records WHERE patient_id=1) treatments, (SELECT COUNT(*) FROM patient_devices WHERE patient_id=1) devices, (SELECT COUNT(*) FROM treatment_timelines WHERE patient_id=1) events'), counts);
        assert.equal((await db.get('SELECT status FROM patient_devices WHERE id=?', [before[0].patient_device_id])).status, 'active');
      });
    }
  });
  await t.test('F1 clinical writes reject invalid actors and values without changing active records', async () => {
    const active = await db.get("SELECT id,current_advancement FROM treatment_records WHERE patient_id=1 AND status='active'");
    for (const value of [null, '', true, -1, 'invalid', 100]) {
      assert.equal((await api('/patients/1/treatment', {...treatment,initial_advancement:value})).status, 400);
      assert.equal((await api('/patients/1/treatment/adjustments', {...adjustment,treatment_id:active.id,adjusted_advancement:value})).status, 400);
    }
    assert.equal((await api('/patients/1/treatment/adjustments', {...adjustment,treatment_id:active.id,operator_id:999999})).status, 400);
    for (const token of [doctor, unbound]) {
      assert.equal((await api('/patients/1/treatment', treatment, token)).status, 403);
      assert.equal((await api('/patients/1/treatment/adjustments', {...adjustment,treatment_id:active.id}, token)).status, 403);
    }
    assert.deepEqual(await db.get("SELECT id,current_advancement FROM treatment_records WHERE patient_id=1 AND status='active'"), active);
  });
  await db.run('UPDATE treatment_records SET medical_record_id=1 WHERE id=9001');
  await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(9010,'F1-CLINICAL-OLD',1,1,1,1,1,'2099-01-02','12:00','checked_in'),(9011,'F1-CLINICAL-NEW',1,1,1,1,1,'2099-01-02','13:00','checked_in')");
  const consultation = {medical_record:{doctor_id:1,store_id:1,visit_date:'2099-01-02',diagnosis:'F1 clinical fixture'}};
  await t.test('F1 consultation cannot adjust a replaced device through an old treatment', async () => {
    const r = await api('/appointments/9010/complete-consultation', {...consultation,treatment:{treatment_id:9001},adjustment:{...adjustment,create:true}}, root);
    assert.equal(r.status, 409, JSON.stringify(r));
    assert.equal((await db.get('SELECT status FROM appointments WHERE id=9010')).status, 'checked_in');
    assert.equal((await db.get('SELECT COUNT(*) n FROM medical_records WHERE appointment_id=9010')).n, 0);
  });
  await t.test('F1 consultation and standalone replacement share the active-pair invariant', async () => {
    const results = await Promise.all([
      api('/appointments/9011/complete-consultation', {...consultation,treatment:{...treatment,create:true}}, root),
      api('/patients/1/treatment', treatment)
    ]);
    assert.deepEqual(results.map(r => r.status), [200,200], JSON.stringify(results));
    const treatments = await db.query("SELECT id,patient_device_id FROM treatment_records WHERE patient_id=1 AND status='active'");
    const devices = await db.query("SELECT id,bind_treatment_record_id FROM patient_devices WHERE patient_id=1 AND status='active'");
    assert.equal(treatments.length, 1); assert.equal(devices.length, 1);
    assert.equal(Number(treatments[0].patient_device_id), Number(devices[0].id));
    assert.equal(Number(devices[0].bind_treatment_record_id), Number(treatments[0].id));
  });
  await db.run("INSERT INTO follow_up_tasks(id,patient_id,follower_id,title,due_date,status) VALUES(9000,1,1001,'F1 failure','2099-01-01','pending'),(9001,1,1001,'F1 concurrency','2099-01-01','pending'),(9002,2,1001,'F1 foreign','2099-01-01','pending'),(9003,1,1001,'F1 cancel race','2099-01-01','pending')");
  const followup = {task_id:9000,contact_type:'phone',summary:'F1 actual contact'};
  await t.test('F1 follow-up completion failure leaves no orphan record', async () => {
    await failAt("CREATE TRIGGER f1_failure BEFORE UPDATE ON follow_up_tasks FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F1 injected failure'", async () => {
      assert.equal((await api('/patients/1/follow-ups/records', followup)).status, 500);
      assert.equal((await db.get('SELECT COUNT(*) n FROM follow_up_records WHERE task_id=9000')).n, 0);
      assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=9000')).status, 'pending');
    });
    assert.equal((await api('/patients/1/follow-ups/records', followup)).status, 200);
    assert.equal((await db.get('SELECT COUNT(*) n FROM follow_up_records WHERE task_id=9000')).n, 1);
  });
  await t.test('F1 concurrent follow-ups write exactly once and cannot revert completion', async () => {
    const results = await Promise.all([api('/patients/1/follow-ups/records', {...followup,task_id:9001}), api('/patients/1/follow-ups/records', {...followup,task_id:9001})]);
    assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
    assert.equal((await db.get('SELECT COUNT(*) n FROM follow_up_records WHERE task_id=9001')).n, 1);
    assert.equal((await api('/patients/1/follow-ups/9001', {status:'pending'}, staff, 'PUT')).status, 409);
    assert.equal((await api('/patients/1/follow-ups/9001', {description:'Corrected note'}, staff, 'PUT')).status, 200);
    assert.equal((await db.get('SELECT status FROM follow_up_tasks WHERE id=9001')).status, 'completed');
    assert.equal((await api('/patients/1/follow-ups/records', {...followup,task_id:9002})).status, 404);
    assert.equal((await api('/patients/1/follow-ups/9002', {status:'cancelled'}, staff, 'PUT')).status, 404);
  });
  await t.test('F1 cancel and complete race leaves a consistent follow-up state', async () => {
    const results = await Promise.all([api('/patients/1/follow-ups/records', {...followup,task_id:9003}), api('/patients/1/follow-ups/9003', {status:'cancelled'}, staff, 'PUT')]);
    assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
    const state = (await db.get('SELECT status FROM follow_up_tasks WHERE id=9003')).status;
    assert.equal((await db.get('SELECT COUNT(*) n FROM follow_up_records WHERE task_id=9003')).n, state === 'completed' ? 1 : 0);
  });
}
