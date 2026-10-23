import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { get, query, closePool } from '../db.js';
import { decryptPII } from '../helpers.js';

// Read-only checks against existing local fixtures. Never insert/delete business data.
const source = readFileSync(new URL('../routes/backend-promoter.js', import.meta.url), 'utf8');
const start = source.indexOf("app.get('/api/promoter/patients/:id'");
const end = source.indexOf("app.get('/api/promoter/products'", start);
let handler, simulatedPatient = null;
const scopedGet = (sql, args) => {
  if (simulatedPatient && sql.includes('SELECT 1 FROM appointments')) return Promise.resolve(String(args[0]) === '777777' && String(args[1]) === String(simulatedPatient) ? { allowed: 1 } : null);
  return get(sql, args);
};
vm.runInNewContext(source.slice(start, end), {
  app: { get: (_path, fn) => { handler = fn; } }, get: scopedGet, query,
  mask: value => { const s = decryptPII(value) || ''; return s.length >= 7 ? s.slice(0, 3) + '****' + s.slice(-4) : ''; },
  console
});
async function call(id, promoter) {
  let status = 200, body;
  const res = { status(value) { status = value; return res; }, json(value) { body = value; } };
  await handler({ params: { id: String(id) }, user: { promoter_id: promoter } }, res);
  return { status, body };
}
try {
  assert.equal((await call('bad', 1)).status, 400);
  assert.equal((await call('999999999999', 1)).status, 404);
  let fixture = await get(`SELECT a.patient_id,a.referral_promoter_id FROM appointments a
    JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=p.user_id
    WHERE a.referral_promoter_id IS NOT NULL LIMIT 1`);
  if (!fixture) {
    fixture = await get('SELECT p.id AS patient_id,777777 AS referral_promoter_id FROM patients p JOIN users u ON u.id=p.user_id LIMIT 1');
    assert.ok(fixture, 'No local patient fixture; verification blocked');
    simulatedPatient = fixture.patient_id;
    console.log('LIMITATION: no referred local fixture; appointment ownership query is simulated. Patient/detail SQL remains real and read-only.');
  }
  const response = await call(fixture.patient_id, fixture.referral_promoter_id);
  assert.equal(response.status, 200);
  const p = response.body.data;
  for (const key of ['appointments','medical_records','orders','family_members']) assert.ok(Array.isArray(p[key]), key);
  assert.ok(p.sleep_diagnostics);
  assert.equal(typeof p.total_spent, 'number');
  assert.ok(!p.phone || p.phone.includes('****'));
  for (const order of p.orders) {
    assert.ok(Array.isArray(order.items));
    assert.equal(order.shipping_address, undefined);
    assert.equal(order.wechat_transaction_id, undefined);
    assert.equal(order.buyer_phone, undefined);
  }
  assert.equal((await call(fixture.patient_id, '999999999999')).status, 403);
  console.log('PASS: invalid/missing/owned/foreign patient; actual SQL; DTO collections and masked phone; no raw order address/payment metadata. No writes.');
} finally { await closePool(); }
