import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { query, get, run } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'hanjing_clinic_secret_key_2026';

// Helper to check if a store is open based on status and business hours
export const checkStoreIsOpen = (status, hours, openTimeColumn, closeTimeColumn) => {
  if (status !== 'open') return false;

  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (hours && hours.length > 0) {
    return hours.some(h => {
      const open = (h.openTime || h.open_time || '').slice(0, 5);
      const close = (h.closeTime || h.close_time || '').slice(0, 5);
      return open && close && currentTime >= open && currentTime <= close;
    });
  } else {
    const open = openTimeColumn ? openTimeColumn.slice(0, 5) : '09:00';
    const close = closeTimeColumn ? closeTimeColumn.slice(0, 5) : '18:00';
    return currentTime >= open && currentTime <= close;
  }
};

// Auth Middleware for Admin
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或没有权限访问' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user || !user.role) {
      return res.status(403).json({ code: 403, message: '登录已过期或无管理员权限，请重新登录' });
    }
    req.user = user;
    next();
  });
};

// Helper to verify if a patient is accessible to the current user (store-restricted)
export const verifyPatientAccess = async (patientId, user) => {
  if (user.role === 'super_admin' || !user.store_id) {
    return true; // Super admin or users not bound to a store have global access
  }
  // Check if patient has any appointment or medical record at the user's store
  const record = await get(
    `SELECT 1 FROM patients p WHERE p.id = ? AND (
      p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
      OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
    ) LIMIT 1`,
    [patientId, user.store_id, user.store_id]
  );
  return !!record;
};

// Helper to verify if a user's patients are accessible to the current user
export const verifyUserAccess = async (userId, user) => {
  if (user.role === 'super_admin' || !user.store_id) {
    return true;
  }
  // Check if any patient belonging to this user has visited this store
  const record = await get(
    `SELECT 1 FROM patients p WHERE p.user_id = ? AND (
      p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
      OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
    ) LIMIT 1`,
    [userId, user.store_id, user.store_id]
  );
  return !!record;
};

// Mask patient phone number (e.g. 139****9999)
export const maskPhone = (phone) => {
  if (!phone) return phone;
  const str = String(phone).trim();
  if (str.length >= 7) {
    return str.slice(0, 3) + '****' + str.slice(-4);
  }
  return str;
};

// Escape HTML entities to prevent XSS attacks
export const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
};


// Log administrator action to audit_logs
export const logAdminAction = async (adminId, action, targetType, targetId, details) => {
  try {
    await run(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, action, targetType, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// Auth Middleware for WeChat Miniprogram
export const authenticateWxToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 401, message: '未授权或登录过期' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user || !user.openid) {
      return res.status(401).json({ code: 401, message: '未授权或登录过期' });
    }
    req.user = user;
    next();
  });
};

// Hash password using secure PBKDF2-SHA512
export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${iterations}$${hash}`;
};

// Verify password supporting legacy SHA-256 and secure PBKDF2
export const verifyPassword = (password, storedHash) => {
  if (!storedHash) return false;
  if (!storedHash.startsWith('pbkdf2$')) {
    // Fallback to legacy SHA-256
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return legacyHash === storedHash;
  }
  const [algo, salt, iterationsStr, hash] = storedHash.split('$');
  const iterations = parseInt(iterationsStr, 10);
  const verifyHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return verifyHash === hash;
};

