import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';

test('code-authoritative schema synchronization on an isolated MySQL database', { timeout: 600000 }, async t => {
  const database = 'hanjing_test_schema_sync_' + Date.now();
  const conn = await mysql.createConnection({ host:'127.0.0.1',port:3306,user:process.env.TEST_DB_USER || 'root',password:process.env.TEST_DB_PASSWORD || 'root' });
  let db;
  const backups = new Set();
  try {
    await conn.query(`CREATE DATABASE \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${database}\``);
    Object.assign(process.env, { DB_HOST:'127.0.0.1', DB_PORT:'3306', DB_USER:process.env.TEST_DB_USER || 'root', DB_PASSWORD:process.env.TEST_DB_PASSWORD || 'root', DB_NAME:database });
    db = await import('../db.js');
    console.log('Initializing isolated schema');
    await db.initDB();
    await t.test('concurrent synchronization is rejected by a database-scoped lock', async () => {
      const lock = 'hj_schema_sync_' + createHash('sha256').update(JSON.stringify(database)).digest('hex').slice(0,40);
      await conn.query('SELECT GET_LOCK(?,0)',[lock]);
      try { await assert.rejects(db.syncDatabaseSchema({preview:true}),/另一个结构同步/); }
      finally { await conn.query('SELECT RELEASE_LOCK(?)',[lock]); }
    });
    console.log('Previewing isolated schema');
    await conn.query("INSERT INTO users (openid,nickname) VALUES ('schema-test','Keep this user')");
    await conn.query("ALTER TABLE users ADD COLUMN obsolete_field VARCHAR(40) DEFAULT NULL, ADD INDEX idx_obsolete (obsolete_field)");
    await conn.query("UPDATE users SET obsolete_field='Recover this value'");
    await conn.query('ALTER TABLE users MODIFY COLUMN nickname VARCHAR(180) NOT NULL');
    await conn.query('ALTER TABLE patients ADD COLUMN obsolete_user_id BIGINT UNSIGNED NULL, ADD CONSTRAINT fk_schema_legacy_user FOREIGN KEY (obsolete_user_id) REFERENCES users(id)');
    await conn.query('ALTER TABLE users DROP COLUMN phone_verified_at');
    await conn.query('DROP TABLE appointment_reschedule_history');
    const preview = await db.syncDatabaseSchema({ preview:true });
    assert.ok(preview.changes.some(c => c.action === 'drop_column' && c.name === 'obsolete_field'));
    assert.ok(preview.changes.some(c => c.action === 'modify_column' && c.name === 'nickname'));
    assert.ok(preview.changes.some(c => c.action === 'add_column' && c.name === 'phone_verified_at'));
    assert.ok(preview.changes.some(c => c.action === 'create_table' && c.name === 'appointment_reschedule_history'));
    assert.equal((await conn.query("SHOW COLUMNS FROM users LIKE 'obsolete_field'"))[0].length,1,'preview must not mutate');
    console.log('Applying isolated schema');
    const result = await db.syncDatabaseSchema({ planToken:preview.planToken });
    backups.add(result.backupDatabase);
    await t.test('obsolete fields removed; existing business data and backup values preserved', async () => {
      assert.equal(result.success,true);
      assert.equal((await conn.query("SHOW TABLES LIKE 'appointment_reschedule_history'"))[0].length,1);
      assert.equal((await conn.query("SHOW COLUMNS FROM users LIKE 'phone_verified_at'"))[0].length,1);
      assert.equal((await conn.query("SHOW COLUMNS FROM patients LIKE 'obsolete_user_id'"))[0].length,0);
      assert.equal((await conn.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_schema_legacy_user'"))[0].length,0);
      assert.equal((await conn.query("SHOW COLUMNS FROM users LIKE 'obsolete_field'"))[0].length,0);
      assert.equal((await conn.query("SHOW COLUMNS FROM users LIKE 'nickname'"))[0][0].Type,'varchar(100)');
      assert.equal((await conn.query('SELECT nickname FROM users'))[0][0].nickname,'Keep this user');
      assert.equal((await conn.query(`SELECT obsolete_field FROM \`${result.backupDatabase}\`.users`))[0][0].obsolete_field,'Recover this value');
      assert.equal((await conn.query(`SELECT source_database FROM \`${result.backupDatabase}\`._schema_sync_metadata`))[0][0].source_database,database);
    });
    const clean = await db.syncDatabaseSchema({ preview:true });
    await t.test('inherited deployment collation survives synchronization', async () => {
      const [[table]] = await conn.query("SELECT TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_user_stores'");
      assert.equal(table.collation, 'utf8mb4_0900_ai_ci');
    });
    await t.test('subsequent preview has no differences', () => assert.deepEqual(clean.changes,[]));
    await conn.query('ALTER TABLE users ADD COLUMN changed_after_preview INT');
    await t.test('stale preview cannot authorize a different deletion', async () => {
      await assert.rejects(db.syncDatabaseSchema({ planToken:clean.planToken }), /重新预览/);
      assert.equal((await conn.query("SHOW COLUMNS FROM users LIKE 'changed_after_preview'"))[0].length,1);
    });
    await conn.query('ALTER TABLE users DROP COLUMN changed_after_preview');
    await conn.query('ALTER TABLE users MODIFY COLUMN nickname VARCHAR(180) NOT NULL');
    await conn.query('UPDATE users SET nickname=?',['x'.repeat(150)]);
    const incompatible = await db.syncDatabaseSchema({preview:true});
    await t.test('incompatible narrowing reports failure and retains a recovery backup', async () => {
      try {await db.syncDatabaseSchema({planToken:incompatible.planToken}); assert.fail('must reject truncation');}
      catch(error) {
        const backup = error.message.match(/hj_schema_backup_[a-f0-9]{32}/)?.[0];
        assert.ok(backup); backups.add(backup);
        assert.match(error.message,/Data too long|Data truncated|数据过长/);
        assert.equal((await conn.query('SELECT nickname FROM users'))[0][0].nickname.length,150);
      }
    });
  } catch (error) {
    const backup = error.message.match(/hj_schema_backup_[a-f0-9]{32}/)?.[0];
    if (backup) backups.add(backup);
    throw error;
  } finally {
    await db?.closePool();
    for (const backup of backups) if (/^hj_schema_backup_[a-f0-9]{32}$/.test(backup)) await conn.query(`DROP DATABASE \`${backup}\``);
    await conn.query(`DROP DATABASE \`${database}\``);
    await conn.end();
  }
});
