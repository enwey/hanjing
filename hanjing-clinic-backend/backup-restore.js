import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'hanjing_clinic';

const backupDir = './backups';

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === '--backup') {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const filename = `backup_${DB_NAME}_${timestamp}.sql`;
  const filepath = path.join(backupDir, filename);

  console.log(`\n[Backup] Starting database backup for "${DB_NAME}"...`);
  
  // Set password using environment variable to avoid safety warning on CLI
  const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };
  const cmd = `mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_NAME} > "${filepath}"`;

  exec(cmd, { env }, (err, stdout, stderr) => {
    if (err) {
      console.error(`\n[Backup Error] Failed to create backup:`, err.message);
      console.error(stderr);
      process.exit(1);
    }
    console.log(`\n[Backup Success] Database backup completed successfully!`);
    console.log(`[Backup File] Saved to: ${filepath}`);
  });
} else if (command === '--restore') {
  const backupFile = args[1];
  if (!backupFile) {
    console.error('\nError: Please specify the backup file to restore.');
    console.error('Usage: node backup-restore.js --restore <backup-file-path>');
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`\nError: Backup file not found at: ${backupFile}`);
    process.exit(1);
  }

  console.log(`\n[Restore] Restoring database "${DB_NAME}" from file "${backupFile}"...`);

  const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };
  const cmd = `mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_NAME} < "${backupFile}"`;

  exec(cmd, { env }, (err, stdout, stderr) => {
    if (err) {
      console.error(`\n[Restore Error] Failed to restore database:`, err.message);
      console.error(stderr);
      process.exit(1);
    }
    console.log(`\n[Restore Success] Database restored successfully!`);
  });
} else {
  console.log('\n================================================');
  console.log(' Hanjing Clinic Database Backup & Restore Utility');
  console.log('================================================');
  console.log('Usage:');
  console.log('  Backup:  node backup-restore.js --backup');
  console.log('  Restore: node backup-restore.js --restore <backup-file-path>\n');
}
