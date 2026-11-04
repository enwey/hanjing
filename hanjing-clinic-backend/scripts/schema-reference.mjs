// Private child process: DB_NAME must refer to a scratch schema created by schema-sync.js.
import { initDB, closePool, schemaDdlErrors } from '../db.js';
import mysql from 'mysql2/promise';
import { readSchema } from '../schema-sync.js';

let conn;
try {
  if (process.env.HANJING_SCHEMA_REFERENCE !== '1' || !/^hj_schema_ref_[a-f0-9]{32}$/.test(process.env.DB_NAME || '')) throw new Error('拒绝使用非隔离参考库');
  // A second pass resolves forward table references in legacy additive migrations.
  await initDB();
  schemaDdlErrors.length = 0;
  await initDB();
  if (schemaDdlErrors.length) throw new Error(schemaDdlErrors.map(e => `${e.code}: ${e.message}`).join('; '));
  conn = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'root', database: process.env.DB_NAME });
  const tables = await readSchema(conn);
  await new Promise((resolve, reject) => process.send({ tables }, error => error ? reject(error) : resolve()));
} catch (error) {
  await new Promise(resolve => process.send?.({ error: error.message }, resolve));
  process.exitCode = 1;
} finally {
  await conn?.end();
  await closePool();
  process.disconnect?.();
}
