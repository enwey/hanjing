import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

test('schema synchronization API independent regression', {timeout:600000}, async t => {
  const name='hanjing_test_schema_regression_'+Date.now();
  const admin=await mysql.createConnection({host:'127.0.0.1',port:3306,user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'});
  let db,server;const backups=new Set();
  try {
    await admin.query(`CREATE DATABASE \`${name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${name}\``);
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:process.env.TEST_DB_USER||'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root',DB_NAME:name,NODE_ENV:'test',JWT_SECRET:randomBytes(48).toString('hex')});
    db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
    await admin.query("INSERT IGNORE INTO roles(name,code) VALUES ('Regression admin','super_admin'),('Regression viewer','schema_regression_viewer')");
    const [roles]=await admin.query("SELECT id,code FROM roles WHERE code IN ('super_admin','schema_regression_viewer')");
    const tokens={};
    for(const role of roles){
      const [result]=await admin.query("INSERT INTO admin_users(username,password_hash,name,role_id) VALUES (?,'unused-test-password','Regression account',?)",['regression_'+role.code,role.id]);
      tokens[role.code]=jwt.sign({id:result.insertId,role:role.code,token_version:0},process.env.JWT_SECRET,{expiresIn:'15m'});
      if(role.code==='schema_regression_viewer')await admin.query("INSERT INTO permissions(role_id,permission_resource) VALUES (?,'database:view')",[role.id]);
    }
    const app=express();app.use(express.json());app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
    app.use((error,req,res,next)=>res.status(500).json({code:500,message:error.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const call=async(body,token=tokens.super_admin)=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/database/sync`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
      const json=await response.json();
      if(json.data?.backupDatabase)backups.add(json.data.backupDatabase);
      const backup=json.message?.match(/hj_schema_backup_[a-f0-9]{32}/)?.[0];if(backup)backups.add(backup);
      return {status:response.status,body:json};
    };
    await t.test('unauthenticated requests rejected',async()=>assert.equal((await call({preview:true},null)).status,401));
    await t.test('view-only account cannot preview or execute sync',async()=>{
      assert.equal((await call({preview:true},tokens.schema_regression_viewer)).status,403);
      assert.equal((await call({planToken:'a'.repeat(64)},tokens.schema_regression_viewer)).status,403);
    });
    await t.test('authorized execution without preview rejected',async()=>assert.equal((await call({})).status,400));
    await admin.query("ALTER TABLE users ADD COLUMN legacy_text VARCHAR(80) NULL");
    await admin.query("INSERT INTO users(openid,nickname,legacy_text) VALUES ('regression-user','Retained user','restore this text')");
    await admin.query("CREATE TABLE regression_external (id INT PRIMARY KEY, note VARCHAR(40));");
    await admin.query("INSERT INTO regression_external VALUES (1,'external data retained')");
    const preview=await call({preview:true});
    await t.test('authorized preview identifies deletion and preserves data',async()=>{
      assert.equal(preview.status,200,JSON.stringify(preview.body));
      assert.ok(preview.body.data.changes.some(c=>c.action==='drop_column'&&c.name==='legacy_text'));
      assert.ok(preview.body.data.unmanagedTables.includes('regression_external'));
      assert.equal((await admin.query('SELECT legacy_text FROM users'))[0][0].legacy_text,'restore this text');
    });
    const planToken=preview.body.data.planToken;
    await t.test('view dependency blocks changes without deleting the field',async()=>{
      await admin.query('CREATE VIEW regression_view AS SELECT legacy_text FROM users');
      try {const r=await call({planToken});assert.equal(r.status,409);assert.match(r.body.message,/视图/);assert.equal((await admin.query("SHOW COLUMNS FROM users LIKE 'legacy_text'"))[0].length,1);}
      finally {await admin.query('DROP VIEW regression_view');}
    });
    await t.test('trigger dependency blocks changes without deleting the field',async()=>{
      await admin.query('CREATE TRIGGER regression_trigger BEFORE UPDATE ON users FOR EACH ROW SET NEW.legacy_text=OLD.legacy_text');
      try {const r=await call({planToken});assert.equal(r.status,409);assert.match(r.body.message,/触发器/);assert.equal((await admin.query("SHOW COLUMNS FROM users LIKE 'legacy_text'"))[0].length,1);}
      finally {await admin.query('DROP TRIGGER regression_trigger');}
    });
    const applied=await call({planToken});
    await t.test('real API sync preserves unrelated data and backup can restore deleted values',async()=>{
      assert.equal(applied.status,200,JSON.stringify(applied.body));
      const backup=applied.body.data.backupDatabase;
      assert.equal((await admin.query("SHOW COLUMNS FROM users LIKE 'legacy_text'"))[0].length,0);
      assert.equal((await admin.query('SELECT nickname FROM users'))[0][0].nickname,'Retained user');
      assert.equal((await admin.query('SELECT note FROM regression_external'))[0][0].note,'external data retained');
      await admin.query(`CREATE TABLE regression_restore LIKE \`${backup}\`.users`);
      await admin.query(`INSERT INTO regression_restore SELECT * FROM \`${backup}\`.users`);
      assert.equal((await admin.query('SELECT legacy_text FROM regression_restore'))[0][0].legacy_text,'restore this text');
      const [[audit]]=await admin.query("SELECT details FROM audit_logs WHERE action='sync_database_schema' AND status='success' ORDER BY id DESC LIMIT 1");
      const details=typeof audit.details==='string'?JSON.parse(audit.details):audit.details;
      assert.equal(details.backupDatabase,backup);
      await admin.query('DROP TABLE regression_restore');
    });
    // This is an ordinary stored field. A human comment must not make it a generated column.
    await admin.query("ALTER TABLE users ADD COLUMN legacy_import_note VARCHAR(80) NULL COMMENT 'GENERATED ALWAYS by the legacy importer'");
    await admin.query("UPDATE users SET legacy_import_note='operator value requiring backup'");
    await admin.query(`ALTER TABLE users
      ADD COLUMN legacy_default_text VARCHAR(80) NOT NULL DEFAULT 'GENERATED ALWAYS',
      ADD COLUMN legacy_virtual INT GENERATED ALWAYS AS (CHAR_LENGTH(nickname)) VIRTUAL,
      ADD COLUMN legacy_stored INT GENERATED ALWAYS AS (CHAR_LENGTH(nickname) * 2) STORED`);
    await admin.query("UPDATE users SET legacy_default_text='actual value differs from default'");
    const commentPreview=await call({preview:true});
    const commentResult=await call({planToken:commentPreview.body.data.planToken});
    await t.test('ordinary field with generation-related comment is backed up without data loss',async()=>{
      assert.equal(commentResult.status,200,JSON.stringify(commentResult.body));
      const backup=commentResult.body.data.backupDatabase;
      assert.equal((await admin.query(`SELECT legacy_import_note FROM \`${backup}\`.users`))[0][0].legacy_import_note,'operator value requiring backup');
    });
    await t.test('ordinary field with generation-related default preserves its actual value',async()=>{
      assert.equal(commentResult.status,200,JSON.stringify(commentResult.body));
      const backup=commentResult.body.data.backupDatabase;
      assert.equal((await admin.query(`SELECT legacy_default_text FROM \`${backup}\`.users`))[0][0].legacy_default_text,'actual value differs from default');
    });
    await t.test('virtual and stored generated columns are recomputed in the backup',async()=>{
      assert.equal(commentResult.status,200,JSON.stringify(commentResult.body));
      const backup=commentResult.body.data.backupDatabase;
      const [[row]]=await admin.query(`SELECT nickname, legacy_virtual, legacy_stored FROM \`${backup}\`.users`);
      assert.equal(row.legacy_virtual,row.nickname.length);
      assert.equal(row.legacy_stored,row.nickname.length*2);
      const [remaining]=await admin.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME IN ('legacy_import_note','legacy_default_text','legacy_virtual','legacy_stored')");
      assert.equal(remaining.length,0,'obsolete columns removed only after successful backup');
    });
  } finally {
    await new Promise(resolve=>server?server.close(resolve):resolve());
    await db?.closePool();
    for(const backup of backups)if(/^hj_schema_backup_[a-f0-9]{32}$/.test(backup))await admin.query(`DROP DATABASE \`${backup}\``);
    await admin.query(`DROP DATABASE \`${name}\``);await admin.end();
  }
});
