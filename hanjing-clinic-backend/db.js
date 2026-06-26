import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

let pool;

export const initPool = async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'hanjing_clinic',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
};

export const query = async (sql, params = []) => {
  if (!pool) await initPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
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
  await connection.beginTransaction();
  try {
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
  await initPool();

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
      nickname VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(255),
      gender TINYINT DEFAULT 0,
      birthday DATE,
      member_level VARCHAR(30) DEFAULT 'normal',
      points INT DEFAULT 0,
      total_spent INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 2. patients
  await query(`
    CREATE TABLE IF NOT EXISTS patients (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      relation VARCHAR(30) DEFAULT 'self',
      gender TINYINT DEFAULT 0,
      age INT,
      phone VARCHAR(20),
      has_snore TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      total_score INT NOT NULL,
      risk_level VARCHAR(50) NOT NULL,
      answers JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 9. snore_assessments
  await query(`
    CREATE TABLE IF NOT EXISTS snore_assessments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      file_url VARCHAR(255) NOT NULL,
      duration INT NOT NULL,
      avg_decibel INT NOT NULL,
      peak_decibel INT NOT NULL,
      snore_rate INT NOT NULL,
      apnea_events INT NOT NULL,
      risk_level VARCHAR(30) DEFAULT 'low',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

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

  // 12. treatment_records
  await query(`
    CREATE TABLE IF NOT EXISTS treatment_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      medical_record_id BIGINT UNSIGNED,
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

  // 13. wearing_logs
  await query(`
    CREATE TABLE IF NOT EXISTS wearing_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      treatment_id BIGINT UNSIGNED NOT NULL,
      date DATE NOT NULL,
      wear_duration DECIMAL(4, 2) DEFAULT 0.0,
      comfort TINYINT DEFAULT 3,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);

  // 14. device_adjustments
  await query(`
    CREATE TABLE IF NOT EXISTS device_adjustments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      treatment_id BIGINT UNSIGNED NOT NULL,
      adjust_date DATE NOT NULL,
      operator_id BIGINT UNSIGNED NOT NULL,
      adjusted_advancement DECIMAL(4, 2) NOT NULL,
      patient_feedback VARCHAR(255),
      instructions TEXT,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);

  // 15. follow_up_tasks
  await query(`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      patient_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      due_date DATE NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );
  `);

  // 16. follow_up_records
  await query(`
    CREATE TABLE IF NOT EXISTS follow_up_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      task_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      doctor_id BIGINT UNSIGNED NOT NULL,
      contact_type VARCHAR(30) NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );
  `);

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
      status VARCHAR(30) DEFAULT 'off',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
      shipping_address JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
    );
  `);

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
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

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

  // 26. user_notifications
  await query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      is_read TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 27. live_rooms
  await query(`
    CREATE TABLE IF NOT EXISTS live_rooms (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      cover_url VARCHAR(255) NOT NULL,
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
      content TEXT NOT NULL,
      image_urls JSON,
      tags JSON,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      is_top TINYINT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

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
      store_id BIGINT UNSIGNED,
      status VARCHAR(30) DEFAULT 'online',
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
    );
  `);

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
      height DECIMAL(5,2),
      weight DECIMAL(5,2),
      systolic_bp INT,
      diastolic_bp INT,
      neck_circumference DECIMAL(4,1),
      bmi DECIMAL(4,1),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
    );
  `);

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

  // 38. wearing_records
  await query(`
    CREATE TABLE IF NOT EXISTS wearing_records (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      wearing_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      duration_mins INT NOT NULL,
      comfort_score INT DEFAULT 5,
      snore_decibel INT DEFAULT 0,
      apnea_events INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'synced',
      note VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY idx_user_date (user_id, wearing_date)
    );
  `);

  try {
    await query(`ALTER TABLE wearing_records ADD COLUMN note VARCHAR(255) DEFAULT NULL`);
  } catch (e) {}

  // 39. treatment_timelines
  await query(`
    CREATE TABLE IF NOT EXISTS treatment_timelines (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      event_date DATE NOT NULL,
      event_title VARCHAR(150) NOT NULL,
      event_desc TEXT,
      event_type VARCHAR(50) DEFAULT 'visit',
      doctor_name VARCHAR(100) DEFAULT NULL,
      color VARCHAR(50) DEFAULT NULL,
      icon VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

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

  // 40. device_maintenance
  await query(`
    CREATE TABLE IF NOT EXISTS device_maintenance (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      service_date DATE NOT NULL,
      service_type VARCHAR(100) NOT NULL,
      service_store VARCHAR(150) NOT NULL,
      service_operator VARCHAR(100),
      description TEXT,
      cost INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN description TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_maintenance ADD COLUMN cost INT DEFAULT 0`);
  } catch (e) {}

  // 41. device_feedback
  await query(`
    CREATE TABLE IF NOT EXISTS device_feedback (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      feedback_type VARCHAR(100) NULL,
      feedback_desc TEXT NOT NULL,
      contact_phone VARCHAR(50),
      rating INT DEFAULT 5,
      status VARCHAR(30) DEFAULT 'pending',
      reply_content TEXT,
      processed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    await query(`ALTER TABLE device_feedback ADD COLUMN rating INT DEFAULT 5`);
  } catch (e) {}
  try {
    await query(`ALTER TABLE device_feedback MODIFY COLUMN feedback_type VARCHAR(100) NULL`);
  } catch (e) {}

  // Seed sample records for new tables
  try {
    const recordsCount = await query('SELECT count(*) as count FROM wearing_records');
    if (recordsCount[0].count === 0) {
      const usersList = await query('SELECT id FROM users LIMIT 5');
      const today = new Date();

      for (const u of usersList) {
        // 1. Seed wearing records for the past 7 days
        for (let i = 1; i <= 7; i++) {
          const pastDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
          const duration = Math.floor(400 + Math.random() * 120);
          const comfort = Math.floor(4 + Math.random() * 2); // 4 or 5
          const decibel = Math.floor(35 + Math.random() * 15);
          const apnea = Math.floor(Math.random() * 3);

          const s = [
            "首次佩戴，有轻微异物感",
            "逐渐适应，无不适",
            "佩戴感良好，睡眠质量改善",
            "",
            "颞下颌关节略有酸胀",
            "调整后舒适度提升"
          ];
          const note = s[i % s.length];

          await query(`
            INSERT INTO wearing_records (user_id, wearing_date, start_time, end_time, duration_mins, comfort_score, snore_decibel, apnea_events, note)
            VALUES (?, ?, '22:30:00', '06:30:00', ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE duration_mins = VALUES(duration_mins)
          `, [u.id, dateStr, duration, comfort, decibel, apnea, note || null]);
        }

        // 2. Seed treatment timelines
        const dates = [
          new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)
        ];
        const timelineData = [
          ['建立疗程档案', '针对中重度阻塞性睡眠呼吸暂停(OSAHS)及顽固打鼾设计，采用食品级高分子材质，下颌前移微调精度达0.5mm，智能监测传感器自动上传睡眠佩戴时长与质量数据。', 'visit', '王芳', '#1A9D5C', 'start'],
          ['阻鼾器设计与制作', '定制式阻鼾器设计制作完成，型号：HJ-MAD-03。', 'milestone', '陈技师', '#3B6BF5', 'device'],
          ['阻鼾器佩戴调试', '王医生为您完成了阻鼾器首次试戴和下颌前移量微调（初始前移：4.0mm）。', 'adjust', '王医生', '#F59E0B', 'adjust']
        ];
        for (let j = 0; j < dates.length; j++) {
          const dateStr = `${dates[j].getFullYear()}-${String(dates[j].getMonth() + 1).padStart(2, '0')}-${String(dates[j].getDate()).padStart(2, '0')}`;
          await query(`
            INSERT INTO treatment_timelines (user_id, event_date, event_title, event_desc, event_type, doctor_name, color, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [u.id, dateStr, timelineData[j][0], timelineData[j][1], timelineData[j][2], timelineData[j][3], timelineData[j][4], timelineData[j][5]]);
        }

        // 3. Seed device maintenance
        const maintDate1 = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
        const maintDateStr1 = `${maintDate1.getFullYear()}-${String(maintDate1.getMonth() + 1).padStart(2, '0')}-${String(maintDate1.getDate()).padStart(2, '0')}`;
        await query(`
          INSERT INTO device_maintenance (user_id, service_date, service_type, service_store, service_operator, description, cost, status)
          VALUES (?, ?, 'clean', '鼾静健康 · 龙岗总店', '陈技师', '首次使用后用专用清洁套装进行深度清洁', 0, 'completed')
        `, [u.id, maintDateStr1]);

        const maintDate2 = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000);
        const maintDateStr2 = `${maintDate2.getFullYear()}-${String(maintDate2.getMonth() + 1).padStart(2, '0')}-${String(maintDate2.getDate()).padStart(2, '0')}`;
        await query(`
          INSERT INTO device_maintenance (user_id, service_date, service_type, service_store, service_operator, description, cost, status)
          VALUES (?, ?, 'adjust', '鼾静健康 · 福田店', '王医生', '初次适配调整，设置前移量3mm', 0, 'completed')
        `, [u.id, maintDateStr2]);

        // 4. Seed device feedback
        const feedDate = new Date(today.getTime() - 12 * 24 * 60 * 60 * 1000);
        const feedDateStr = `${feedDate.getFullYear()}-${String(feedDate.getMonth() + 1).padStart(2, '0')}-${String(feedDate.getDate()).padStart(2, '0')}`;
        await query(`
          INSERT INTO device_feedback (user_id, feedback_type, feedback_desc, contact_phone, rating, status, reply_content, processed_at)
          VALUES (?, ?, '佩戴后睡眠质量确实改善了，但刚戴上有轻微异物感，适应中。', '13800138001', 4, 'processed', '您好，轻微异物感是正常适应反应，通常1-2周后会逐渐减弱。如仍有不适请联系我们调整。', CURRENT_TIMESTAMP)
        `, [u.id, '初戴微酸胀']);
      }
      console.log('Seeded sample wearing records, timelines, maintenance, and feedbacks.');
    }
  } catch (err) {
    console.error('Failed to seed sample device data:', err);
  }

  // Seed default system settings
  try {
    const settingsCount = await query('SELECT count(*) as count FROM system_settings');
    if (settingsCount[0].count === 0) {
      await query(`
        INSERT INTO system_settings (key_name, key_value, description)
        VALUES
          ('booking_advance_days', '7', '预约提前天数'),
          ('booking_hours', '08:30 - 18:00', '每日可约时段'),
          ('booking_interval', '30', '时段间隔（分钟）'),
          ('booking_cancel_limit', '就诊前2小时', '取消预约截止时间'),
          ('allow_self_booking', 'true', '允许患者自助预约'),
          ('require_deposit', 'false', '预约需支付定金'),
          ('deposit_amount', '5000', '定金金额（分）'),
          ('appointment_subscribe_template_ids', '', '预约订阅消息模板ID，多个用英文逗号分隔'),
          ('commission1', '15', '一级佣金比例'),
          ('commission2', '5', '二级佣金比例'),
          ('min_withdraw', '100', '最低提现金额'),
          ('withdraw_fee_rate', '0.2', '提现手续费率'),
          ('enable_distribution', 'true', '开启分销功能'),
          ('auto_approve_withdraw', 'false', '自动审核提现'),
          ('notify_new_booking', 'true', '开启新预约通知'),
          ('notify_withdraw_apply', 'true', '开启提现申请通知'),
          ('notify_visit_reminder', 'true', '开启就诊提醒通知'),
          ('notify_revisit_reminder', 'true', '开启复诊提醒通知')
      `);
      console.log('Default system settings seeded.');
    }
  } catch (err) {
    console.error('Failed to seed system settings:', err);
  }

  // Ensure default products 1-7 exist for cashier checkout flows
  try {
    await query(`
      INSERT INTO products (id, name, category, image_url, price, original_price, description, stock, sales_count, status)
      VALUES
        (1, '定制式可调舌型阻鼾器 HJ-MAD-03', 'device', '/static/product/hj-mad-03.png', 298000, 368000, '针对中轻度阻塞性睡眠呼吸暂停(OSAHS)及顽固打鼾设计，采用食品级高分子材质，下颌前移微调精度达0.5mm，智能监测传感器自动上传睡眠佩戴时长与质量数据。', 120, 58, 'on'),
        (2, '鼾静阻鼾器专用清洁泡腾片 (60片/盒)', 'accessory', '/static/product/pillow.png', 4900, 6900, '专为阻鼾器高分子材料研发 of 温和除菌清洁片。能有效杀灭99.9%的口腔常见细菌，防止异味积聚，不损伤阻鼾器金属调节螺丝与树脂基托。', 800, 340, 'on'),
        (3, '鼾静智能阻鼾舒眠记忆枕', 'accessory', '/static/product/pillow.png', 29900, 39900, '人体工学设计，智能控温与防鼾姿势引导，提升整晚睡眠舒适度与深睡比例。', 150, 85, 'on'),
        (4, '诊所首诊挂号门诊费', 'service', '/static/product/screening.png', 20000, 20000, '挂号门诊费，包含初次就诊及基础筛查服务。', 99999, 1200, 'on'),
        (5, '诊所专家诊断评估费', 'service', '/static/product/screening.png', 50000, 50000, '专家诊断评估费，包含专家一对一问诊及阻鼾器物理适配评估。', 99999, 650, 'on'),
        (6, '专业睡眠呼吸多导初筛服务套餐', 'service', '/static/product/screening.png', 19900, 29900, '包含一次线上睡眠嗜睡问卷评估、三晚鼾声监测报告、以及一次门诊专家面对面的物理阻鼾器适应性筛查与出诊挂号费用。', 9999, 125, 'on'),
        (7, '快递运费', 'service', '/static/product/screening.png', 1500, 1500, '顺丰快递或挂号邮寄服务费。', 99999, 500, 'on'),
        (8, '就诊预约定金', 'service', '/static/product/screening.png', 20000, 20000, '就诊预约定金。', 99999, 100, 'on')
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        category = VALUES(category),
        price = VALUES(price),
        original_price = VALUES(original_price),
        status = VALUES(status)
    `);
    console.log('Ensured products 1-7 exist in database.');
  } catch (err) {
    console.error('Failed to ensure default products exist:', err);
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

  // Re-enable Foreign Key checks
  await query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('MySQL Database tables verified/created successfully.');
};
