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
      consult_count INT DEFAULT 0,
      review_count INT DEFAULT 0
    );
  `);
  try {
    await query(`ALTER TABLE doctors ADD COLUMN expertise JSON DEFAULT NULL;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE doctors ADD COLUMN consult_count INT DEFAULT 0;`);
  } catch (err) {
    // Ignore error if column already exists
  }
  try {
    await query(`ALTER TABLE doctors ADD COLUMN review_count INT DEFAULT 0;`);
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
      product_ids JSON
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

  // 30. roles
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) UNIQUE NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

  // Re-enable Foreign Key checks
  await query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('MySQL Database tables verified/created successfully.');
};
