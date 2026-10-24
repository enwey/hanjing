import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateUniquePatientNo } from './patientNo.js';
import { initDeliverySchema } from './delivery-schema.js';
import { initBackendPromoterSchema } from './backend-promoter-schema.js';
import { initPatientProfileSchema } from './patient-profile-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

let pool;

export const closePool = async () => {
  if (pool) await pool.end();
  pool = null;
};

const formatShanghaiDateTime = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}:${read('second')}`;
};

export const initPool = async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'hanjing_clinic',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 100,
    connectTimeout: 10000,
    timezone: '+08:00'
  });

  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+08:00'");
  });
};

export const query = async (sql, params = []) => {
  if (!pool) await initPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
};

export const rawQuery = async (sql) => {
  if (!pool) await initPool();
  const [rows, fields] = await pool.query(sql);
  return { rows, fields };
};

export const get = async (sql, params = []) => {
  if (!pool) await initPool();
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
};

export const run = async (sql, params = []) => {
  if (!pool) await initPool();
  const [result] = await pool.execute(sql, params);
  return { id: result.insertId, changes: result.affectedRows };
};

export const transaction = async (callback) => {
  if (!pool) await initPool();
  const connection = await pool.getConnection();
  try {
    // Row locks serialize writes; fresh statement snapshots keep membership
    // totals current after waiting for another payment's user lock.
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const autoUpdateExpiredAppointments = async () => {
  try {
    const nowInShanghai = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const todayStr = `${nowInShanghai.getFullYear()}-${String(nowInShanghai.getMonth() + 1).padStart(2, '0')}-${String(nowInShanghai.getDate()).padStart(2, '0')}`;
    await run(
      `UPDATE appointments
       SET status = 'no_show', updated_at = CURRENT_TIMESTAMP
       WHERE appointment_date < ?
         AND status IN ('pending', 'confirmed', 'pending_payment')`,
      [todayStr]
    );
  } catch (err) {
    console.error('Failed to auto update expired appointments:', err);
  }
};

export const autoSettleDistributionCommissions = async () => {
  const { settleCommissions } = await import('./distribution-ledger.js');
  return settleCommissions();
};


// Initialize Tables
export const initDB = async () => {
  console.log('Initializing MySQL connection...');

  // 1. Temporary connection to make sure DB exists
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root'
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'hanjing_clinic'}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();

  // 2. Initialize pool
  if (!pool) await initPool();
  await query(`CREATE TABLE IF NOT EXISTS private_uploads (
    file_path VARCHAR(255) PRIMARY KEY, user_id BIGINT UNSIGNED NULL, admin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_private_upload_user (user_id)
  )`);

  console.log('Verifying/creating MySQL tables...');

  // Disable Foreign Key checks for DDL setup
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // 1. users
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      openid VARCHAR(64) UNIQUE NOT NULL,
      unionid VARCHAR(64) UNIQUE,
      phone VARCHAR(20) UNIQUE,
      phone_verified_at TIMESTAMP NULL,
      password_hash VARCHAR(255) DEFAULT NULL,
      nickname VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(255),
      gender TINYINT DEFAULT 0,
      birthday DATE,
      points INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 2. patients
  await query(`
    CREATE TABLE IF NOT EXISTS patients (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_no VARCHAR(32) UNIQUE,
      user_id BIGINT UNSIGNED DEFAULT NULL,
      name VARCHAR(100) NOT NULL,
      relation VARCHAR(30) DEFAULT 'self',
      gender TINYINT DEFAULT 0,
      age INT,
      phone VARCHAR(100),
      source VARCHAR(30) DEFAULT 'mini_app',
      has_snore TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE patients ADD COLUMN id_card VARCHAR(100) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE patients ADD COLUMN card_no VARCHAR(50) DEFAULT NULL;`);
  } catch (err) {}
  await initPatientProfileSchema(query);
  try {
    await query(`ALTER TABLE users MODIFY COLUMN phone VARCHAR(100) UNIQUE DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMP NULL DEFAULT NULL AFTER phone;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL AFTER phone;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE users ADD COLUMN self_patient_id BIGINT UNSIGNED DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE users ADD CONSTRAINT fk_users_self_patient FOREIGN KEY (self_patient_id) REFERENCES patients(id) ON DELETE SET NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE patients MODIFY COLUMN user_id BIGINT UNSIGNED DEFAULT NULL;`);
  } catch (err) {}
  try {
    const patientUserFkRows = await query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'patients'
        AND COLUMN_NAME = 'user_id'
        AND REFERENCED_TABLE_NAME = 'users'
    `);
    for (const row of patientUserFkRows) {
      if (!row.CONSTRAINT_NAME) continue;
      try {
        await query(`ALTER TABLE patients DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      } catch (err) {}
    }
    await query(`ALTER TABLE patients ADD CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;`);
  } catch (err) {}

  await query(`
    CREATE TABLE IF NOT EXISTS member_levels (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL,
      spent_required INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      color VARCHAR(20) DEFAULT NULL,
      bg_color VARCHAR(20) DEFAULT NULL,
      benefits JSON NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);
  const memberLevelDefaults = [
    ['normal', '普通会员', 0, 0, '#9CA3AF', '#F3F4F6', [{ icon: 'appointment', title: '在线预约', desc: '随时预约睡眠门诊' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }]],
    ['silver', '白银会员', 100000, 10, '#6B7280', '#F3F4F6', [{ icon: 'appointment', title: '在线预约', desc: '优先时段选择' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物9.5折', desc: '商城商品享95折优惠' }]],
    ['gold', '黄金会员', 300000, 20, '#F5A623', '#FFF9E6', [{ icon: 'appointment', title: '在线预约', desc: 'VIP优先预约通道' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物9折', desc: '商城商品享9折优惠' }, { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' }, { icon: 'channel', title: '分销权限', desc: '可申请成为推广员' }]],
    ['diamond', '钻石会员', 1000000, 30, '#3B6BF5', '#EEF4FF', [{ icon: 'appointment', title: '在线预约', desc: '院长级专家优先约' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物8.5折', desc: '商城商品享85折优惠' }, { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' }, { icon: 'channel', title: '分销权限', desc: '推广员+高佣金比例' }, { icon: 'free', title: '年度免费检查', desc: '每年1次免费睡眠监测' }]],
  ];
  for (const [code, name, spentRequired, sortOrder, color, bgColor, benefits] of memberLevelDefaults) {
    await query(`INSERT IGNORE INTO member_levels (code, name, spent_required, sort_order, color, bg_color, benefits)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [code, name, spentRequired, sortOrder, color, bgColor, JSON.stringify(benefits)]);
  }
  await query(`
    CREATE TABLE IF NOT EXISTS user_memberships (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      level_id BIGINT UNSIGNED NOT NULL,
      effective_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (level_id) REFERENCES member_levels(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_membership_history (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      from_level_id BIGINT UNSIGNED DEFAULT NULL,
      to_level_id BIGINT UNSIGNED NOT NULL,
      total_spent INT NOT NULL DEFAULT 0,
      reason VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_membership_history_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (from_level_id) REFERENCES member_levels(id) ON DELETE SET NULL,
      FOREIGN KEY (to_level_id) REFERENCES member_levels(id) ON DELETE RESTRICT
    );
  `);
  // Preserve legacy membership before switching readers to the new table.
  const legacyMemberColumn = await query("SHOW COLUMNS FROM users LIKE 'member_level'");
  const protectedMemberColumn = await query("SHOW COLUMNS FROM user_memberships LIKE 'protected_level_id'");
  if (!protectedMemberColumn.length) {
    await query('ALTER TABLE user_memberships ADD COLUMN protected_level_id BIGINT UNSIGNED DEFAULT NULL');
    // Backfill once: explicit admin choices take precedence over legacy fields.
    await query(`UPDATE user_memberships m SET protected_level_id =
      (SELECT h.to_level_id FROM user_membership_history h WHERE h.user_id=m.user_id
        AND h.reason IN ('admin_adjustment','admin_create_patient','admin_update_patient') ORDER BY h.id DESC LIMIT 1)`);
    if (legacyMemberColumn.length) {
      await query(`UPDATE user_memberships m JOIN users u ON u.id=m.user_id
        JOIN member_levels l ON l.code=u.member_level
        SET m.protected_level_id=l.id WHERE m.protected_level_id IS NULL`);
    }
  }
  await query(`
    INSERT INTO user_memberships (user_id, level_id, protected_level_id, effective_at)
    SELECT u.id, COALESCE(legacy.id, fallback.id), legacy.id, CURRENT_TIMESTAMP
    FROM users u
    JOIN member_levels fallback ON fallback.code = 'normal' AND fallback.status = 'active'
    LEFT JOIN member_levels legacy ON legacy.code = ${legacyMemberColumn.length ? 'u.member_level' : 'NULL'}
    LEFT JOIN user_memberships existing ON existing.user_id = u.id
    WHERE existing.user_id IS NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_patient_links (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      relation VARCHAR(30) DEFAULT 'other',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_patient_link (user_id, patient_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 3. stores
  await query(`
    CREATE TABLE IF NOT EXISTS stores (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(30) UNIQUE NOT NULL,
      address VARCHAR(255) NOT NULL,
      city VARCHAR(50),
      district VARCHAR(50),
      latitude DECIMAL(10, 7),
      longitude DECIMAL(10, 7),
      phone VARCHAR(30),
      open_time TIME DEFAULT '09:00:00',
      close_time TIME DEFAULT '18:00:00',
      status VARCHAR(30) DEFAULT 'open',
      has_parking TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    await query(`ALTER TABLE stores ADD COLUMN cover_url VARCHAR(255) DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE stores ADD COLUMN image_urls JSON DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  // 4. store_features
  await query(`
    CREATE TABLE IF NOT EXISTS store_features (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      store_id BIGINT UNSIGNED NOT NULL,
      feature VARCHAR(100) NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 4.1 store_hours
  await query(`
    CREATE TABLE IF NOT EXISTS store_hours (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      store_id BIGINT UNSIGNED NOT NULL,
      open_time TIME NOT NULL,
      close_time TIME NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 5. doctors
  await query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(255),
      title VARCHAR(50) NOT NULL,
      specialty VARCHAR(100) NOT NULL,
      hospital VARCHAR(100),
      intro TEXT,
      experience_years INT DEFAULT 0,
      rating DECIMAL(2, 1) DEFAULT 5.0,
      consult_fee INT DEFAULT 0,
      status TINYINT DEFAULT 1,
      expertise JSON DEFAULT NULL,
      exposure_count INT DEFAULT 0,
      is_new TINYINT DEFAULT 1
    );
  `);
  try {
    await query(`ALTER TABLE doctors ADD COLUMN expertise JSON DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE doctors ADD COLUMN exposure_count INT DEFAULT 0;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE doctors ADD COLUMN is_new TINYINT DEFAULT 1;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE patients ADD COLUMN patient_no VARCHAR(32) UNIQUE;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE patients ADD COLUMN source VARCHAR(30) DEFAULT 'mini_app';`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    const patientsWithoutNo = await query(`SELECT id FROM patients WHERE patient_no IS NULL OR patient_no = ''`);
    for (const patient of patientsWithoutNo) {
      const patientNo = await generateUniquePatientNo(async (candidate) => {
        const row = await get(`SELECT id FROM patients WHERE patient_no = ? LIMIT 1`, [candidate]);
        return Boolean(row);
      });
      await run(`UPDATE patients SET patient_no = ? WHERE id = ?`, [patientNo, patient.id]);
    }
  } catch (err) {
    console.error('Failed to backfill patient numbers:', err);
  }

  try {
    await query(`
      UPDATE patients
      SET patient_no = card_no
      WHERE (patient_no IS NULL OR patient_no = '')
        AND card_no IS NOT NULL
        AND card_no != ''
    `);
  } catch (err) {
    console.error('Failed to backfill patient_no from card_no:', err);
  }

  try {
    await query(`
      UPDATE patients
      SET card_no = patient_no
      WHERE patient_no IS NOT NULL
        AND patient_no != ''
        AND (card_no IS NULL OR card_no = '')
    `);
  } catch (err) {
    console.error('Failed to sync card_no from patient_no:', err);
  }

  try {
    await query(`
      INSERT IGNORE INTO user_patient_links (user_id, patient_id, relation)
      SELECT user_id, id, COALESCE(NULLIF(relation, ''), 'other')
      FROM patients
      WHERE user_id IS NOT NULL
    `);
  } catch (err) {
    console.error('Failed to backfill user-patient links:', err);
  }

  try {
    await query(`
      UPDATE users u
      JOIN user_patient_links upl ON upl.user_id = u.id AND upl.relation = 'self'
      SET u.self_patient_id = upl.patient_id
      WHERE u.self_patient_id IS NULL
    `);
  } catch (err) {
    console.error('Failed to backfill users.self_patient_id from links:', err);
  }

  try {
    await query(`
      UPDATE users u
      JOIN patients p ON p.user_id = u.id AND p.relation = 'self'
      SET u.self_patient_id = p.id
      WHERE u.self_patient_id IS NULL
    `);
  } catch (err) {
    console.error('Failed to backfill users.self_patient_id:', err);
  }

  try {
    await query(`ALTER TABLE patients ADD COLUMN medical_history TEXT DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE patients ADD COLUMN allergy_history TEXT DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    await query(`ALTER TABLE doctor_schedules ADD COLUMN people_per_slot INT DEFAULT 1;`);
  } catch (err) {
    // Ignore error if column already exists
  }



  // 6. doctor_store_mapping
  await query(`
    CREATE TABLE IF NOT EXISTS doctor_store_mapping (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      doctor_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 7. doctor_schedules
  await query(`
    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      doctor_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      date DATE NOT NULL,
      period VARCHAR(30) NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      total_slots INT DEFAULT 6,
      people_per_slot INT DEFAULT 1,
      booked_slots INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'available',
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 8. ess_assessments
  await query(`
    CREATE TABLE IF NOT EXISTS ess_assessments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED DEFAULT NULL,
      total_score INT NOT NULL,
      risk_level VARCHAR(50) NOT NULL,
      answers JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 9. snore_assessments
  await query(`
    CREATE TABLE IF NOT EXISTS snore_assessments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED DEFAULT NULL,
      file_url VARCHAR(255) NOT NULL,
      duration INT NOT NULL,
      avg_decibel INT NOT NULL,
      peak_decibel INT NOT NULL,
      snore_rate INT NOT NULL,
      apnea_events INT NOT NULL,
      risk_level VARCHAR(30) DEFAULT 'low',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // Nullable keys preserve legacy records. Unique ownership-scoped keys also
  // serialize simultaneous retries across backend processes.
  for (const sql of [
    'ALTER TABLE snore_assessments ADD COLUMN risk_score INT DEFAULT NULL',
    'ALTER TABLE snore_assessments ADD COLUMN analysis_version INT NOT NULL DEFAULT 1',
    'ALTER TABLE snore_assessments ADD COLUMN client_record_key CHAR(64) DEFAULT NULL',
    'ALTER TABLE snore_assessments ADD COLUMN client_payload_hash CHAR(64) DEFAULT NULL',
    'ALTER TABLE snore_assessments ADD UNIQUE KEY uq_snore_client_record (user_id, client_record_key)'
  ]) {
    try { await query(sql); } catch (error) {
      if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error.code)) throw error;
    }
  }

  // 10. appointments
  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      appointment_no VARCHAR(64) UNIQUE NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      schedule_id BIGINT UNSIGNED NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time VARCHAR(50) NOT NULL,
      type VARCHAR(30) DEFAULT 'first',
      status VARCHAR(30) DEFAULT 'pending',
      symptom_desc TEXT,
      cancel_reason VARCHAR(255),
      source VARCHAR(30) DEFAULT 'mini_app',
      ess_assessment_id BIGINT UNSIGNED,
      snore_assessment_id BIGINT UNSIGNED,
      doctor_name VARCHAR(100) DEFAULT NULL,
      doctor_title VARCHAR(50) DEFAULT NULL,
      doctor_specialty VARCHAR(100) DEFAULT NULL,
      doctor_avatar VARCHAR(255) DEFAULT NULL,
      consult_fee INT DEFAULT 0,
      deposit_amount INT DEFAULT 0,
      store_name VARCHAR(100) DEFAULT NULL,
      postpone_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES doctor_schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (ess_assessment_id) REFERENCES ess_assessments(id) ON DELETE SET NULL,
      FOREIGN KEY (snore_assessment_id) REFERENCES snore_assessments(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE appointments ADD COLUMN deposit_amount INT DEFAULT 0;`);
  } catch (err) {
    // ignore
  }

  try {
    await query(`ALTER TABLE appointments ADD COLUMN doctor_name VARCHAR(100) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN doctor_title VARCHAR(50) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN doctor_specialty VARCHAR(100) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN doctor_avatar VARCHAR(255) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN consult_fee INT DEFAULT 0;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN store_name VARCHAR(100) DEFAULT NULL;`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE appointments ADD COLUMN source VARCHAR(30) DEFAULT 'mini_app';`);
  } catch (err) {}

  try {
    await query(`
      UPDATE appointments
      SET
        doctor_name = (SELECT name FROM doctors WHERE doctors.id = appointments.doctor_id),
        doctor_title = (SELECT title FROM doctors WHERE doctors.id = appointments.doctor_id),
        doctor_specialty = (SELECT specialty FROM doctors WHERE doctors.id = appointments.doctor_id),
        doctor_avatar = (SELECT avatar_url FROM doctors WHERE doctors.id = appointments.doctor_id),
        consult_fee = (SELECT consult_fee FROM doctors WHERE doctors.id = appointments.doctor_id),
        store_name = (SELECT name FROM stores WHERE stores.id = appointments.store_id)
      WHERE doctor_name IS NULL OR store_name IS NULL
    `);
  } catch (err) {
    console.error('Failed to run appointments data migration:', err);
  }

  // 11. medical_records
  await query(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      appointment_id BIGINT UNSIGNED,
      visit_date DATE NOT NULL,
      diagnosis TEXT NOT NULL,
      prescription TEXT,
      doctor_advice TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE medical_records ADD COLUMN type VARCHAR(30) DEFAULT 'first';`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE medical_records ADD COLUMN attachments TEXT DEFAULT NULL;`);
  } catch (err) {}

  // 12. treatment_records
  await query(`
    CREATE TABLE IF NOT EXISTS treatment_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      medical_record_id BIGINT UNSIGNED,
      device_product_id BIGINT UNSIGNED,
      device_product_name VARCHAR(255),
      device_product_image_url VARCHAR(255),
      device_product_price INT DEFAULT 0,
      device_product_description TEXT,
      device_model VARCHAR(100) NOT NULL,
      initial_advancement DECIMAL(4, 2) DEFAULT 0.0,
      current_advancement DECIMAL(4, 2) DEFAULT 0.0,
      start_date DATE NOT NULL,
      next_adjust_date DATE,
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL
    );
  `);
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN device_product_id BIGINT UNSIGNED NULL AFTER medical_record_id`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN device_product_name VARCHAR(255) NULL AFTER device_product_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN device_product_image_url VARCHAR(255) NULL AFTER device_product_name`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN device_product_price INT DEFAULT 0 AFTER device_product_image_url`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN device_product_description TEXT NULL AFTER device_product_price`);
  } catch (err) {}
  try {
    await query(`UPDATE treatment_records SET device_product_name = device_model WHERE device_product_name IS NULL OR device_product_name = ''`);
  } catch (err) {}
  try {
    await query(`
      UPDATE treatment_records tr
      JOIN products p ON tr.device_product_id = p.id
      SET tr.device_product_name = COALESCE(NULLIF(tr.device_product_name, ''), p.name),
          tr.device_product_image_url = COALESCE(NULLIF(tr.device_product_image_url, ''), p.image_url),
          tr.device_product_price = CASE WHEN tr.device_product_price IS NULL OR tr.device_product_price = 0 THEN p.price ELSE tr.device_product_price END,
          tr.device_product_description = COALESCE(NULLIF(tr.device_product_description, ''), p.description)
      WHERE tr.device_product_id IS NOT NULL
    `);
  } catch (err) {}
  await query(`
    CREATE TABLE IF NOT EXISTS patient_devices (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      bind_treatment_record_id BIGINT UNSIGNED DEFAULT NULL,
      bind_medical_record_id BIGINT UNSIGNED DEFAULT NULL,
      bind_doctor_id BIGINT UNSIGNED DEFAULT NULL,
      device_product_id BIGINT UNSIGNED DEFAULT NULL,
      device_name_snapshot VARCHAR(255) DEFAULT NULL,
      device_image_snapshot VARCHAR(255) DEFAULT NULL,
      device_price_snapshot INT DEFAULT 0,
      device_description_snapshot TEXT,
      device_model VARCHAR(100) NOT NULL,
      initial_advancement DECIMAL(4, 2) DEFAULT 0.0,
      current_advancement DECIMAL(4, 2) DEFAULT 0.0,
      bound_at DATE NOT NULL,
      next_adjust_date DATE DEFAULT NULL,
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (bind_treatment_record_id) REFERENCES treatment_records(id) ON DELETE SET NULL,
      FOREIGN KEY (bind_medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
      FOREIGN KEY (bind_doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
    );
  `);
  try {
    await query(`ALTER TABLE treatment_records ADD COLUMN patient_device_id BIGINT UNSIGNED DEFAULT NULL AFTER medical_record_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE treatment_records ADD CONSTRAINT fk_treatment_records_patient_device FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE treatment_records ADD CONSTRAINT fk_treatment_records_product FOREIGN KEY (device_product_id) REFERENCES products(id) ON DELETE SET NULL`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE patient_devices ADD CONSTRAINT fk_patient_devices_product FOREIGN KEY (device_product_id) REFERENCES products(id) ON DELETE SET NULL`);
  } catch (err) {}
  try {
    await query(`
      INSERT INTO patient_devices (
        patient_id, bind_treatment_record_id, bind_medical_record_id, bind_doctor_id, device_product_id,
        device_name_snapshot, device_image_snapshot, device_price_snapshot, device_description_snapshot,
        device_model, initial_advancement, current_advancement, bound_at, next_adjust_date, status
      )
      SELECT
        tr.patient_id,
        tr.id,
        tr.medical_record_id,
        tr.doctor_id,
        tr.device_product_id,
        tr.device_product_name,
        tr.device_product_image_url,
        COALESCE(tr.device_product_price, 0),
        tr.device_product_description,
        tr.device_model,
        COALESCE(tr.initial_advancement, 0),
        COALESCE(tr.current_advancement, 0),
        COALESCE(tr.start_date, DATE(tr.created_at)),
        tr.next_adjust_date,
        COALESCE(tr.status, 'active')
      FROM treatment_records tr
      LEFT JOIN patient_devices pd ON pd.bind_treatment_record_id = tr.id
      WHERE pd.id IS NULL
        AND COALESCE(NULLIF(tr.device_model, ''), NULLIF(tr.device_product_name, '')) IS NOT NULL
    `);
  } catch (err) {
    console.error('Failed to backfill patient_devices from treatment_records:', err);
  }
  try {
    await query(`
      UPDATE treatment_records tr
      JOIN patient_devices pd ON pd.bind_treatment_record_id = tr.id
      SET tr.patient_device_id = pd.id
      WHERE tr.patient_device_id IS NULL
    `);
  } catch (err) {
    console.error('Failed to backfill treatment_records.patient_device_id:', err);
  }
  try {
    await query(`
      UPDATE patient_devices
      SET status = 'inactive'
      WHERE bind_medical_record_id IS NULL
        AND COALESCE(NULLIF(device_name_snapshot, ''), device_model) = '待适配阻鼾器'
        AND status = 'active'
    `);
  } catch (err) {
    console.error('Failed to deactivate placeholder patient devices:', err);
  }

  // 13. wearing_logs
  await query(`
    CREATE TABLE IF NOT EXISTS wearing_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      treatment_id BIGINT UNSIGNED DEFAULT NULL,
      date DATE NOT NULL,
      wear_duration DECIMAL(4, 2) DEFAULT 0.0,
      comfort TINYINT DEFAULT 3,
      pain_score TINYINT DEFAULT NULL,
      pain_locations JSON DEFAULT NULL,
      ahi_index DECIMAL(5, 2) DEFAULT NULL,
      note TEXT,
      source VARCHAR(30) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN patient_id BIGINT UNSIGNED DEFAULT NULL FIRST`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN patient_device_id BIGINT UNSIGNED DEFAULT NULL AFTER patient_id`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs MODIFY COLUMN patient_id BIGINT UNSIGNED NOT NULL`);
  } catch (err) {
    // Ignore error when historical rows are not backfilled yet
  }
  try {
    await query(`ALTER TABLE wearing_logs MODIFY COLUMN treatment_id BIGINT UNSIGNED DEFAULT NULL`);
  } catch (err) {
    // Ignore error if already nullable
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD CONSTRAINT fk_wearing_logs_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE`);
  } catch (err) {
    // Ignore error if constraint already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD CONSTRAINT fk_wearing_logs_patient_device FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
  } catch (err) {
    // Ignore error if constraint already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN source VARCHAR(30) DEFAULT NULL`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN ahi_index DECIMAL(5, 2) DEFAULT NULL AFTER comfort`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN pain_score TINYINT DEFAULT NULL AFTER comfort`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD COLUMN pain_locations JSON DEFAULT NULL AFTER pain_score`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD UNIQUE KEY uniq_wearing_log_treatment_date_source (treatment_id, date, source)`);
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD UNIQUE KEY uniq_wearing_log_patient_date_source (patient_id, date, source)`);
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs ADD INDEX idx_wearing_logs_patient_id (patient_id)`);
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`ALTER TABLE wearing_logs DROP INDEX uniq_wearing_log_patient_date_source`);
  } catch (err) {
    // Ignore error if index does not exist
  }
  try {
    await query(`
      UPDATE wearing_logs wl
      JOIN treatment_records tr ON tr.id = wl.treatment_id
      SET wl.patient_id = tr.patient_id
      WHERE (wl.patient_id IS NULL OR wl.patient_id = 0)
    `);
  } catch (err) {
    console.error('Failed to backfill wearing_logs.patient_id:', err);
  }
  try {
    await query(`
      UPDATE wearing_logs wl
      JOIN treatment_records tr ON tr.id = wl.treatment_id
      SET wl.patient_device_id = tr.patient_device_id
      WHERE wl.patient_device_id IS NULL
    `);
  } catch (err) {
    console.error('Failed to backfill wearing_logs.patient_device_id:', err);
  }
  try {
    await query(`ALTER TABLE wearing_logs MODIFY COLUMN patient_id BIGINT UNSIGNED NOT NULL`);
  } catch (err) {
    // Ignore error if there are still unexpected legacy rows
  }

  // 14. device_adjustments
  await query(`
    CREATE TABLE IF NOT EXISTS device_adjustments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      treatment_id BIGINT UNSIGNED NOT NULL,
      adjust_date DATE NOT NULL,
      operator_id BIGINT UNSIGNED NOT NULL,
      adjusted_advancement DECIMAL(4, 2) NOT NULL,
      patient_feedback VARCHAR(255),
      instructions TEXT,
      FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE device_adjustments ADD COLUMN patient_device_id BIGINT UNSIGNED DEFAULT NULL FIRST`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE device_adjustments ADD CONSTRAINT fk_device_adjustments_patient_device FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
  } catch (err) {}
  try {
    await query(`
      UPDATE device_adjustments da
      JOIN treatment_records tr ON tr.id = da.treatment_id
      SET da.patient_device_id = tr.patient_device_id
      WHERE da.patient_device_id IS NULL
    `);
  } catch (err) {
    console.error('Failed to backfill device_adjustments.patient_device_id:', err);
  }

  // 17. products
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      gallery_urls JSON,
      price INT NOT NULL,
      original_price INT,
      description TEXT,
      stock INT DEFAULT 0,
      sales_count INT DEFAULT 0,
      is_distribution TINYINT DEFAULT 0,
      commission_rate DECIMAL(4, 2) DEFAULT 0.0,
      commission_rate_level1 DECIMAL(4, 2) DEFAULT 0.0,
      commission_rate_level2 DECIMAL(4, 2) DEFAULT 0.0,
      status VARCHAR(30) DEFAULT 'off',
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    await query(`ALTER TABLE products ADD COLUMN deleted_at TIMESTAMP NULL AFTER status`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE products ADD COLUMN commission_rate_level1 DECIMAL(4, 2) DEFAULT 0.0 AFTER commission_rate`);
    // Migrate only when introducing the column, never replace an intentional zero on restart.
    await query(`
      UPDATE products
      SET commission_rate_level1 = COALESCE(NULLIF(commission_rate_level1, 0), commission_rate, 0)
      WHERE COALESCE(commission_rate_level1, 0) = 0
    `);
  } catch (err) {}
  try {
    await query(`ALTER TABLE products ADD COLUMN commission_rate_level2 DECIMAL(4, 2) DEFAULT 0.0 AFTER commission_rate_level1`);
  } catch (err) {}

  await query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    await query(`UPDATE products SET category = 'accessory' WHERE category = 'product'`);
  } catch (e) {
    console.error('Failed to migrate legacy product category to accessory:', e);
  }

  try {
    await query(
      `INSERT INTO product_categories (code, name, sort_order)
       SELECT 'device', '医疗器械', 10
       WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'device')`
    );
    await query(
      `INSERT INTO product_categories (code, name, sort_order)
       SELECT 'accessory', '配件耗材', 20
       WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'accessory')`
    );
    await query(
      `INSERT INTO product_categories (code, name, sort_order)
       SELECT 'service', '服务套餐', 30
       WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'service')`
    );
    await query(
      `INSERT INTO product_categories (code, name, sort_order)
       SELECT DISTINCT p.category, p.category, 100
       FROM products p
       LEFT JOIN product_categories pc ON pc.code = p.category
       WHERE p.category IS NOT NULL AND p.category != '' AND pc.id IS NULL`
    );
  } catch (e) {
    console.error('Failed to seed product categories:', e);
  }

  // 18. coupons
  await query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(150) NOT NULL,
      type VARCHAR(50) NOT NULL,
      value INT NOT NULL,
      min_spend INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'active',
      valid_start DATE,
      valid_end DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 19. orders
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_no VARCHAR(64) UNIQUE NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(30) DEFAULT 'product',
      total_amount INT NOT NULL,
      discount_amount INT DEFAULT 0,
      coupon_id BIGINT UNSIGNED,
      pay_amount INT NOT NULL,
      pay_method VARCHAR(30) DEFAULT 'wechat',
      pay_at TIMESTAMP NULL,
      status VARCHAR(30) DEFAULT 'pending',
      appointment_id BIGINT UNSIGNED NULL,
      wechat_transaction_id VARCHAR(64) DEFAULT NULL,
      wechat_prepay_id VARCHAR(128) DEFAULT NULL,
      wechat_refund_id VARCHAR(64) DEFAULT NULL,
      wechat_refund_no VARCHAR(64) DEFAULT NULL,
      refund_at TIMESTAMP NULL,
      shipping_address JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
    );
  `);
  try {
    await query(`ALTER TABLE orders ADD COLUMN appointment_id BIGINT UNSIGNED NULL AFTER status`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN wechat_transaction_id VARCHAR(64) DEFAULT NULL AFTER appointment_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN wechat_prepay_id VARCHAR(128) DEFAULT NULL AFTER wechat_transaction_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN wechat_refund_id VARCHAR(64) DEFAULT NULL AFTER wechat_prepay_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN wechat_refund_no VARCHAR(64) DEFAULT NULL AFTER wechat_refund_id`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN refund_at TIMESTAMP NULL AFTER wechat_refund_no`);
  } catch (err) {}
  try {
    await query(`ALTER TABLE orders ADD COLUMN invoice_info JSON NULL DEFAULT NULL`);
  } catch (err) {}

  const cashierContextColumn = await query("SHOW COLUMNS FROM orders LIKE 'cashier_context'");
  if (!cashierContextColumn.length) await query('ALTER TABLE orders ADD COLUMN cashier_context JSON NULL');

  // 20. order_items
  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      product_image VARCHAR(255),
      price INT NOT NULL,
      quantity INT DEFAULT 1,
      is_distribution_snapshot TINYINT DEFAULT 0,
      commission_rate_snapshot DECIMAL(4, 2) DEFAULT 0.0,
      commission_rate_level1_snapshot DECIMAL(4, 2) DEFAULT 0.0,
      commission_rate_level2_snapshot DECIMAL(4, 2) DEFAULT 0.0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);
  let addedOrderItemDistributionSnapshot = false;
  try {
    await query(`ALTER TABLE order_items ADD COLUMN is_distribution_snapshot TINYINT DEFAULT 0`);
    addedOrderItemDistributionSnapshot = true;
  } catch (err) {}
  try {
    await query(`ALTER TABLE order_items ADD COLUMN commission_rate_snapshot DECIMAL(4, 2) DEFAULT 0.0`);
    addedOrderItemDistributionSnapshot = true;
  } catch (err) {}
  try {
    await query(`ALTER TABLE order_items ADD COLUMN commission_rate_level1_snapshot DECIMAL(4, 2) DEFAULT 0.0`);
    addedOrderItemDistributionSnapshot = true;
  } catch (err) {}
  try {
    await query(`ALTER TABLE order_items ADD COLUMN commission_rate_level2_snapshot DECIMAL(4, 2) DEFAULT 0.0`);
    addedOrderItemDistributionSnapshot = true;
  } catch (err) {}
  if (addedOrderItemDistributionSnapshot) {
    await query(`
      UPDATE order_items oi
      JOIN products p ON p.id = oi.product_id
      SET oi.is_distribution_snapshot = COALESCE(p.is_distribution, 0),
          oi.commission_rate_snapshot = COALESCE(p.commission_rate_level1, p.commission_rate, 0),
          oi.commission_rate_level1_snapshot = COALESCE(p.commission_rate_level1, p.commission_rate, 0),
          oi.commission_rate_level2_snapshot = COALESCE(p.commission_rate_level2, 0)
      WHERE COALESCE(oi.is_distribution_snapshot, 0) = 0
        AND COALESCE(oi.commission_rate_snapshot, 0) = 0
    `);
    await query(`
      UPDATE order_items
      SET commission_rate_level1_snapshot = commission_rate_snapshot
      WHERE COALESCE(commission_rate_level1_snapshot, 0) = 0
        AND COALESCE(commission_rate_snapshot, 0) > 0
    `);
  }

  // 21. user_coupons
  await query(`
    CREATE TABLE IF NOT EXISTS user_coupons (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      coupon_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(30) DEFAULT 'active',
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
    );
  `);

  // 22. distributors
  await query(`
    CREATE TABLE IF NOT EXISTS distributors (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(255),
      level VARCHAR(30) DEFAULT 'silver',
      invite_code VARCHAR(50) UNIQUE NOT NULL,
      invite_qr_url VARCHAR(255),
      total_commission INT DEFAULT 0,
      available_commission INT DEFAULT 0,
      withdrawn_amount INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 23. distribution_relationships
  await query(`
    CREATE TABLE IF NOT EXISTS distribution_relationships (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      parent_user_id BIGINT UNSIGNED NOT NULL,
      child_user_id BIGINT UNSIGNED NOT NULL,
      level INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE distribution_relationships ADD UNIQUE KEY uniq_distribution_child_level (child_user_id, level)`);
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`ALTER TABLE distribution_relationships ADD KEY idx_distribution_parent_level (parent_user_id, level)`);
  } catch (err) {
    // Ignore error if index already exists
  }

  // 24. distribution_orders
  await query(`
    CREATE TABLE IF NOT EXISTS distribution_orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      distributor_id BIGINT UNSIGNED NOT NULL,
      buyer_name VARCHAR(100) NOT NULL,
      order_amount INT NOT NULL,
      commission_amount INT NOT NULL,
      commission_level TINYINT DEFAULT 1,
      status VARCHAR(30) DEFAULT 'pending',
      settled_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE distribution_orders ADD COLUMN lock_until TIMESTAMP NULL DEFAULT NULL`);
  } catch (err) {}

  // 25. withdraw_records
  await query(`
    CREATE TABLE IF NOT EXISTS withdraw_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      amount INT NOT NULL,
      fee INT DEFAULT 0,
      actual_amount INT NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      account_info VARCHAR(255) NOT NULL,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const withdrawColumns = await query('SHOW COLUMNS FROM withdraw_records');
  for (const [column, definition] of [
    ['remark', 'TEXT NULL'],
    ['reviewed_at', 'TIMESTAMP NULL'],
    ['payout_reference', 'VARCHAR(120) NULL']
  ]) {
    if (!withdrawColumns.some(existing => existing.Field === column)) {
      await query(`ALTER TABLE withdraw_records ADD COLUMN ${column} ${definition}`);
    }
  }
  const payoutIndex = await query("SHOW INDEX FROM withdraw_records WHERE Key_name = 'uniq_withdraw_payout_reference'");
  if (!payoutIndex.length) {
    await query('CREATE UNIQUE INDEX uniq_withdraw_payout_reference ON withdraw_records (payout_reference)');
  }
  await query('ALTER TABLE withdraw_records MODIFY COLUMN account_info TEXT NOT NULL');

  // 25.1. points_logs
  await query(`
    CREATE TABLE IF NOT EXISTS points_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      points INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      description VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 26. user_notifications
  await query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(30) DEFAULT 'system',
      is_read TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE user_notifications ADD COLUMN type VARCHAR(30) DEFAULT 'system' AFTER content`);
  } catch (err) {}

  await query(`
    CREATE TABLE IF NOT EXISTS wechat_subscribe_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED,
      openid VARCHAR(64) NOT NULL,
      event VARCHAR(50) NOT NULL,
      template_id VARCHAR(128) NOT NULL,
      business_id VARCHAR(128) DEFAULT '',
      status VARCHAR(20) NOT NULL,
      error_message VARCHAR(255),
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wechat_subscribe_user (user_id),
      INDEX idx_wechat_subscribe_event_business (event, business_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mini_program_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED DEFAULT NULL,
      openid VARCHAR(64) DEFAULT '',
      level VARCHAR(20) NOT NULL DEFAULT 'info',
      event VARCHAR(80) NOT NULL,
      route VARCHAR(160) DEFAULT '',
      message VARCHAR(255) DEFAULT '',
      api_url VARCHAR(255) DEFAULT '',
      method VARCHAR(12) DEFAULT '',
      status_code INT DEFAULT NULL,
      trace_id VARCHAR(64) DEFAULT '',
      env_version VARCHAR(30) DEFAULT '',
      app_version VARCHAR(50) DEFAULT '',
      platform VARCHAR(50) DEFAULT '',
      device_model VARCHAR(120) DEFAULT '',
      sdk_version VARCHAR(50) DEFAULT '',
      network_type VARCHAR(30) DEFAULT '',
      extra JSON DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mini_program_logs_created_at (created_at),
      INDEX idx_mini_program_logs_event (event),
      INDEX idx_mini_program_logs_level (level),
      INDEX idx_mini_program_logs_trace_id (trace_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // 27. live_rooms
  await query(`
    CREATE TABLE IF NOT EXISTS live_rooms (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      cover_url VARCHAR(255) NOT NULL,
      wechat_room_id VARCHAR(64),
      wechat_anchor_wechat VARCHAR(100),
      wechat_cover_media_id VARCHAR(255),
      wechat_share_media_id VARCHAR(255),
      anchor_name VARCHAR(100) NOT NULL,
      anchor_avatar VARCHAR(255),
      status VARCHAR(30) DEFAULT 'upcoming',
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NULL,
      viewer_count INT DEFAULT 0,
      replay_url VARCHAR(255),
      product_ids JSON,
      description TEXT,
      tags JSON
    );
  `);

  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN wechat_room_id VARCHAR(64) DEFAULT NULL`);
  } catch (e) {}

  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN wechat_anchor_wechat VARCHAR(100) DEFAULT NULL`);
  } catch (e) {}

  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN wechat_cover_media_id VARCHAR(255) DEFAULT NULL`);
  } catch (e) {}

  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN wechat_share_media_id VARCHAR(255) DEFAULT NULL`);
  } catch (e) {}

  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN description TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE live_rooms ADD COLUMN tags JSON DEFAULT NULL`);
  } catch (e) {}

  // 27.1 content_banners
  await query(`
    CREATE TABLE IF NOT EXISTS content_banners (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      preview_text VARCHAR(100) NOT NULL,
      preview_color VARCHAR(255) DEFAULT 'linear-gradient(135deg, #1A3580, #3B6BF5)',
      link_url VARCHAR(255) DEFAULT '',
      validity VARCHAR(100) DEFAULT '长期',
      status VARCHAR(30) DEFAULT 'inactive',
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 28. community_posts
  await query(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      user_role VARCHAR(30) DEFAULT 'patient',
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      cover_url VARCHAR(255),
      image_urls JSON,
      tags JSON,
      related_product_name VARCHAR(255),
      related_doctor_name VARCHAR(255),
      publish_at DATETIME NULL,
      sort_weight INT DEFAULT 100,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      is_top TINYINT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN cover_url VARCHAR(255) DEFAULT NULL AFTER content;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN summary TEXT DEFAULT NULL AFTER title;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN related_product_name VARCHAR(255) DEFAULT NULL AFTER tags;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN related_doctor_name VARCHAR(255) DEFAULT NULL AFTER related_product_name;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN publish_at DATETIME DEFAULT NULL AFTER related_doctor_name;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN sort_weight INT DEFAULT 100 AFTER publish_at;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`UPDATE community_posts SET publish_at = created_at WHERE publish_at IS NULL AND status = 'approved';`);
  } catch (err) {
    // Ignore data migration failure here
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN views_count INT DEFAULT 0 AFTER comments_count;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN favorites_count INT DEFAULT 0 AFTER views_count;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE community_posts ADD COLUMN shares_count INT DEFAULT 0 AFTER favorites_count;`);
  } catch (err) {
    // Ignore error if column already exists
  }

  // 29. post_comments
  await query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      parent_id BIGINT UNSIGNED,
      content TEXT NOT NULL,
      likes_count INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_post_likes (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_post_like (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_post_favorites (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_post_favorite (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_post_views (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      view_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_post_view_daily (post_id, user_id, view_date),
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS post_comment_likes (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      comment_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_comment_like (comment_id, user_id),
      FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 29.1 community_reports
  await query(`
    CREATE TABLE IF NOT EXISTS community_reports (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      post_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(100) NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 30. roles
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) UNIQUE NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    await query(`ALTER TABLE roles ADD COLUMN description TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE roles ADD COLUMN status VARCHAR(30) DEFAULT 'active'`);
  } catch (e) {}
  // 31. permissions
  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      role_id BIGINT UNSIGNED NOT NULL,
      permission_resource VARCHAR(150) NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );
  `);
  // 32. admin_users
  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(30),
      role_id BIGINT UNSIGNED NOT NULL,
      all_stores TINYINT(1) NOT NULL DEFAULT 0,
      doctor_id BIGINT UNSIGNED,
      status VARCHAR(30) DEFAULT 'online',
      token_version INT NOT NULL DEFAULT 0,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
    );
  `);
  try {
    await query(`ALTER TABLE admin_users ADD COLUMN doctor_id BIGINT UNSIGNED NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE admin_users ADD COLUMN all_stores TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE admin_users ADD COLUMN token_version INT NOT NULL DEFAULT 0`);
  } catch (e) {}
  await query(`
    CREATE TABLE IF NOT EXISTS admin_user_stores (
      admin_user_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (admin_user_id, store_id),
      FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);
  try {
    const storeForeignKeys = await query(`SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'store_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL`);
    for (const foreignKey of storeForeignKeys) await query(`ALTER TABLE admin_users DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
    await query('ALTER TABLE admin_users DROP COLUMN store_id');
  } catch (err) {}
  await query(`CREATE TABLE IF NOT EXISTS patient_store_registrations (
    patient_id BIGINT UNSIGNED NOT NULL,
    store_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (patient_id, store_id),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id),
    FOREIGN KEY (created_by) REFERENCES admin_users(id)
  )`);
  // Follow-up data belongs to the assigned backend account, not to a doctor profile.
  // Keep the patient only on the task: a follow-up record reaches its patient through task_id.
  await query(`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      follower_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      due_date DATE NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS follow_up_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      task_id BIGINT UNSIGNED NOT NULL,
      follower_id BIGINT UNSIGNED NOT NULL,
      contact_type VARCHAR(30) NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS patient_crm_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      follower_id BIGINT UNSIGNED NOT NULL,
      content TEXT NOT NULL,
      stage VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);

  const dropForeignKeysForColumn = async (tableName, columnName) => {
    const foreignKeys = await query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName, columnName]);
    for (const foreignKey of foreignKeys) {
      await query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
    }
  };

  // A patient is not owned by an operator. Every operator relationship is kept
  // on its own CRM or follow-up record, so no stale "current follower" remains.
  try { await dropForeignKeysForColumn('patients', 'follower_id'); } catch (e) {}
  try { await query(`ALTER TABLE patients DROP COLUMN follower_id`); } catch (e) {}

  // One-time conversion of the pre-release doctor-based model.
  try { await query(`ALTER TABLE follow_up_tasks ADD COLUMN follower_id BIGINT UNSIGNED NULL AFTER patient_id`); } catch (e) {}
  try {
    await query(`
      UPDATE follow_up_tasks t
      LEFT JOIN admin_users doctor_account ON doctor_account.doctor_id = t.doctor_id
      SET t.follower_id = COALESCE(
        t.follower_id,
        doctor_account.id,
        (SELECT id FROM admin_users WHERE status = 'online' ORDER BY id ASC LIMIT 1)
      )
      WHERE t.follower_id IS NULL
    `);
  } catch (e) {}
  try { await dropForeignKeysForColumn('follow_up_tasks', 'doctor_id'); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_tasks DROP COLUMN doctor_id`); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_tasks MODIFY COLUMN follower_id BIGINT UNSIGNED NOT NULL`); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_tasks ADD CONSTRAINT fk_follow_up_task_follower FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT`); } catch (e) {}

  try { await query(`ALTER TABLE follow_up_records ADD COLUMN follower_id BIGINT UNSIGNED NULL AFTER task_id`); } catch (e) {}
  try {
    await query(`
      UPDATE follow_up_records r
      JOIN follow_up_tasks t ON t.id = r.task_id
      LEFT JOIN admin_users doctor_account ON doctor_account.doctor_id = r.doctor_id
      SET r.follower_id = COALESCE(r.follower_id, doctor_account.id, t.follower_id)
      WHERE r.follower_id IS NULL
    `);
  } catch (e) {}
  try { await dropForeignKeysForColumn('follow_up_records', 'patient_id'); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_records DROP COLUMN patient_id`); } catch (e) {}
  try { await dropForeignKeysForColumn('follow_up_records', 'doctor_id'); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_records DROP COLUMN doctor_id`); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_records MODIFY COLUMN follower_id BIGINT UNSIGNED NOT NULL`); } catch (e) {}
  try { await query(`ALTER TABLE follow_up_records ADD CONSTRAINT fk_follow_up_record_follower FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT`); } catch (e) {}

  try { await dropForeignKeysForColumn('patient_crm_records', 'admin_user_id'); } catch (e) {}
  try { await dropForeignKeysForColumn('patient_crm_records', 'follower_id'); } catch (e) {}
  try { await query(`ALTER TABLE patient_crm_records CHANGE COLUMN admin_user_id follower_id BIGINT UNSIGNED NOT NULL`); } catch (e) {}
  try { await query(`ALTER TABLE patient_crm_records RENAME COLUMN admin_user_id TO follower_id`); } catch (e) {}
  try { await query(`ALTER TABLE patient_crm_records ADD CONSTRAINT fk_patient_crm_record_follower FOREIGN KEY (follower_id) REFERENCES admin_users(id) ON DELETE RESTRICT`); } catch (e) {}

  // Device fulfillment is a separate operational workflow. It deliberately
  // records every hand-off instead of overloading order or patient fields.
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_cases (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL UNIQUE,
      patient_id BIGINT UNSIGNED NOT NULL,
      store_id BIGINT UNSIGNED DEFAULT NULL,
      technician_id BIGINT UNSIGNED DEFAULT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_assignment',
      expected_fitting_date DATE DEFAULT NULL,
      note TEXT DEFAULT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
      FOREIGN KEY (technician_id) REFERENCES admin_users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  const fulfillmentColumns = await query("SHOW COLUMNS FROM fulfillment_cases LIKE 'medical_record_id'");
  if (!fulfillmentColumns.length) {
    await query(`ALTER TABLE fulfillment_cases ADD COLUMN medical_record_id BIGINT UNSIGNED NULL,
      ADD CONSTRAINT fk_fulfillment_medical_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL`);
  }
  const adjustmentRecordColumns = await query("SHOW COLUMNS FROM device_adjustments LIKE 'medical_record_id'");
  if (!adjustmentRecordColumns.length) {
    await query(`ALTER TABLE device_adjustments ADD COLUMN medical_record_id BIGINT UNSIGNED NULL,
      ADD CONSTRAINT fk_adjustment_medical_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL`);
  }
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_molds (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED NOT NULL,
      technician_id BIGINT UNSIGNED NOT NULL,
      mold_no VARCHAR(80) NOT NULL UNIQUE,
      storage_location VARCHAR(150) NOT NULL,
      taken_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_mold_shipments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED NOT NULL,
      sender_id BIGINT UNSIGNED NOT NULL,
      carrier VARCHAR(100) NOT NULL,
      tracking_no VARCHAR(100) NOT NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_device_receipts (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED NOT NULL,
      receiver_id BIGINT UNSIGNED NOT NULL,
      device_serial_no VARCHAR(100) DEFAULT NULL,
      storage_location VARCHAR(150) NOT NULL,
      inspection_result VARCHAR(30) NOT NULL DEFAULT 'passed',
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_fittings (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED NOT NULL,
      technician_id BIGINT UNSIGNED NOT NULL,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      fitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      result VARCHAR(30) NOT NULL DEFAULT 'completed',
      note TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
      FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS after_sales_tickets (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED DEFAULT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      assigned_technician_id BIGINT UNSIGNED DEFAULT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      issue_type VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      resolution TEXT DEFAULT NULL,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE SET NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_technician_id) REFERENCES admin_users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fulfillment_events (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      fulfillment_case_id BIGINT UNSIGNED NOT NULL,
      actor_id BIGINT UNSIGNED NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      detail JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES admin_users(id) ON DELETE RESTRICT
    );
  `);
  try {
    await query(`ALTER TABLE ess_assessments ADD COLUMN patient_id BIGINT UNSIGNED NULL DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE ess_assessments ADD CONSTRAINT fk_ess_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE snore_assessments ADD COLUMN patient_id BIGINT UNSIGNED NULL DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE snore_assessments ADD CONSTRAINT fk_snore_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE`);
  } catch (e) {}
  try {
    await query(`
      UPDATE ess_assessments e
      JOIN users u ON e.user_id = u.id
      SET e.patient_id = u.self_patient_id
      WHERE e.patient_id IS NULL
        AND u.self_patient_id IS NOT NULL
    `);
  } catch (e) {}
  try {
    await query(`
      UPDATE ess_assessments e
      JOIN patients p ON e.user_id = p.user_id AND p.relation = 'self'
      SET e.patient_id = p.id
      WHERE e.patient_id IS NULL
    `);
  } catch (e) {}
  try {
    await query(`
      UPDATE snore_assessments s
      JOIN users u ON s.user_id = u.id
      SET s.patient_id = u.self_patient_id
      WHERE s.patient_id IS NULL
        AND u.self_patient_id IS NOT NULL
    `);
  } catch (e) {}
  try {
    await query(`
      UPDATE snore_assessments s
      JOIN patients p ON s.user_id = p.user_id AND p.relation = 'self'
      SET s.patient_id = p.id
      WHERE s.patient_id IS NULL
    `);
  } catch (e) {}
  try {
    const adminCount = await get(`SELECT COUNT(*) as count FROM admin_users`);
    if (Number(adminCount?.count || 0) > 0) {
      let role = await get(`SELECT id FROM roles WHERE code = 'doctor' LIMIT 1`);
      if (!role) {
        const result = await run(
          `INSERT INTO roles (name, code, description, status) VALUES (?, ?, ?, ?)`,
          ['就诊医生', 'doctor', '医生后台登录角色', 'active']
        );
        role = { id: result.id };
      }
      const doctorPermissions = [
        'appointment:view',
        'appointment:edit',
        'patient:view',
        'patient:phone:view',
        'medical_record:view',
        'medical_record:add',
        'medical_record:edit',
        'schedule:view',
        'schedule:edit'
      ];
      for (const permission of doctorPermissions) {
        const existingPermission = await get(
          `SELECT id FROM permissions WHERE role_id = ? AND permission_resource = ? LIMIT 1`,
          [role.id, permission]
        );
        if (!existingPermission) {
          await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [role.id, permission]);
        }
      }
    }
  } catch (e) {}

  // 33. appointment_evaluations
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_evaluations (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      appointment_id BIGINT UNSIGNED UNIQUE NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      rating DECIMAL(2, 1) NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 34. appointment_pre_exams
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_pre_exams (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      appointment_id BIGINT UNSIGNED UNIQUE NOT NULL,
      user_id BIGINT UNSIGNED,
      height DECIMAL(5,2),
      weight DECIMAL(5,2),
      systolic_bp INT,
      diastolic_bp INT,
      neck_circumference DECIMAL(4,1),
      bmi DECIMAL(4,1),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // 35. audit_logs
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      admin_id BIGINT UNSIGNED,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50) NOT NULL,
      target_id VARCHAR(100),
      details TEXT,
      ip_address VARCHAR(45) NULL,
      status VARCHAR(20) DEFAULT 'success',
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE audit_logs ADD COLUMN ip_address VARCHAR(45) NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE audit_logs ADD COLUMN status VARCHAR(20) DEFAULT 'success'`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE audit_logs ADD COLUMN error_message TEXT NULL`);
  } catch (e) {}

  // 36. im_messages
  await query(`
    CREATE TABLE IF NOT EXISTS im_messages (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      sender VARCHAR(20) NOT NULL,
      sender_name VARCHAR(50),
      text TEXT NOT NULL,
      is_read TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 37. system_settings
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key_name VARCHAR(100) PRIMARY KEY,
      key_value TEXT NOT NULL,
      description VARCHAR(255),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 38. 佩戴数据只保留患者设备维度的 wearing_logs；移除无法定位设备的旧账户维度表。
  await query(`DROP TABLE IF EXISTS wearing_records`);

  // 39. treatment_timelines
  await query(`
    CREATE TABLE IF NOT EXISTS treatment_timelines (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED DEFAULT NULL,
      treatment_id BIGINT UNSIGNED DEFAULT NULL,
      event_date DATE NOT NULL,
      event_title VARCHAR(150) NOT NULL,
      event_desc TEXT,
      event_type VARCHAR(50) DEFAULT 'visit',
      doctor_name VARCHAR(100) DEFAULT NULL,
      color VARCHAR(50) DEFAULT NULL,
      icon VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);

  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN patient_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN treatment_id BIGINT UNSIGNED DEFAULT NULL AFTER patient_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN event_type VARCHAR(50) DEFAULT 'visit'`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN doctor_name VARCHAR(100) DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN color VARCHAR(50) DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD COLUMN icon VARCHAR(50) DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD CONSTRAINT fk_treatment_timelines_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE treatment_timelines ADD CONSTRAINT fk_treatment_timelines_treatment FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE`);
  } catch (e) {}

  // 40. device_maintenance
  await query(`
    CREATE TABLE IF NOT EXISTS device_maintenance (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      treatment_id BIGINT UNSIGNED DEFAULT NULL,
      service_date DATE NOT NULL,
      service_type VARCHAR(100) NOT NULL,
      service_store VARCHAR(150) NOT NULL,
      service_operator VARCHAR(100),
      description TEXT,
      cost INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN patient_device_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN treatment_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD CONSTRAINT fk_device_maintenance_patient_device FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD CONSTRAINT fk_device_maintenance_treatment FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE SET NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN description TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN cost INT DEFAULT 0`);
  } catch (e) {}
  try {
    await query(`
      UPDATE device_maintenance dm
      JOIN treatment_records tr ON tr.id = dm.treatment_id
      SET dm.patient_device_id = tr.patient_device_id
      WHERE dm.patient_device_id IS NULL
    `);
  } catch (e) {}

  // 41. device_feedback
  await query(`
    CREATE TABLE IF NOT EXISTS device_feedback (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      patient_device_id BIGINT UNSIGNED DEFAULT NULL,
      treatment_id BIGINT UNSIGNED DEFAULT NULL,
      feedback_type VARCHAR(100) NULL,
      feedback_desc TEXT NOT NULL,
      contact_phone VARCHAR(50),
      rating INT DEFAULT 5,
      status VARCHAR(30) DEFAULT 'pending',
      reply_content TEXT,
      processed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE SET NULL
    );
  `);

  try {
    await query(`ALTER TABLE device_feedback ADD COLUMN patient_device_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback ADD COLUMN treatment_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback ADD CONSTRAINT fk_device_feedback_patient_device FOREIGN KEY (patient_device_id) REFERENCES patient_devices(id) ON DELETE SET NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback ADD CONSTRAINT fk_device_feedback_treatment FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE SET NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback ADD COLUMN rating INT DEFAULT 5`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback MODIFY COLUMN feedback_type VARCHAR(100) NULL`);
  } catch (e) {}
  try {
    await query(`
      UPDATE device_feedback df
      JOIN treatment_records tr ON tr.id = df.treatment_id
      SET df.patient_device_id = tr.patient_device_id
      WHERE df.patient_device_id IS NULL
    `);
  } catch (e) {}

  // 42. article_categories
  await query(`
    CREATE TABLE IF NOT EXISTS article_categories (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL UNIQUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const catCount = await get(`SELECT COUNT(*) as count FROM article_categories`);
    if (catCount && catCount.count === 0) {
      const defaults = ['睡眠科普', '治疗知识', '设备介绍', '患者故事', '专家'];
      for (let i = 0; i < defaults.length; i++) {
        await query(`INSERT INTO article_categories (name, sort_order) VALUES (?, ?)`, [defaults[i], i * 10]);
      }
      console.log('Seeded default article categories.');
    }
  } catch (e) {
    console.error('Failed to seed article categories:', e);
  }
  try {
    await query(
      `INSERT INTO article_categories (name, sort_order)
       SELECT '专家', 40
       WHERE NOT EXISTS (
         SELECT 1 FROM article_categories WHERE name = '专家'
       )`
    );
  } catch (e) {
    console.error('Failed to ensure expert article category:', e);
  }

  // Business settings must be configured by an operator; startup never invents business records.

  // Add empty integration settings without overwriting configured values.
  try {
    await query(`
      INSERT IGNORE INTO system_settings (key_name, key_value, description)
      VALUES
        ('wechat_template_visit_reminder', '', '微信订阅消息模板ID：就诊提醒'),
        ('wechat_template_withdraw_result', '', '微信订阅消息模板ID：提现结果'),
        ('wechat_template_withdraw_paid', '', '微信订阅消息模板ID：提现到账'),
        ('wechat_template_order_shipped', '', '微信订阅消息模板ID：发货通知'),
        ('wechat_template_promoter_activated', '', '微信订阅消息模板ID：推广资格生效'),
        ('wechat_pay_app_id', '', '微信支付小程序AppID'),
        ('wechat_pay_mch_id', '', '微信支付商户号'),
        ('wechat_pay_serial_no', '', '微信支付商户API证书序列号'),
        ('wechat_pay_private_key', '', '微信支付商户API私钥或私钥文件路径'),
        ('wechat_pay_api_v3_key', '', '微信支付API v3密钥'),
        ('wechat_pay_api_v2_key', '', '微信支付API v2密钥（付款码支付）'),
        ('wechat_pay_notify_url', '', '微信支付商品订单回调地址'),
        ('wechat_pay_appointment_notify_url', '', '微信支付预约订单回调地址'),
        ('wechat_pay_refund_notify_url', '', '微信支付退款回调地址'),
        ('wechat_pay_platform_cert', '', '微信支付平台证书或证书文件路径')
    `);
    await query(`DELETE FROM system_settings WHERE key_name IN (
      'wechat_template_appointment_created', 'wechat_template_appointment_paid',
      'wechat_template_appointment_changed', 'wechat_template_appointment_status',
      'wechat_template_revisit_reminder', 'wechat_template_order_status',
      'wechat_template_refund_result', 'appointment_subscribe_template_ids',
      'wechat_notification_appointment_created', 'wechat_notification_appointment_paid',
      'wechat_notification_appointment_changed', 'wechat_notification_appointment_status',
      'wechat_notification_revisit_reminder', 'wechat_notification_order_status',
      'wechat_notification_refund_result', 'wechat_notification_payment_due',
      'wechat_template_commission_settled', 'wechat_notification_commission_settled',
      'wechat_notification_device_arrived', 'wechat_notification_report_ready',
      'wechat_notification_service_reply', 'wechat_notification_after_sales_updated'
    )`);
  } catch (err) {
    console.error('Failed to initialize empty integration settings:', err);
  }


  // Create High Performance Secondary Indexes
  try {
    await query(`CREATE INDEX idx_appt_date_status ON appointments (appointment_date, status);`);
    console.log('Index idx_appt_date_status verified/created.');
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`CREATE INDEX idx_orders_pay_status ON orders (pay_at, status);`);
    console.log('Index idx_orders_pay_status verified/created.');
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`CREATE INDEX idx_posts_status_top_date ON community_posts (status, is_top, created_at DESC);`);
    console.log('Index idx_posts_status_top_date verified/created.');
  } catch (err) {
    // Ignore error if index already exists
  }
  try {
    await query(`CREATE INDEX idx_patients_id_card ON patients (id_card);`);
    console.log('Index idx_patients_id_card verified/created.');
  } catch (err) {
    // Ignore error
  }
  try {
    await query(`CREATE INDEX idx_patients_phone ON patients (phone);`);
    console.log('Index idx_patients_phone verified/created.');
  } catch (err) {
    // Ignore error
  }

  try {
    const columns = await query("SHOW COLUMNS FROM appointment_pre_exams LIKE 'user_id'");
    if (columns.length === 0) {
      await query("ALTER TABLE appointment_pre_exams ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER appointment_id");
      await query("ALTER TABLE appointment_pre_exams ADD CONSTRAINT fk_pre_exams_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL");
      console.log('Added user_id column and foreign key to appointment_pre_exams');
    }
  } catch (err) {
    console.error('Failed to migrate appointment_pre_exams user_id column:', err);
  }

  try {
    const columns = await query("SHOW COLUMNS FROM appointments LIKE 'postpone_count'");
    if (columns.length === 0) {
      await query("ALTER TABLE appointments ADD COLUMN postpone_count INT DEFAULT 0");
      console.log('Added postpone_count column to appointments table');
    }
  } catch (err) {
    console.error('Failed to migrate appointments postpone_count column:', err);
  }

  // Re-enable Foreign Key checks
  await initDeliverySchema(query);
  await initBackendPromoterSchema(query);
  await query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('MySQL Database tables verified/created successfully.');
};

export const syncDatabaseSchema = async () => {
  await initDB();
  const tables = await query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_count, CREATE_TIME AS create_time, UPDATE_TIME AS update_time
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME ASC`
  );
  return {
    success: true,
    database: process.env.DB_NAME || '',
    tableCount: tables.length,
    tables: tables.map((t) => ({
      name: t.name,
      rowCount: Number(t.row_count || 0),
      updateTime: t.update_time || t.create_time
    })),
    syncedAt: new Date().toISOString()
  };
};
