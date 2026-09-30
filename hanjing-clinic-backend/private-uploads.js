import jwt from 'jsonwebtoken';
import { get, query, run } from './db.js';
import { JWT_SECRET, verifyPatientAccess } from './helpers.js';

export function privateUploadPath(value) {
  if (typeof value !== 'string' || !/^(\/uploads\/|https?:\/\/)/.test(value)) return '';
  try {
    const path = decodeURIComponent(new URL(value, 'http://local').pathname);
    return /^\/uploads\/(medical-attachments|snore|admin\/files)\/[a-zA-Z0-9/_.-]+$/.test(path) && !path.includes('..') ? path : '';
  } catch { return ''; }
}

export async function registerPrivateUpload(path, user) {
  await run('INSERT INTO private_uploads (file_path,user_id,admin_id) VALUES(?,?,?)',
    [path, user.openid ? user.id : null, user.role ? user.id : null]);
}

export async function canReadPrivateUpload(path, user) {
  if (!path || !user?.id) return false;
  let admin;
  if (user.role) {
    admin = await get(`SELECT u.*,r.code AS role FROM admin_users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=? AND u.status='online' AND r.status='active'`, [user.id]);
    if (!admin) return false;
    if (admin.role !== 'super_admin') {
      const allowed = await get("SELECT 1 FROM permissions WHERE role_id=? AND permission_resource IN ('medical_record:view','medical_record:edit') LIMIT 1", [admin.role_id]);
      if (!allowed || !admin.store_id) return false;
    }
  } else if (!user.openid || !await get('SELECT id FROM users WHERE id=? AND openid=?', [user.id, user.openid])) return false;
  const asset = await get('SELECT * FROM private_uploads WHERE file_path=?', [path]);
  if (asset && (admin ? admin.role === 'super_admin' || Number(asset.admin_id) === Number(admin.id) : Number(asset.user_id) === Number(user.id))) return true;
  const recordings = await query('SELECT patient_id FROM snore_assessments WHERE file_url=?', [path]);
  const attachments = await query('SELECT patient_id, attachments FROM medical_records WHERE attachments LIKE ?', ['%' + path.replace(/[\\%_]/g, '\\$&') + '%']);
  const records = [...recordings];
  for (const record of attachments) {
    try {
      const files = typeof record.attachments === 'string' ? JSON.parse(record.attachments) : record.attachments;
      if (Array.isArray(files) && files.some(file => privateUploadPath(typeof file === 'string' ? file : file?.url) === path)) records.push(record);
    } catch { /* Malformed legacy metadata cannot grant access. */ }
  }
  for (const record of records) {
    if (admin) {
      if (await verifyPatientAccess(record.patient_id, admin)) return true;
    } else if (await get('SELECT id FROM patients WHERE id=? AND user_id=?', [record.patient_id, user.id])) return true;
  }
  return false;
}

export async function authorizeUpload(req, res, next) {
  if (/^\/(admin\/images|distribution\/qrcodes)\//.test(req.path)) return next();
  try {
    const path = privateUploadPath('/uploads' + req.path);
    const token = req.query.asset_token || req.headers.authorization?.split(' ')[1];
    if (!token || !path) return res.status(403).send('Forbidden');
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (claims.scope === 'asset' && claims.path !== path) return res.status(403).send('Forbidden');
    if (!await canReadPrivateUpload(path, claims)) return res.status(403).send('Forbidden');
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  } catch { res.status(403).send('Forbidden'); }
}

// Images/audio cannot attach Authorization headers. Give authenticated responses short-lived,
// path-bound URLs; the download still checks current account and patient permissions.
export function signPrivateUploadResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = body => {
    const user = req.user;
    const sign = value => {
      if (typeof value === 'string') {
        const path = privateUploadPath(value);
        if (!path || !user?.id) return value;
        const claims = { scope: 'asset', path, id: user.id };
        if (user.openid) claims.openid = user.openid;
        else if (user.role) claims.role = user.role;
        else return value;
        const unsigned = value.split('?')[0];
        return unsigned + '?asset_token=' + jwt.sign(claims, JWT_SECRET, { expiresIn: '15m' });
      }
      if (Array.isArray(value)) return value.map(sign);
      if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sign(item)]));
      return value;
    };
    return json(sign(body));
  };
  next();
}
