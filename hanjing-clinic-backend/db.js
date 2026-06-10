import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

// Promisify database operations
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('SQL Error:', sql, params, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('SQL Error:', sql, params, err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('SQL Error:', sql, params, err);
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

// Initialize Tables
export const initDB = async () => {
  console.log('Initializing SQLite database...');

  // Enable foreign keys
  await run('PRAGMA foreign_keys = ON;');

  // 1. users
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      unionid TEXT UNIQUE,
      phone TEXT UNIQUE,
      nickname TEXT NOT NULL,
      avatar_url TEXT,
      gender INTEGER DEFAULT 0,
      birthday TEXT,
      member_level TEXT DEFAULT 'normal',
      points INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. patients
  await run(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      relation TEXT DEFAULT 'self',
      gender INTEGER DEFAULT 0,
      age INTEGER,
      phone TEXT,
      has_snore INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. stores
  await run(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      district TEXT,
      latitude REAL,
      longitude REAL,
      phone TEXT,
      open_time TEXT DEFAULT '09:00:00',
      close_time TEXT DEFAULT '18:00:00',
      status TEXT DEFAULT 'open',
      has_parking INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. store_features
  await run(`
    CREATE TABLE IF NOT EXISTS store_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      feature TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 5. doctors
  await run(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_url TEXT,
      title TEXT NOT NULL,
      specialty TEXT NOT NULL,
      hospital TEXT,
      intro TEXT,
      experience_years INTEGER DEFAULT 0,
      rating REAL DEFAULT 5.0,
      consult_fee INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1
    );
  `);

  // 6. doctor_store_mapping
  await run(`
    CREATE TABLE IF NOT EXISTS doctor_store_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 7. doctor_schedules
  await run(`
    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_slots INTEGER DEFAULT 6,
      booked_slots INTEGER DEFAULT 0,
      status TEXT DEFAULT 'available',
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 8. ess_assessments
  await run(`
    CREATE TABLE IF NOT EXISTS ess_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      answers TEXT NOT NULL, -- JSON string
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 9. snore_assessments
  await run(`
    CREATE TABLE IF NOT EXISTS snore_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      duration INTEGER NOT NULL,
      avg_decibel INTEGER NOT NULL,
      peak_decibel INTEGER NOT NULL,
      snore_rate INTEGER NOT NULL,
      apnea_events INTEGER NOT NULL,
      risk_level TEXT DEFAULT 'low',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 10. appointments
  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      type TEXT DEFAULT 'first',
      status TEXT DEFAULT 'pending',
      symptom_desc TEXT,
      cancel_reason TEXT,
      source TEXT DEFAULT 'mini_app',
      ess_assessment_id INTEGER,
      snore_assessment_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  await run(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      appointment_id INTEGER,
      visit_date TEXT NOT NULL,
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
  await run(`
    CREATE TABLE IF NOT EXISTS treatment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      medical_record_id INTEGER,
      device_model TEXT NOT NULL,
      initial_advancement REAL DEFAULT 0.0,
      current_advancement REAL DEFAULT 0.0,
      start_date TEXT NOT NULL,
      next_adjust_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL
    );
  `);

  // 13. wearing_logs
  await run(`
    CREATE TABLE IF NOT EXISTS wearing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treatment_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      wear_duration REAL DEFAULT 0.0,
      comfort INTEGER DEFAULT 3,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);

  // 14. device_adjustments
  await run(`
    CREATE TABLE IF NOT EXISTS device_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treatment_id INTEGER NOT NULL,
      adjust_date TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      adjusted_advancement REAL NOT NULL,
      patient_feedback TEXT,
      instructions TEXT,
      FOREIGN KEY (treatment_id) REFERENCES treatment_records(id) ON DELETE CASCADE
    );
  `);

  // 15. follow_up_tasks
  await run(`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );
  `);

  // 16. follow_up_records
  await run(`
    CREATE TABLE IF NOT EXISTS follow_up_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      contact_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );
  `);

  // 17. products
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      gallery_urls TEXT, -- JSON string
      price INTEGER NOT NULL,
      original_price INTEGER,
      description TEXT,
      stock INTEGER DEFAULT 0,
      sales_count INTEGER DEFAULT 0,
      is_distribution INTEGER DEFAULT 0,
      commission_rate REAL DEFAULT 0.0,
      status TEXT DEFAULT 'off',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 18. coupons
  await run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL, -- 'discount' or 'cash'
      value INTEGER NOT NULL,
      min_spend INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      valid_start TEXT,
      valid_end TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 19. orders
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'product',
      total_amount INTEGER NOT NULL,
      discount_amount INTEGER DEFAULT 0,
      coupon_id INTEGER,
      pay_amount INTEGER NOT NULL,
      pay_method TEXT DEFAULT 'wechat',
      pay_at TIMESTAMP,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT, -- JSON string
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
    );
  `);

  // 20. order_items
  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_image TEXT,
      price INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 21. user_coupons
  await run(`
    CREATE TABLE IF NOT EXISTS user_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
    );
  `);

  // 22. distributors
  await run(`
    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nickname TEXT NOT NULL,
      avatar_url TEXT,
      level TEXT DEFAULT 'silver',
      invite_code TEXT UNIQUE NOT NULL,
      invite_qr_url TEXT,
      total_commission INTEGER DEFAULT 0,
      available_commission INTEGER DEFAULT 0,
      withdrawn_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 23. distribution_relationships
  await run(`
    CREATE TABLE IF NOT EXISTS distribution_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_user_id INTEGER NOT NULL,
      child_user_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 24. distribution_orders
  await run(`
    CREATE TABLE IF NOT EXISTS distribution_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      distributor_id INTEGER NOT NULL,
      buyer_name TEXT NOT NULL,
      order_amount INTEGER NOT NULL,
      commission_amount INTEGER NOT NULL,
      commission_level INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      settled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
    );
  `);

  // 25. withdraw_records
  await run(`
    CREATE TABLE IF NOT EXISTS withdraw_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER DEFAULT 0,
      actual_amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      account_info TEXT NOT NULL,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 26. user_notifications
  await run(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 27. live_rooms
  await run(`
    CREATE TABLE IF NOT EXISTS live_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cover_url TEXT NOT NULL,
      anchor_name TEXT NOT NULL,
      anchor_avatar TEXT,
      status TEXT DEFAULT 'upcoming',
      start_time TEXT NOT NULL,
      end_time TEXT,
      viewer_count INTEGER DEFAULT 0,
      replay_url TEXT,
      product_ids TEXT -- JSON string array
    );
  `);

  // 28. community_posts
  await run(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_role TEXT DEFAULT 'patient',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_urls TEXT, -- JSON string array
      tags TEXT, -- JSON string array
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      is_top INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 29. post_comments
  await run(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER,
      content TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 30. roles
  await run(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 31. permissions
  await run(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      permission_resource TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );
  `);

  // 32. admin_users
  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role_id INTEGER NOT NULL,
      store_id INTEGER,
      status TEXT DEFAULT 'online',
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
    );
  `);

  console.log('Database tables verified/created successfully.');
};
