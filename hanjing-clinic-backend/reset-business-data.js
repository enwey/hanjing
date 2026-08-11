import { query, get } from './db.js';

const CONFIRM_TOKEN = 'RESET_PRODUCTION_BUSINESS_DATA';
const EXECUTE_FLAG = '--execute';
const DRY_RUN_FLAG = '--dry-run';
const FORCE_FLAG = '--force';

const BUSINESS_TABLES = [
  'community_reports',
  'post_comment_likes',
  'community_post_views',
  'community_post_favorites',
  'community_post_likes',
  'post_comments',
  'community_posts',
  'wechat_subscribe_logs',
  'user_notifications',
  'points_logs',
  'withdraw_records',
  'distribution_orders',
  'distribution_relationships',
  'distributors',
  'user_coupons',
  'order_items',
  'orders',
  'patient_crm_records',
  'follow_up_records',
  'follow_up_tasks',
  'appointment_pre_exams',
  'appointment_evaluations',
  'device_feedback',
  'device_maintenance',
  'treatment_timelines',
  'wearing_records',
  'wearing_logs',
  'device_adjustments',
  'patient_devices',
  'treatment_records',
  'medical_records',
  'appointments',
  'snore_assessments',
  'ess_assessments',
  'im_messages',
  'user_patient_links',
  'patients',
  'users',
  'audit_logs',
];

const PRESERVED_TABLES = [
  'admin_users',
  'roles',
  'permissions',
  'stores',
  'store_features',
  'store_hours',
  'doctors',
  'doctor_store_mapping',
  'doctor_schedules',
  'products',
  'product_categories',
  'coupons',
  'live_rooms',
  'content_banners',
  'article_categories',
  'system_settings',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const execute = args.includes(EXECUTE_FLAG);
  const dryRun = args.includes(DRY_RUN_FLAG) || !execute;
  const force = args.includes(FORCE_FLAG);
  const confirmIndex = args.indexOf('--confirm');
  const confirmToken = confirmIndex > -1 ? String(args[confirmIndex + 1] || '') : '';
  return { execute, dryRun, force, confirmToken };
}

async function listExistingTables() {
  const rows = await query('SHOW TABLES');
  return new Set(rows.map((row) => String(Object.values(row)[0] || '')));
}

async function countRows(table) {
  const row = await get(`SELECT COUNT(*) AS total FROM \`${table}\``);
  return Number(row?.total || 0);
}

async function buildPlan() {
  const existingTables = await listExistingTables();
  const targets = [];
  let totalRows = 0;

  for (const table of BUSINESS_TABLES) {
    if (!existingTables.has(table)) {
      continue;
    }
    const rows = await countRows(table);
    totalRows += rows;
    targets.push({ table, rows });
  }

  return { existingTables, targets, totalRows };
}

async function truncateTables(targets) {
  await query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const item of targets) {
      await query(`TRUNCATE TABLE \`${item.table}\``);
      console.log(`Cleared ${item.table}`);
    }
  } finally {
    await query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

function printUsage() {
  console.log(`
Usage:
  node reset-business-data.js --dry-run
  node reset-business-data.js --execute --confirm ${CONFIRM_TOKEN}

Notes:
  - This tool preserves admin/config/master tables.
  - By default it only previews the cleanup plan.
  - Use --force to execute even when all target tables are already empty.
`);
}

async function main() {
  const { execute, dryRun, force, confirmToken } = parseArgs(process.argv);

  if (!execute && !dryRun) {
    printUsage();
    process.exit(1);
  }

  const { existingTables, targets, totalRows } = await buildPlan();
  const preservedExisting = PRESERVED_TABLES.filter((table) => existingTables.has(table));

  console.log('Business data reset plan');
  console.log('------------------------');
  console.log(`Target tables: ${targets.length}`);
  console.log(`Rows to clear: ${totalRows}`);
  console.log(`Preserved tables: ${preservedExisting.join(', ') || 'None detected'}`);
  console.log('');

  if (!targets.length) {
    console.log('No target business tables were found in the current database.');
    return;
  }

  targets.forEach((item) => {
    console.log(`${item.table}: ${item.rows}`);
  });

  if (dryRun) {
    console.log('');
    console.log('Dry run only. No data was changed.');
    console.log(`To execute, run: node reset-business-data.js --execute --confirm ${CONFIRM_TOKEN}`);
    return;
  }

  if (confirmToken !== CONFIRM_TOKEN) {
    console.error('Confirmation token mismatch. Aborted.');
    console.error(`Expected: ${CONFIRM_TOKEN}`);
    process.exit(1);
  }

  if (!force && totalRows === 0) {
    console.log('All target business tables are already empty. Nothing to do.');
    return;
  }

  await truncateTables(targets);
  console.log('');
  console.log('Business data reset complete.');
}

main().catch((error) => {
  console.error('Failed to reset business data:', error);
  process.exit(1);
});
