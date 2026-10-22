import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { query, get, run } from './db.js';
import { JWT_SECRET, PII_SECRET } from './security-config.js';
import { requiredAdminPermissions, hasAdminPermission } from './admin-permissions.js';
import { patientAccessScope } from './admin-scope.js';

export { JWT_SECRET };

const assignedStoreIds = (user) => [...new Set((user?.store_ids || []).map(Number).filter(Number.isInteger))];

export const getShanghaiNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));

export const formatShanghaiDate = (date = getShanghaiNow()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatShanghaiDateTime = (date = new Date(), includeSeconds = true) => {
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
  const base = `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
  return includeSeconds ? `${base}:${read('second')}` : base;
};

export const addShanghaiDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const getShanghaiHourMinute = (date = new Date()) => {
  const shanghaiParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  return {
    hour: shanghaiParts.find((part) => part.type === 'hour')?.value || '00',
    minute: shanghaiParts.find((part) => part.type === 'minute')?.value || '00',
  };
};

// Helper to check if a store is open based on status and business hours
export const checkStoreIsOpen = (status, hours, openTimeColumn, closeTimeColumn) => {
  if (status !== 'open') return false;

  const { hour, minute } = getShanghaiHourMinute();
  const currentTime = `${hour}:${minute}`;

  if (hours && hours.length > 0) {
    return hours.some(hourRange => {
      const open = (hourRange.openTime || hourRange.open_time || '').slice(0, 5);
      const close = (hourRange.closeTime || hourRange.close_time || '').slice(0, 5);
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

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err || !user || user.scope === 'asset' || !user.role || !user.id || !Number.isInteger(user.token_version)) {
      return res.status(401).json({ code: 401, message: '登录已过期或无管理员权限，请重新登录' });
    }
    try {
      const admin = await get(
        `SELECT u.id, u.username, u.name, u.all_stores, u.doctor_id, u.role_id, u.token_version, r.code AS role
         FROM admin_users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.status = 'online' AND r.status = 'active'`,
        [user.id]
      );
      if (!admin || Number(admin.token_version) !== user.token_version) {
        return res.status(401).json({ code: 401, message: '登录已失效，请重新登录' });
      }
      admin.permissions = (await query('SELECT permission_resource FROM permissions WHERE role_id = ?', [admin.role_id])).map(p => p.permission_resource);
      if (!hasAdminPermission(admin, requiredAdminPermissions(req.method, req.route?.path))) {
        return res.status(403).json({ code: 403, message: '没有此操作的权限' });
      }
      admin.all_stores = Number(admin.all_stores) === 1;
      admin.store_ids = (await query(
        admin.all_stores
          ? 'SELECT id AS store_id FROM stores ORDER BY id'
          : 'SELECT store_id FROM admin_user_stores WHERE admin_user_id = ? ORDER BY store_id',
        admin.all_stores ? [] : [admin.id]
      )).map(row => Number(row.store_id));
      if (admin.role !== 'super_admin' && admin.store_ids.length === 0 && /^\/api\/admin\/(patients|appointments|orders|pay|im|assessments|dashboard|global-search|notifications|reports)(\/|$)/.test(req.route?.path || '')) {
        return res.status(403).json({ code: 403, message: '请先由管理员配置所属门店' });
      }
      req.user = admin;
      next();
    } catch (error) {
      return res.status(503).json({ code: 503, message: '暂时无法验证管理员权限' });
    }
  });
};

export const authenticatePromoterToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或无推广端访问权限' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err || !user || user.scope !== 'promoter' || !user.promoter_id || !user.user_id) {
      return res.status(403).json({ code: 403, message: '登录已失效或无推广端权限，请重新登录' });
    }
    try {
      const promoter = await get("SELECT id FROM distributors WHERE id = ? AND user_id = ? AND status = 'active'", [user.promoter_id, user.user_id]);
      if (!promoter) return res.status(403).json({ code: 403, message: '推广员账号不存在或已停用' });
      req.user = user;
      next();
    } catch (error) {
      return res.status(503).json({ code: 503, message: '暂时无法验证推广员权限' });
    }
  });
};

// Doctors are scoped to their own clinical records; other staff are scoped to their store.
export const verifyPatientAccess = async (patientId, user) => {
  if (user.role === 'super_admin') return true;
  const scope = patientAccessScope(user);
  const record = await get(`SELECT 1 FROM patients p WHERE p.id = ? AND ${scope.sql} LIMIT 1`, [patientId, ...scope.params]);
  return !!record;
};

export const getPrimaryPatientForUser = async (userId) => {
  if (!userId) return null;

  const selfPatient = await get(
    `SELECT p.*
     FROM users u
     JOIN patients p ON p.id = u.self_patient_id
     WHERE u.id = ? AND p.user_id = u.id
     LIMIT 1`,
    [userId]
  );
  if (selfPatient) {
    return selfPatient;
  }

  const legacySelfPatient = await get(
    `SELECT * FROM patients WHERE user_id = ? AND relation = 'self' ORDER BY id ASC LIMIT 1`,
    [userId]
  );
  if (legacySelfPatient) {
    return legacySelfPatient;
  }

  return get(
    `SELECT p.*
     FROM user_patient_links upl
     JOIN patients p ON p.id = upl.patient_id
     WHERE upl.user_id = ? AND p.user_id = upl.user_id
     ORDER BY CASE WHEN upl.relation = 'self' THEN 0 ELSE 1 END, upl.created_at ASC, upl.id ASC
     LIMIT 1`,
    [userId]
  );
};

export const getScopedPatientIdsForUser = async (userId) => {
  const primaryPatient = await getPrimaryPatientForUser(userId);
  if (!primaryPatient?.id) {
    return [];
  }

  if (primaryPatient.id_card) {
    const rows = await query(`SELECT id FROM patients WHERE id_card = ? AND user_id = ?`, [primaryPatient.id_card, userId]);
    return rows.map((row) => Number(row.id));
  }

  if (primaryPatient.phone) {
    const rows = await query(
      `SELECT id
       FROM patients
       WHERE phone = ? AND user_id = ?
         AND (id_card IS NULL OR id_card = '')`,
      [primaryPatient.phone, userId]
    );
    return rows.map((row) => Number(row.id));
  }

  return [Number(primaryPatient.id)];
};

// Helper to verify if a user's patients are accessible to the current user
export const verifyUserAccess = async (userId, user) => {
  const scopedPatientIds = await getScopedPatientIdsForUser(userId);
  if (!scopedPatientIds.length) {
    return false;
  }

  const placeholders = scopedPatientIds.map(() => '?').join(',');
  if (user.role === 'doctor') {
    const storeIds = assignedStoreIds(user);
    if (!user.doctor_id || !storeIds.length) return false;
    const storePlaceholders = storeIds.map(() => '?').join(',');
    const record = await get(
      `SELECT 1 FROM patients p WHERE p.id IN (${placeholders}) AND (
        p.id IN (SELECT patient_id FROM appointments WHERE doctor_id = ? AND store_id IN (${storePlaceholders}))
        OR p.id IN (SELECT patient_id FROM medical_records WHERE doctor_id = ? AND store_id IN (${storePlaceholders}))
      ) LIMIT 1`,
      [...scopedPatientIds, user.doctor_id, ...storeIds, user.doctor_id, ...storeIds]
    );
    return !!record;
  }
  if (user.role === 'super_admin') return true;
  const storeIds = assignedStoreIds(user);
  if (!storeIds.length) return false;
  const storePlaceholders = storeIds.map(() => '?').join(',');
  // Check if any patient belonging to this user has visited this store
  const record = await get(
    `SELECT 1 FROM patients p WHERE p.id IN (${placeholders}) AND (
      p.id IN (SELECT patient_id FROM appointments WHERE store_id IN (${storePlaceholders}))
      OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id IN (${storePlaceholders}))
    ) LIMIT 1`,
    [...scopedPatientIds, ...storeIds, ...storeIds]
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
export const logAdminAction = async (adminId, action, targetType, targetId, details, ipAddress = null, status = 'success', errorMessage = null) => {
  try {
    await run(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip_address, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId, 
        action, 
        targetType, 
        targetId ? String(targetId) : null, 
        details ? JSON.stringify(details) : null, 
        ipAddress,
        status,
        errorMessage
      ]
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
    if (err || !user || user.scope === 'asset' || !user.openid || !user.id) {
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

// PII Encryption / Decryption helpers using AES-256-CBC with deterministic IV
const DETERMINISTIC_IV = Buffer.from(PII_SECRET.slice(0, 16));

export function encryptPII(text) {
  if (!text) return text;
  try {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(PII_SECRET), DETERMINISTIC_IV);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return 'det:' + encrypted.toString('hex');
  } catch (err) {
    throw new Error('Personal information encryption failed', { cause: err });
  }
}

export function decryptPII(text) {
  if (!text) return text;
  try {
    if (!text.startsWith('det:')) return text;
    const encryptedText = Buffer.from(text.slice(4), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(PII_SECRET), DETERMINISTIC_IV);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    // Fail-safe: fallback to plaintext
    return text;
  }
}
