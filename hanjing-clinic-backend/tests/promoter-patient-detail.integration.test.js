import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { query, get, run } from '../db.js';
import { JWT_SECRET } from '../helpers.js';

const BASE_URL = 'http://127.0.0.1:5005';

test('Promoter patient detail API integration tests', async (t) => {
  const promoterId = 8;
  const promoterToken = jwt.sign({ scope: 'promoter', promoter_id: promoterId, token_version: 0 }, JWT_SECRET, { expiresIn: '1h' });

  // Patient 43 exists
  const patient = await get("SELECT * FROM patients WHERE id = 43");
  assert.ok(patient, 'Patient 43 must exist in database');

  await t.test('1. Unauthorized access returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/promoter/patients/${patient.id}`);
    assert.equal(res.status, 401);
  });

  await t.test('2. Accessing non-referred patient returns 403', async () => {
    // Delete any appointments linking patient 43 to promoter 8
    await run("DELETE FROM appointments WHERE patient_id = ? AND referral_promoter_id = ?", [patient.id, promoterId]);
    await run("DELETE FROM distribution_relationships WHERE child_user_id = ? AND parent_distributor_id = ?", [patient.user_id, promoterId]);

    const res = await fetch(`${BASE_URL}/api/promoter/patients/${patient.id}`, {
      headers: { Authorization: `Bearer ${promoterToken}` }
    });
    assert.equal(res.status, 403);
  });

  await t.test('3. Accessing referred patient returns 200 with masked data and proper structure', async () => {
    const apptNo = 'APPT_TEST_' + Date.now();
    const store = await get("SELECT id FROM stores LIMIT 1");
    const doctor = await get("SELECT id FROM doctors LIMIT 1");
    const schedule = await get("SELECT id FROM doctor_schedules LIMIT 1");

    await run(
      `INSERT INTO appointments(appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, referral_promoter_id)
       VALUES(?, ?, ?, ?, ?, ?, '2026-10-24', '10:00:00', 'first_visit', 'completed', ?)`,
      [apptNo, patient.user_id, patient.id, store.id, doctor.id, schedule.id, promoterId]
    );

    const res = await fetch(`${BASE_URL}/api/promoter/patients/${patient.id}`, {
      headers: { Authorization: `Bearer ${promoterToken}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.code, 200);
    assert.ok(json.data);
    assert.equal(String(json.data.id), String(patient.id));

    // Verify phone is masked
    if (json.data.phone) {
      assert.match(json.data.phone, /^\d{3}\*{4}\d{4}$/, 'Phone must be masked with 4 asterisks');
    }

    // Verify required sections exist
    assert.ok(Array.isArray(json.data.appointments), 'appointments array exists');
    assert.ok(Array.isArray(json.data.medical_records), 'medical_records array exists');
    assert.ok(Array.isArray(json.data.orders), 'orders array exists');
    assert.ok(json.data.sleep_diagnostics, 'sleep_diagnostics object exists');
    assert.ok(Array.isArray(json.data.family_members), 'family_members array exists');

    // Verify prohibited sections are stripped
    assert.equal(json.data.medical_history, undefined, 'medical_history must not be returned');
    assert.equal(json.data.allergy_history, undefined, 'allergy_history must not be returned');

    // Clean up test appointment
    await run("DELETE FROM appointments WHERE appointment_no = ?", [apptNo]);
  });
});
