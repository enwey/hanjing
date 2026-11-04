import mysql from 'mysql2/promise';
import { createHash, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';

export const quoteId = name => '`' + String(name).replaceAll('`', '``') + '`';
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const config = () => ({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'hanjing_clinic', multipleStatements: false,
});

// SHOW CREATE TABLE is emitted by the same MySQL server for source and target.
// Never infer obsolete columns from an incomplete CREATE TABLE source-code regex.
export function parseTable(name, ddl) {
  const lines = ddl.split('\n');
  const charset = lines.at(-1).match(/DEFAULT CHARSET=(\w+)/)?.[1];
  const collation = lines.at(-1).match(/COLLATE=(\w+)/)?.[1];
  const columns = [], indexes = [], foreignKeys = [], checks = [];
  for (const raw of lines.slice(1, -1)) {
    const definition = raw.trim().replace(/,$/, '');
    const column = definition.match(/^`((?:``|[^`])+)` /);
    const key = definition.match(/^(?:UNIQUE |FULLTEXT |SPATIAL )?KEY `((?:``|[^`])+)`/);
    const constraint = definition.match(/^CONSTRAINT `((?:``|[^`])+)`/);
    const item = { name: (column?.[1] || key?.[1] || constraint?.[1] || 'PRIMARY').replaceAll('``', '`'), definition };
    if (column) {
      // MySQL may make inherited charset/collation explicit after MODIFY COLUMN.
      // Normalize only SQL outside quoted literals/identifiers, never default values.
      item.definition = item.definition.split(/('(?:''|\\.|[^'\\])*'|`(?:``|[^`])*`)/g).map((part, i) => i % 2 ? part : part
        .replace(new RegExp(` CHARACTER SET ${charset}\\b`, 'g'), '')
        .replace(new RegExp(` COLLATE ${collation}\\b`, 'g'), '')).join('');
      columns.push(item);
    }
    else if (key || definition.startsWith('PRIMARY KEY')) indexes.push(item);
    else if (constraint && definition.includes('FOREIGN KEY')) {
      if (/REFERENCES `(?:``|[^`])+`\.`/.test(definition)) throw failure(`表 ${name} 存在跨库外键，需人工核对后同步`);
      item.references = definition.match(/REFERENCES `((?:``|[^`])+)`/)?.[1]?.replaceAll('``', '`');
      if (!item.references) throw failure(`无法解析外键：${name}.${item.name}`);
      foreignKeys.push(item);
    } else if (constraint && definition.includes('CHECK')) checks.push(item);
    else throw failure(`不支持的结构定义：${name} ${definition}`);
  }
  if (!columns.length) throw failure(`目标表没有字段：${name}`);
  // Sequence values are data, not a schema difference; never reset AUTO_INCREMENT.
  const options = lines.at(-1).replace(/^\) /, '').replace(/ AUTO_INCREMENT=\d+/, '');
  return { name, columns, indexes, foreignKeys, checks, options };
}

export async function readSchema(conn) {
  const [rows] = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const tables = [];
  for (const { name } of rows) {
    const [[row]] = await conn.query(`SHOW CREATE TABLE ${quoteId(name)}`);
    tables.push(parseTable(name, row['Create Table']));
  }
  return tables;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byName = items => new Map(items.map(item => [item.name, item]));
const different = (a, b) => a.filter(item => !same(item, byName(b).get(item.name)));
// InnoDB can rename automatically generated FK indexes when restoring a FK.
// Compare index semantics and multiplicity, not those server-generated names.
export function diffIndexes(actual, target) {
  const signature = item => item.definition.replace(/^(UNIQUE |FULLTEXT |SPATIAL )?KEY `(?:``|[^`])+`/, (_, kind = '') => kind + 'KEY');
  const remaining = [...actual], add = [];
  for (const index of target) {
    let pos = remaining.findIndex(old => old.name === index.name && signature(old) === signature(index));
    if (pos < 0) pos = remaining.findIndex(old => signature(old) === signature(index));
    if (pos < 0) add.push(index); else remaining.splice(pos, 1);
  }
  return { drop: remaining, add };
}
const createTable = table => `CREATE TABLE ${quoteId(table.name)} (\n${[...table.columns, ...table.indexes, ...table.checks].map(x => x.definition).join(',\n')}\n) ${table.options}`;

export function planSchema(actual, target) {
  if (!target.length) throw failure('目标结构为空，已停止同步');
  const existing = byName(actual), desired = byName(target);
  const changes = [], tableSql = [], dropSql = [], addSql = [];
  const affectedColumns = new Map();
  for (const table of target) {
    const old = existing.get(table.name);
    if (!old) {
      changes.push({ table: table.name, action: 'create_table', name: table.name });
      tableSql.push(createTable(table)); continue;
    }
    // Table options / partitions are deliberately not rewritten by column reconciliation.
    // Fail closed instead of pretending the entire structure has converged.
    if (old.options !== table.options) throw failure(`表 ${table.name} 的引擎、字符集或表选项与代码不同，需先人工迁移后再同步字段`);
    const oldColumns = byName(old.columns), nextColumns = byName(table.columns);
    const clauses = [];
    const indexChanges = diffIndexes(old.indexes, table.indexes);
    const affected = new Set(old.columns.filter(col => !same(col, nextColumns.get(col.name))).map(col => col.name));
    for (const index of indexChanges.drop) {
      const names = [...index.definition.matchAll(/`((?:``|[^`])+)`/g)].map(m => m[1].replaceAll('``', '`'));
      for (const name of index.name === 'PRIMARY' ? names : names.slice(1)) affected.add(name);
    }
    affectedColumns.set(table.name, affected);
    for (const index of indexChanges.drop) clauses.push(index.name === 'PRIMARY' ? 'DROP PRIMARY KEY' : `DROP INDEX ${quoteId(index.name)}`);
    for (const check of different(old.checks, table.checks)) clauses.push(`DROP CHECK ${quoteId(check.name)}`);
    for (const col of old.columns) if (!nextColumns.has(col.name)) {
      clauses.push(`DROP COLUMN ${quoteId(col.name)}`);
      changes.push({ table: table.name, action: 'drop_column', name: col.name, before: col.definition });
    }
    // Align field order as well as full MySQL definitions (type/default/nullability/etc.).
    const order = old.columns.filter(c => nextColumns.has(c.name)).map(c => c.name);
    for (const [i, col] of table.columns.entries()) {
      const before = oldColumns.get(col.name);
      if (!same(before, col) || order[i] !== col.name) {
        clauses.push(`${before ? 'MODIFY' : 'ADD'} COLUMN ${col.definition} ${i ? 'AFTER ' + quoteId(table.columns[i - 1].name) : 'FIRST'}`);
        changes.push({ table: table.name, action: before ? 'modify_column' : 'add_column', name: col.name, before: before?.definition, after: col.definition });
        const pos = order.indexOf(col.name); if (pos !== -1) order.splice(pos, 1);
        order.splice(i, 0, col.name);
      }
    }
    for (const index of indexChanges.add) clauses.push(`ADD ${index.definition}`);
    for (const check of different(table.checks, old.checks)) clauses.push(`ADD ${check.definition}`);
    if (clauses.length) {
      tableSql.push(`ALTER TABLE ${quoteId(table.name)} ${clauses.join(', ')}`);
      if (!changes.some(c => c.table === table.name)) changes.push({ table: table.name, action: 'update_constraints', name: table.name });
    }
  }
  // Only rebuild keys whose actual columns/indexes change, not every relationship
  // on a table merely because an unrelated text field changes.
  const affectedForeignKey = (tableName, fk) => {
    const parts = fk.definition.match(/FOREIGN KEY \(([^)]+)\) REFERENCES `(?:``|[^`])+` \(([^)]+)\)/);
    if (!parts) throw failure(`无法核对外键依赖：${tableName}.${fk.name}`);
    const hasAffected = (name, fields) => [...fields.matchAll(/`((?:``|[^`])+)`/g)].some(m => affectedColumns.get(name)?.has(m[1].replaceAll('``', '`')));
    return hasAffected(tableName, parts[1]) || hasAffected(fk.references, parts[2]);
  };
  // Drop foreign keys before altering referenced columns/indexes, then recreate and validate.
  for (const old of actual) for (const fk of old.foreignKeys) {
    const table = desired.get(old.name);
    if (!table) {
      if (affectedForeignKey(old.name, fk)) throw failure(`未纳管表 ${old.name} 引用了待修改表 ${fk.references}，已停止同步`);
      continue;
    }
    if (affectedForeignKey(old.name, fk) || !same(fk, byName(table.foreignKeys).get(fk.name))) {
      dropSql.push(`ALTER TABLE ${quoteId(old.name)} DROP FOREIGN KEY ${quoteId(fk.name)}`);
      changes.push({ table: old.name, action: 'rebuild_foreign_key', name: fk.name });
    }
  }
  for (const table of target) for (const fk of table.foreignKeys) {
    if (affectedForeignKey(table.name, fk) || !same(fk, byName(existing.get(table.name)?.foreignKeys || []).get(fk.name))) {
      addSql.push(`ALTER TABLE ${quoteId(table.name)} ADD ${fk.definition}`);
      if (!changes.some(c => c.table === table.name && c.name === fk.name)) changes.push({ table: table.name, action: 'rebuild_foreign_key', name: fk.name });
    }
  }
  return { changes, dropStatements: dropSql, tableStatements: tableSql, addStatements: addSql, statements: [...dropSql, ...tableSql, ...addSql], unmanagedTables: actual.filter(t => !desired.has(t.name)).map(t => t.name) };
}

async function buildReference(conn) {
  const database = 'hj_schema_ref_' + randomUUID().replaceAll('-', '');
  // Unspecified table defaults must inherit the deployment database settings,
  // just as initDB does there. Explicit options in DDL still take precedence.
  const [[defaults]] = await conn.query(`SELECT DEFAULT_CHARACTER_SET_NAME AS charset,
    DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME=DATABASE()`);
  if (!defaults || !/^\w+$/.test(defaults.charset) || !/^\w+$/.test(defaults.collation)) {
    throw failure('无法读取当前数据库的默认字符集和排序规则');
  }
  await conn.query(`CREATE DATABASE ${quoteId(database)} DEFAULT CHARACTER SET ${defaults.charset} COLLATE ${defaults.collation}`);
  try {
    return await new Promise((resolve, reject) => {
      let result;
      const child = fork(new URL('./scripts/schema-reference.mjs', import.meta.url), [], {
        env: { ...process.env, DB_NAME: database, HANJING_SCHEMA_REFERENCE: '1' },
        execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 180000);
      child.on('message', message => { result = message; });
      child.on('error', reject);
      child.on('exit', code => {
        clearTimeout(timer);
        if (code === 0 && result?.tables) resolve(result.tables);
        else reject(failure('生成代码目标结构失败：' + (result?.error || `进程退出或超时（退出码 ${code}）`), 500));
      });
    });
  } finally {
    await conn.query(`DROP DATABASE ${quoteId(database)}`);
  }
}

async function backupTables(conn, actual, plan) {
  const names = [...new Set(plan.changes.map(c => c.table))].filter(name => actual.some(t => t.name === name));
  if (!names.length) return null;
  const database = 'hj_schema_backup_' + randomUUID().replaceAll('-', '');
  await conn.query(`CREATE DATABASE ${quoteId(database)}`);
  // Keep even partial backups on failure; never delete an operator's recovery data.
  try {
    await conn.query(`CREATE TABLE ${quoteId(database)}._schema_sync_metadata (id INT PRIMARY KEY, source_database VARCHAR(64), schema_json LONGTEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await conn.query(`INSERT INTO ${quoteId(database)}._schema_sync_metadata (id, source_database, schema_json) VALUES (1, DATABASE(), ?)`, [JSON.stringify(actual.filter(t => names.includes(t.name)))]);
    for (const name of names) {
      const table = actual.find(t => t.name === name);
      const dest = `${quoteId(database)}.${quoteId(name)}`;
      await conn.query(`CREATE TABLE ${dest} LIKE ${quoteId(name)}`);
      // Use MySQL metadata: comments/default literals can contain "GENERATED ALWAYS"
      // without making an ordinary column generated. LIKE recreates real generated
      // columns; only those columns must be omitted from INSERT ... SELECT.
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME AS name, GENERATION_EXPRESSION AS generation_expression
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [name]);
      if (columns.length !== table.columns.length || columns.some(c => !table.columns.some(old => old.name === c.name))) {
        throw failure(`表 ${name} 的备份字段元数据已变化，请重新预览`);
      }
      const fields = columns.filter(c => c.generation_expression === '' || c.generation_expression === null)
        .map(c => quoteId(c.name)).join(',');
      await conn.query(`INSERT INTO ${dest} (${fields}) SELECT ${fields} FROM ${quoteId(name)}`);
    }
  } catch (error) { throw failure(`备份未完成，未执行结构变更；备份库：${database}；${error.message}`, 500); }
  return database;
}

export async function reconcileDatabaseSchema({ preview = false, planToken } = {}) {
  if (!preview && (typeof planToken !== 'string' || !/^[a-f0-9]{64}$/.test(planToken))) throw failure('请先预览结构差异，再确认同步', 400);
  const conn = await mysql.createConnection(config());
  let lockName, locked = false, backupDatabase = null;
  let applied = 0;
  try {
    const [[{ name: database }]] = await conn.query('SELECT DATABASE() AS name');
    lockName = 'hj_schema_sync_' + hash(database).slice(0, 40);
    const [[{ acquired }]] = await conn.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (acquired !== 1) throw failure('另一个结构同步正在执行，请稍后重试');
    locked = true;
    // Strict conversions prevent silent string truncation / invalid default coercion.
    await conn.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    await conn.query('SET SESSION lock_wait_timeout = 15');
    await conn.query('SET SESSION innodb_lock_wait_timeout = 15');
    const target = await buildReference(conn);
    const actual = await readSchema(conn);
    const plan = planSchema(actual, target);
    const token = hash({ database, actual, target });
    const summary = { database, tableCount: target.length, changes: plan.changes, unmanagedTables: plan.unmanagedTables, planToken: token };
    if (preview) return summary;
    if (token !== planToken) throw failure('数据库结构或部署代码已变化，请重新预览后确认');
    const [[{ count: triggers }]] = await conn.query('SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
    if (Number(triggers) && plan.statements.length) throw failure('当前库存在触发器，需先核对其字段依赖，已停止自动同步');
    const [[{ count: views }]] = await conn.query("SELECT COUNT(*) AS count FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()");
    if (Number(views) && plan.statements.length) throw failure('当前库存在视图，需先核对其字段依赖，已停止自动同步');
    backupDatabase = await backupTables(conn, actual, plan);
    if (!same(actual, await readSchema(conn))) throw failure('备份期间数据库结构发生变化，已停止同步，请重新预览');
    // DDL auto-commits in MySQL. Do not promise rollback or hide partial failures.
    for (const sql of [...plan.dropStatements, ...plan.tableStatements]) { await conn.query(sql); applied++; }
    // Materialize any missing supporting indexes before restoring foreign keys.
    const intermediate = byName(await readSchema(conn));
    for (const table of target) {
      const missing = diffIndexes(intermediate.get(table.name)?.indexes || [], table.indexes).add;
      for (const index of missing) {
        await conn.query(`ALTER TABLE ${quoteId(table.name)} ADD ${index.definition}`); applied++;
      }
    }
    for (const sql of plan.addStatements) { await conn.query(sql); applied++; }
    const remaining = planSchema(await readSchema(conn), target);
    if (remaining.statements.length) throw failure('同步后仍存在结构差异，未标记成功：' + [...new Set(remaining.changes.map(c => c.table + '.' + c.name))].join('、'), 500);
    return { ...summary, success: true, backupDatabase, appliedStatements: applied, syncedAt: new Date().toISOString() };
  } catch (error) {
    if (backupDatabase) error.message += `；已执行 ${applied} 条结构变更，备份库：${backupDatabase}。请在恢复业务前核对结果`;
    error.statusCode ||= 500;
    throw error;
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    await conn.end();
  }
}
