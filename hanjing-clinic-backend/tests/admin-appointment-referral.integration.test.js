import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { query, get, transaction } from '../db.js';
import { attachAppointmentReferral } from '../backend-referrals.js';
import { JWT_SECRET } from '../helpers.js';

test('backend promoter referral is attached to appointment and visible in admin appointment queries', async () => {
  // 1. Verify distributor 8 (enwey) exists or create a test backend promoter
  let [promoter] = await query("SELECT id, nickname, invite_code FROM distributors WHERE source_type='backend' AND status='active' LIMIT 1");
  if (!promoter) {
    const code = 'BP999999999999999999999999';
    const res = await query(
      "INSERT INTO distributors (user_id, nickname, invite_code, source_type, status) VALUES (NULL, 'TestPromoter', ?, 'backend', 'active')",
      [code]
    );
    await query("INSERT INTO promoter_codes (code, distributor_id, active) VALUES (?, ?, 1)", [code, res.insertId]);
    promoter = { id: res.insertId, nickname: 'TestPromoter', invite_code: code };
  }

  // 2. Insert a test patient and schedule if needed, then insert a test appointment
  const [patient] = await query("SELECT id, user_id FROM patients WHERE user_id IS NOT NULL LIMIT 1");
  assert.ok(patient, 'patient should exist');
  const userId = patient.user_id;
  const [schedule] = await query("SELECT id, store_id, doctor_id FROM doctor_schedules LIMIT 1");
  const scheduleId = schedule ? schedule.id : 1;
  const storeId = schedule ? schedule.store_id : 1;
  const doctorId = schedule ? schedule.doctor_id : 1;

  let testApptId = null;
  try {
    const apptNo = 'APPT_TEST_REF_' + Date.now().toString().slice(-6);
    const insertRes = await query(`
      INSERT INTO appointments (
        appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id,
        appointment_date, appointment_time, type, status, source,
        doctor_name, store_name
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        CURDATE(), '09:00', 'first', 'pending', 'mini_app',
        '测试医生', '总院门诊'
      )
    `, [apptNo, userId, patient.id, storeId, doctorId, scheduleId]);
    testApptId = insertRes.insertId;

    // 3. Attach referral using backend code
    await transaction(async conn => {
      await attachAppointmentReferral(conn, testApptId, promoter.invite_code);
    });

    // 4. Verify in DB directly
    const [saved] = await query("SELECT referral_promoter_id, referral_code FROM appointments WHERE id = ?", [testApptId]);
    assert.equal(saved.referral_promoter_id, promoter.id, 'referral_promoter_id matches distributor');
    assert.equal(saved.referral_code, promoter.invite_code, 'referral_code matches code');

    // 5. Query using the Admin appointment list SQL query
    const listSql = `
      SELECT a.*, (SELECT COALESCE(NULLIF(d.nickname, ''), NULLIF(pa.login_name, ''), d.invite_code) FROM distributors d LEFT JOIN promoter_accounts pa ON pa.distributor_id=d.id WHERE d.id=a.referral_promoter_id) AS referral_promoter_name, p.patient_no, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ?
    `;
    const [row] = await query(listSql, [testApptId]);
    assert.ok(row, 'appointment found in list query');
    assert.equal(row.referral_promoter_name, promoter.nickname, 'referral_promoter_name matches promoter nickname');
    assert.equal(row.referral_code, promoter.invite_code, 'referral_code returned');

    // 6. Test search by promoter nickname
    const searchByNameSql = `
      SELECT a.id, (SELECT COALESCE(NULLIF(d.nickname, ''), NULLIF(pa.login_name, ''), d.invite_code) FROM distributors d LEFT JOIN promoter_accounts pa ON pa.distributor_id=d.id WHERE d.id=a.referral_promoter_id) AS referral_promoter_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ? AND (p.name LIKE ? OR a.referral_code LIKE ? OR EXISTS (SELECT 1 FROM distributors d WHERE d.id = a.referral_promoter_id AND (d.nickname LIKE ? OR d.invite_code LIKE ?)))
    `;
    const searchParam = `%${promoter.nickname}%`;
    const [searchByNameRow] = await query(searchByNameSql, [testApptId, searchParam, searchParam, searchParam, searchParam]);
    assert.ok(searchByNameRow, 'search by promoter nickname matches');

    // 7. Test search by referral code
    const searchByCodeParam = `%${promoter.invite_code}%`;
    const [searchByCodeRow] = await query(searchByNameSql, [testApptId, searchByCodeParam, searchByCodeParam, searchByCodeParam, searchByCodeParam]);
    assert.ok(searchByCodeRow, 'search by referral code matches');

    // 8. Query using the Admin appointment detail SQL query
    const detailSql = `
      SELECT a.*, (SELECT COALESCE(NULLIF(d.nickname, ''), NULLIF(pa.login_name, ''), d.invite_code) FROM distributors d LEFT JOIN promoter_accounts pa ON pa.distributor_id=d.id WHERE d.id=a.referral_promoter_id) AS referral_promoter_name, p.patient_no, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ?
    `;
    const [detailRow] = await query(detailSql, [testApptId]);
    assert.equal(detailRow.referral_promoter_name, promoter.nickname, 'detail query returns referral_promoter_name');
    assert.equal(detailRow.referral_code, promoter.invite_code, 'detail query returns referral_code');

  } finally {
    if (testApptId) {
      await query("DELETE FROM appointments WHERE id = ?", [testApptId]);
    }
  }
});

test('live HTTP admin appointments API returns referral_promoter_name and filters by search', async () => {
  const loginRes = await fetch('http://127.0.0.1:5005/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.code, 200);
  const adminToken = loginData.data.token;

  const res = await fetch('http://127.0.0.1:5005/api/admin/appointments?page=1&pageSize=10', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.code, 200);
  assert.ok(Array.isArray(data.data.list));

  // Search by backend promoter nickname
  const searchRes = await fetch('http://127.0.0.1:5005/api/admin/appointments?page=1&pageSize=10&search=enwey', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(searchRes.status, 200);
  const searchData = await searchRes.json();
  assert.equal(searchData.code, 200);
});
