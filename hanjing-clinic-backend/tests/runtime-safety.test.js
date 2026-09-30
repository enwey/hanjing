import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRateLimiter, createRotatingLog } from '../runtime-safety.js';
import { validateProductionSecrets } from '../security-config.js';
import { requiredAdminPermissions, hasAdminPermission } from '../admin-permissions.js';

test('production refuses missing, shared and known development secrets', () => {
  assert.throws(() => validateProductionSecrets({ NODE_ENV: 'production' }));
  assert.throws(() => validateProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: 'hanjing_clinic_secret_key_2026', PII_ENCRYPTION_KEY: 'x'.repeat(32) }));
  assert.throws(() => validateProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32), PII_ENCRYPTION_KEY: 'a'.repeat(32) }));
  assert.doesNotThrow(() => validateProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48), PII_ENCRYPTION_KEY: 'b'.repeat(32) }));
});
test('spoofed forwarded headers do not bypass limits; expired entries free capacity', () => {
  let time = 0, ok = 0, status = 200;
  const limit = createRateLimiter({ limit: 1, maxKeys: 1, windowMs: 100, clock: () => time });
  const res = { setHeader() {}, status(n) { status = n; return this; }, json() {} };
  const req = { ip: '127.0.0.1', headers: { 'x-forwarded-for': 'one' } };
  limit(req, res, () => ok++);
  req.headers['x-forwarded-for'] = 'two';
  limit(req, res, () => ok++);
  assert.equal(ok, 1); assert.equal(status, 429);
  time = 101;
  limit({ ip: 'another-ip' }, res, () => ok++);
  assert.equal(ok, 2);
});
test('access logs rotate and continue after the size limit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hanjing-log-test-'));
  try {
    const file = path.join(dir, 'requests.log');
    const log = createRotatingLog(file, { maxBytes: 8, copies: 2 });
    await log('first\n'); await log('second\n'); await log('third\n');
    assert.equal(await fs.readFile(file, 'utf8'), 'third\n');
    assert.equal(await fs.readFile(file + '.1', 'utf8'), 'second\n');
    assert.equal(await fs.readFile(file + '.2', 'utf8'), 'first\n');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('unknown routes fail closed and read grants cannot authorize mutations', () => {
  const user = { role: 'receptionist', permissions: ['distribution:view'] };
  assert.equal(hasAdminPermission(user, requiredAdminPermissions('GET', '/api/admin/products')), true);
  assert.equal(hasAdminPermission(user, requiredAdminPermissions('POST', '/api/admin/products')), false);
  assert.equal(hasAdminPermission(user, requiredAdminPermissions('POST', '/api/admin/unknown')), false);
});
