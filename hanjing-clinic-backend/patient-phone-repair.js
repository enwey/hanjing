import { decryptPII } from './helpers.js';

// Only unwrap the known historical double-encryption shape. Never substitute a
// user's current phone or guess plaintext when the deployed key cannot decrypt it.
export async function repairDoubleEncryptedPatientPhones(query, run) {
  const rows = await query(`SELECT id, phone FROM patients
    WHERE relation = 'self' AND source = 'mini_app' AND phone LIKE 'det:%'`);
  let repaired = 0;
  for (const row of rows) {
    const inner = decryptPII(row.phone);
    if (typeof inner !== 'string' || !/^det:(?:[a-f0-9]{32})+$/.test(inner) || inner === row.phone) continue;
    const phone = decryptPII(inner);
    if (!/^1\d{10}$/.test(phone || '')) continue;
    const result = await run('UPDATE patients SET phone = ? WHERE id = ? AND phone = ?', [inner, row.id, row.phone]);
    repaired += Number(result.changes || 0);
  }
  return { repaired };
}
