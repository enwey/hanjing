import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, planSchema, quoteId, reconcileDatabaseSchema } from '../schema-sync.js';
const table = (body, name = 'items') => parseTable(name, `CREATE TABLE \`${name}\` (\n${body}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
const base = table('  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `name` varchar(100) DEFAULT NULL,\n  PRIMARY KEY (`id`)');
test('removes obsolete fields and their indexes without dropping whole tables', () => {
  const old = table('  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `name` varchar(100) DEFAULT NULL,\n  `obsolete` int DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_old` (`obsolete`)');
  const plan = planSchema([old, table('  `legacy` int DEFAULT NULL', 'external')], [base]);
  assert.match(plan.statements[0], /DROP INDEX `idx_old`, DROP COLUMN `obsolete`/);
  assert.deepEqual(plan.unmanagedTables, ['external']);
  assert.ok(!plan.statements.some(s => /DROP TABLE/.test(s)));
});
test('corrects types, nullability, defaults and column order', () => {
  const old = table('  `name` varchar(20) NOT NULL DEFAULT \'old\',\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (`id`)');
  const plan = planSchema([old], [base]);
  assert.match(plan.statements[0], /MODIFY COLUMN `id`.* FIRST/);
  assert.match(plan.statements[0], /MODIFY COLUMN `name` varchar\(100\) DEFAULT NULL AFTER `id`/);
});
test('identical structures are idempotent and sequence values are ignored', () => {
  const old = parseTable('items', 'CREATE TABLE `items` (\n  `id` int NOT NULL\n) ENGINE=InnoDB AUTO_INCREMENT=123');
  const target = parseTable('items', 'CREATE TABLE `items` (\n  `id` int NOT NULL\n) ENGINE=InnoDB');
  assert.equal(planSchema([old], [target]).statements.length, 0);
});
test('drops incoming foreign key before referenced change and restores it afterwards', () => {
  const child = table('  `item_id` bigint unsigned DEFAULT NULL,\n  KEY `item_id` (`item_id`),\n  CONSTRAINT `fk_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)', 'child');
  const old = table('  `id` int unsigned NOT NULL AUTO_INCREMENT,\n  `name` varchar(50) DEFAULT NULL,\n  PRIMARY KEY (`id`)');
  const plan = planSchema([old, child], [base, child]);
  assert.match(plan.statements[0], /DROP FOREIGN KEY/);
  assert.match(plan.statements.at(-1), /ADD CONSTRAINT/);
  assert.throws(() => planSchema([old, child], [base]), /未纳管表/);
});
test('empty targets, unsupported table options and cross-schema references fail closed', () => {
  assert.throws(() => planSchema([base], []), /目标结构为空/);
  assert.throws(() => planSchema([{ ...base, options: 'ENGINE=MyISAM' }], [base]), /表选项/);
  assert.throws(() => table('  `id` int,\n  CONSTRAINT `fk` FOREIGN KEY (`id`) REFERENCES `other`.`tbl` (`id`)'), /跨库/);
  assert.equal(quoteId('a`b'), '`a``b`');
});
test('execution requires a preview token before any database access', async () => {
  await assert.rejects(reconcileDatabaseSchema(), {statusCode:400});
});
test('equivalent FK index names converge while redundant indexes are removed', () => {
  const desired = table('  `id` int DEFAULT NULL,\n  KEY `id` (`id`)');
  const renamed = table('  `id` int DEFAULT NULL,\n  KEY `fk_items` (`id`)');
  assert.equal(planSchema([renamed],[desired]).statements.length,0);
  const duplicate = table('  `id` int DEFAULT NULL,\n  KEY `id` (`id`),\n  KEY `redundant` (`id`)');
  assert.match(planSchema([duplicate],[desired]).statements[0],/DROP INDEX `redundant`/);
});
test('inherited column collation is normalized without changing quoted defaults', () => {
  const desired = table("  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT ' COLLATE utf8mb4_unicode_ci'");
  const actual = table("  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT ' COLLATE utf8mb4_unicode_ci'");
  assert.equal(planSchema([actual],[desired]).statements.length,0);
  assert.match(actual.columns[0].definition,/DEFAULT ' COLLATE utf8mb4_unicode_ci'/);
});
