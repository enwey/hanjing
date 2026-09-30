import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export function validateProductionSecrets(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const name of ['JWT_SECRET', 'PII_ENCRYPTION_KEY']) {
    const value = env[name] || '';
    if (Buffer.byteLength(value) < 32 || /hanjing_clinic_|change.?me|replace.?me|example/i.test(value)) {
      throw new Error(`${name} must be a private, independently generated key of at least 32 bytes`);
    }
  }
  if (!/^[\x21-\x7e]{32}$/.test(env.PII_ENCRYPTION_KEY)) throw new Error('PII_ENCRYPTION_KEY must be exactly 32 printable ASCII characters; do not change an existing key without migrating encrypted data');
  if (env.JWT_SECRET === env.PII_ENCRYPTION_KEY) throw new Error('JWT and PII keys must be different');
}

validateProductionSecrets();
export const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
// Keep local legacy data readable. Production explicitly rejects this development key.
export const PII_SECRET = (process.env.PII_ENCRYPTION_KEY || 'hanjing_clinic_pii_secret_key_32').padEnd(32, '0').slice(0, 32);
