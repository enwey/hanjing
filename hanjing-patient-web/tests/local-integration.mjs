// Explicitly opt in. Creates only uniquely identified local test rows, then
// removes those exact rows in finally. Never runs as part of npm test.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
if (process.env.PC_RUN_LOCAL_INTEGRATION !== '1')
  throw Error(
    'Set PC_RUN_LOCAL_INTEGRATION=1 for disposable local test records',
  );
const { query, run, transaction, closePool } = await import(
  '../../hanjing-clinic-backend/db.js'
);
const { hashPassword, encryptPII } = await import(
  '../../hanjing-clinic-backend/helpers.js'
);
if (!['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1'))
  throw Error('This integration test only accepts a local database');
const base = 'http://127.0.0.1:3003/api/v1',
  mark = 'pc_it_' + crypto.randomBytes(8).toString('hex'),
  phone = '199' + String(crypto.randomInt(10000000, 99999999)),
  password = 'Pc!' + crypto.randomBytes(16).toString('hex');
let userId, storeId, doctorId, scheduleId, token, patientId;
const checks = [];
async function api(path, method = 'GET', data) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  assert.ok(r.ok && [0, 200].includes(b.code), path + ': ' + b.message);
  checks.push(method + ' ' + path.split('?')[0]);
  return b.data ?? b;
}
try {
  const duplicate = await query('SELECT id FROM users WHERE phone IN (?,?)', [
    phone,
    encryptPII(phone),
  ]);
  assert.equal(duplicate.length, 0);
  userId = (
    await run(
      'INSERT INTO users (openid,nickname,phone,password_hash) VALUES (?,?,?,?)',
      [mark, mark, encryptPII(phone), hashPassword(password)],
    )
  ).id;
  const login = await api('/auth/password-login', 'POST', { phone, password });
  token = login.access_token;
  assert.ok(token);
  const member = await api('/user/family-members', 'POST', {
    name: mark,
    relation: 'self',
    gender: 1,
    birthday: '1990-01-01',
  });
  patientId = Number(member.id);
  await api('/user/family-members');
  const profile = await api('/user/profile');
  assert.equal(profile.nickname, mark);
  const ess = await api('/assessments/ess', 'POST', {
    patientId,
    answers: [0, 1, 0, 1, 0, 1, 0, 1],
  });
  assert.equal(ess.essScore, 4);
  const report = await api('/assessments/snore-analysis/' + ess.id);
  assert.equal(report.essScore, 4);
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await api('/treatment/wearing', 'POST', {
    patientId,
    date: day,
    wearDuration: 6,
    comfort: 4,
    painScore: 2,
    note: mark,
  });
  const worn = await api('/treatment/wearing-records?patientId=' + patientId);
  assert.ok(worn.some((v) => v.wearDuration === 6));
  storeId = (
    await run(
      "INSERT INTO stores (name,code,address,status,open_time,close_time) VALUES (?,?,?,'open','08:00:00','18:00:00')",
      [mark, mark, '本地隔离测试地址'],
    )
  ).id;
  doctorId = (
    await run(
      'INSERT INTO doctors (name,title,specialty,status,consult_fee) VALUES (?,?,?,1,10000)',
      [mark, '测试职称', '测试专业'],
    )
  ).id;
  await run(
    'INSERT INTO doctor_store_mapping (doctor_id,store_id) VALUES (?,?)',
    [doctorId, storeId],
  );
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  scheduleId = (
    await run(
      "INSERT INTO doctor_schedules (doctor_id,store_id,date,period,start_time,end_time,total_slots,people_per_slot,status) VALUES (?,?,?,'morning','09:00:00','10:00:00',2,1,'available')",
      [doctorId, storeId, tomorrow],
    )
  ).id;
  const slots = await api('/schedules/' + scheduleId + '/slots');
  assert.ok(slots.length);
  const booking = await api('/appointments', 'POST', {
    patientId,
    doctorId,
    storeId,
    scheduleId,
    appointmentDate: tomorrow,
    appointmentTime: slots[0].label,
    type: 'first',
    symptomDesc: mark,
  });
  assert.equal(booking.status, 'pending_payment');
  const detail = await api('/appointments/' + booking.id);
  assert.equal(detail.appointment.patientName, mark);
  assert.equal(detail.appointment.status, 'pending_payment');
  const bookingList = await api('/appointments');
  assert.ok(bookingList.some((a) => Number(a.id) === Number(booking.id)));
  await api('/appointments/' + booking.id + '/cancel', 'POST', {
    reason: mark,
  });
  const after = await api('/appointments/' + booking.id);
  assert.equal(after.appointment.status, 'cancelled');
  for (const path of [
    '/orders',
    '/user/medical-records',
    '/treatment/records',
    '/user/notifications',
    '/user/account-security',
    '/user/member-info',
    '/user/member-levels',
    '/user/coupons',
  ])
    await api(path);
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (userId) {
    await transaction(async (conn) => {
      const [[owned]] = await conn.execute(
        'SELECT id FROM users WHERE id=? AND openid=? FOR UPDATE',
        [userId, mark],
      );
      if (!owned) throw Error('Cleanup identity mismatch');
      await conn.execute('UPDATE users SET self_patient_id=NULL WHERE id=?', [
        userId,
      ]);
      // These tables may have been created by membership, booking and check-in APIs.
      for (const table of [
        'appointment_evaluations',
        'appointment_pre_exams',
        'appointments',
        'ess_assessments',
        'snore_assessments',
        'user_membership_history',
        'user_memberships',
        'user_notifications',
        'user_patient_links',
      ])
        await conn.execute('DELETE FROM ' + table + ' WHERE user_id=?', [
          userId,
        ]);
      if (patientId)
        await conn.execute('DELETE FROM wearing_logs WHERE patient_id=?', [
          patientId,
        ]);
      await conn.execute('DELETE FROM patients WHERE user_id=?', [userId]);
      await conn.execute('DELETE FROM users WHERE id=? AND openid=?', [
        userId,
        mark,
      ]);
      if (scheduleId)
        await conn.execute(
          'DELETE FROM doctor_schedules WHERE id=? AND doctor_id=? AND store_id=?',
          [scheduleId, doctorId, storeId],
        );
      if (doctorId) {
        await conn.execute(
          'DELETE FROM doctor_store_mapping WHERE doctor_id=? AND store_id=?',
          [doctorId, storeId],
        );
        await conn.execute('DELETE FROM doctors WHERE id=? AND name=?', [
          doctorId,
          mark,
        ]);
      }
      if (storeId)
        await conn.execute('DELETE FROM stores WHERE id=? AND code=?', [
          storeId,
          mark,
        ]);
    });
    assert.equal(
      (await query('SELECT id FROM users WHERE id=?', [userId])).length,
      0,
    );
    console.log(
      'Disposable local integration records removed; user residual: 0',
    );
  }
  await closePool();
}
