import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, get, run, transaction, autoUpdateExpiredAppointments } from '../db.js';
import { generateUniquePatientNo } from '../patientNo.js';
import {
  JWT_SECRET,
  checkStoreIsOpen,
  authenticateToken,
  verifyPatientAccess,
  verifyUserAccess,
  maskPhone,
  logAdminAction,
  hashPassword,
  verifyPassword
} from '../helpers.js';

const app = express.Router();
const PAID_ORDER_STATUSES = ['paid', 'shipping', 'shipped', 'processing', 'completed'];
const PAID_ORDER_STATUSES_SQL = PAID_ORDER_STATUSES.map(status => `'${status}'`).join(', ');

const formatDate = (d) => {
  if (!d) return '';
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
};

const buildTreatmentDeviceSnapshot = (product) => ({
  id: product.id,
  name: product.name,
  imageUrl: product.image_url || '',
  price: Number(product.price || 0),
  description: product.description || ''
});

const safeJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const mapPatientSource = (source) => {
  const map = {
    '小程序': 'mini_app',
    '分销': 'distribution',
    '转介绍': 'referral',
    '门店': 'walk_in',
    '直播': 'live',
    mini_app: 'mini_app',
    distribution: 'distribution',
    referral: 'referral',
    walk_in: 'walk_in',
    live: 'live',
    admin: 'admin'
  };
  return map[source] || source || 'walk_in';
};

const getRolePermissions = async (roleId) => {
  const perms = await query(`SELECT permission_resource FROM permissions WHERE role_id = ?`, [roleId]);
  return perms.map(p => p.permission_resource);
};

const WECHAT_TOKEN_CACHE = {
  value: '',
  expiresAt: 0
};

function mapWechatLiveStatus(status) {
  const code = Number(status);
  if (code === 101) return 'live';
  if (code === 102) return 'upcoming';
  if ([103, 104, 105, 106, 107].includes(code)) return 'replay';
  return 'upcoming';
}

async function getWechatMiniAccessToken() {
  const now = Date.now();
  if (WECHAT_TOKEN_CACHE.value && WECHAT_TOKEN_CACHE.expiresAt > now + 60_000) {
    return WECHAT_TOKEN_CACHE.value;
  }

  const appId = process.env.WX_MINI_APP_ID;
  const appSecret = process.env.WX_MINI_APP_SECRET;
  if (!appId || !appSecret) {
    const err = new Error('未配置微信小程序 AppID / AppSecret');
    err.statusCode = 400;
    throw err;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    const err = new Error(data.errmsg || '获取微信 access_token 失败');
    err.statusCode = 502;
    throw err;
  }

  WECHAT_TOKEN_CACHE.value = data.access_token;
  WECHAT_TOKEN_CACHE.expiresAt = now + Math.max((Number(data.expires_in) || 7200) - 120, 60) * 1000;
  return WECHAT_TOKEN_CACHE.value;
}

async function fetchWechatLiveRoom(roomId) {
  if (!/^\d+$/.test(String(roomId || ''))) {
    const err = new Error('微信直播间ID必须为纯数字');
    err.statusCode = 400;
    throw err;
  }
  const token = await getWechatMiniAccessToken();
  const response = await fetch(`https://api.weixin.qq.com/wxa/business/getliveinfo?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'get_by_ids',
      room_ids: [Number(roomId)]
    })
  });
  const data = await response.json();
  if (!response.ok || data.errcode) {
    const err = new Error(data.errmsg || '获取微信直播间信息失败');
    err.statusCode = 502;
    throw err;
  }

  const rawRoom = Array.isArray(data.room_info) ? data.room_info[0] : null;
  if (!rawRoom) {
    const err = new Error('未查询到对应微信直播间');
    err.statusCode = 404;
    throw err;
  }

  return {
    raw: rawRoom,
    title: rawRoom.name || rawRoom.title || '',
    coverUrl: rawRoom.cover_img || rawRoom.coverUrl || '',
    anchorName: rawRoom.anchor_name || rawRoom.anchorName || '',
    startTime: rawRoom.start_time ? new Date(Number(rawRoom.start_time) * 1000).toISOString().slice(0, 19).replace('T', ' ') : '',
    endTime: rawRoom.end_time ? new Date(Number(rawRoom.end_time) * 1000).toISOString().slice(0, 19).replace('T', ' ') : null,
    status: mapWechatLiveStatus(rawRoom.live_status)
  };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function buildRequestOrigin(req) {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, '');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

function normalizeWechatTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor(date.getTime() / 1000);
}

async function uploadWechatMediaFromUrl(url) {
  if (!isHttpUrl(url)) {
    const err = new Error('直播封面不是可访问的图片URL，请填写微信素材media_id或可公网访问的图片地址');
    err.statusCode = 400;
    throw err;
  }

  const token = await getWechatMiniAccessToken();
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) {
    const err = new Error('下载直播封面失败，无法上传到微信素材库');
    err.statusCode = 400;
    throw err;
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const fileExt = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const blob = new Blob([await imageResponse.arrayBuffer()], { type: contentType });
  const form = new FormData();
  form.append('media', blob, `live-cover.${fileExt}`);

  const mediaResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=image`, {
    method: 'POST',
    body: form
  });
  const mediaData = await mediaResponse.json();
  if (!mediaResponse.ok || mediaData.errcode || !mediaData.media_id) {
    const err = new Error(mediaData.errmsg || '上传微信直播封面素材失败');
    err.statusCode = 502;
    throw err;
  }

  return mediaData.media_id;
}

async function createWechatLiveRoom(payload) {
  const {
    title,
    cover_url,
    wechat_cover_media_id,
    wechat_share_media_id,
    anchor_name,
    wechat_anchor_wechat,
    start_time,
    end_time
  } = payload;

  const startTime = normalizeWechatTimestamp(start_time);
  const endTime = normalizeWechatTimestamp(end_time);
  if (!title || !anchor_name || !wechat_anchor_wechat || !startTime || !endTime) {
    const err = new Error('创建微信直播间缺少必填字段');
    err.statusCode = 400;
    throw err;
  }
  if (endTime <= startTime) {
    const err = new Error('直播结束时间必须晚于开始时间');
    err.statusCode = 400;
    throw err;
  }

  const token = await getWechatMiniAccessToken();
  const coverMediaId = wechat_cover_media_id || await uploadWechatMediaFromUrl(cover_url);
  const shareMediaId = wechat_share_media_id || coverMediaId;

  const response = await fetch(`https://api.weixin.qq.com/wxaapi/broadcast/room/create?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: title,
      coverImg: coverMediaId,
      shareImg: shareMediaId,
      startTime,
      endTime,
      anchorName: anchor_name,
      anchorWechat: wechat_anchor_wechat,
      type: 1,
      screenType: 0,
      closeLike: 0,
      closeGoods: 0,
      closeComment: 0,
      closeReplay: 0
    })
  });
  const data = await response.json();
  if (!response.ok || data.errcode) {
    const err = new Error(data.errmsg || '创建微信直播间失败');
    err.statusCode = 502;
    throw err;
  }

  return {
    roomId: String(data.roomId || data.room_id || ''),
    coverMediaId,
    shareMediaId
  };
}

const failedAttempts = new Map(); // username -> { count, lockUntil }

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
  }

  const now = Date.now();
  const attempt = failedAttempts.get(username) || { count: 0, lockUntil: 0 };

  if (attempt.lockUntil > now) {
    const remainingMinutes = Math.ceil((attempt.lockUntil - now) / 60000);
    return res.status(429).json({
      code: 429,
      message: `账号已被临时锁定，请在 ${remainingMinutes} 分钟后重新尝试登录`
    });
  }

  try {
    const user = await get(
      `SELECT u.*, r.name as role_name, r.code as role_code, r.status as role_status,
              d.name as doctor_name
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       LEFT JOIN doctors d ON u.doctor_id = d.id
       WHERE u.username = ?`,
      [username]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      attempt.count += 1;
      if (attempt.count >= 5) {
        attempt.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
        failedAttempts.set(username, attempt);
        return res.status(429).json({
          code: 429,
          message: '密码错误次数过多，账号已临时锁定，请 15 分钟后再试'
        });
      }
      failedAttempts.set(username, attempt);
      return res.status(400).json({
        code: 400,
        message: `用户名或密码不正确（连续输入错误 5 次将被锁定，还剩 ${5 - attempt.count} 次机会）`
      });
    }

    if (user.status !== 'online') {
      return res.status(403).json({ code: 403, message: '该账号已被停用/禁用，请联系超级管理员' });
    }
    if (user.role_status === 'inactive') {
      return res.status(403).json({ code: 403, message: '该账号所属角色已禁用，请联系超级管理员' });
    }

    // Reset failed attempts
    failedAttempts.delete(username);

    // Update last login
    await run(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    // Write audit log
    await logAdminAction(user.id, 'login', 'admin', user.id, { username: user.username });
    const permissions = await getRolePermissions(user.role_id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_code, store_id: user.store_id, doctor_id: user.doctor_id || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          phone: user.phone,
          role_name: user.role_name,
          role_code: user.role_code,
          store_id: user.store_id,
          doctor_id: user.doctor_id,
          doctor_name: user.doctor_name,
          permissions
        }
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ code: 500, message: '系统内部错误，请稍后再试' });
  }
});

const smsCodes = new Map(); // phone -> { code, expires }

app.post('/api/admin/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '请输入有效的手机号' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  smsCodes.set(phone, { code, expires: Date.now() + 5 * 60 * 1000 }); // 5 minutes validity

  console.log(`[SMS Send] Verification code for ${phone} is: ${code}`);

  res.json({
    code: 200,
    message: '验证码发送成功（测试环境已直接返回）',
    data: { code }
  });
});

app.post('/api/admin/sms-login', async (req, res) => {
  const { phone, smsCode } = req.body;
  if (!phone || !smsCode) {
    return res.status(400).json({ code: 400, message: '手机号和验证码不能为空' });
  }

  // Verify verification code
  const cached = smsCodes.get(phone);
  if (!cached || cached.code !== smsCode || Date.now() > cached.expires) {
    return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
  }

  // Delete code on successful verification
  smsCodes.delete(phone);

  try {
    const user = await get(
      `SELECT u.*, r.name as role_name, r.code as role_code, r.status as role_status,
              d.name as doctor_name
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       LEFT JOIN doctors d ON u.doctor_id = d.id
       WHERE u.phone = ? LIMIT 1`,
      [phone]
    );

    if (!user) {
      return res.status(400).json({ code: 400, message: '该手机号未绑定管理员账号' });
    }

    if (user.status !== 'online') {
      return res.status(403).json({ code: 403, message: '该账号已被禁用' });
    }
    if (user.role_status === 'inactive') {
      return res.status(403).json({ code: 403, message: '该账号所属角色已禁用，请联系超级管理员' });
    }

    // Update last login
    await run(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    // Write audit log
    await logAdminAction(user.id, 'login', 'admin', user.id, { username: user.username, method: 'sms' });
    const permissions = await getRolePermissions(user.role_id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_code, store_id: user.store_id, doctor_id: user.doctor_id || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          phone: user.phone,
          role_name: user.role_name,
          role_code: user.role_code,
          store_id: user.store_id,
          doctor_id: user.doctor_id,
          doctor_name: user.doctor_name,
          permissions
        }
      }
    });
  } catch (error) {
    console.error('SMS Login Error:', error);
    res.status(500).json({ code: 500, message: '系统内部错误' });
  }
});


app.get('/api/admin/me', authenticateToken, async (req, res) => {
  try {
    const user = await get(
      `SELECT u.id, u.username, u.name, u.phone, u.store_id, u.doctor_id, u.role_id,
              r.name as role_name, r.code as role_code, s.name as store_name,
              d.name as doctor_name, d.title as doctor_title
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       LEFT JOIN stores s ON u.store_id = s.id
       LEFT JOIN doctors d ON u.doctor_id = d.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    user.permissions = await getRolePermissions(user.role_id);
    res.json({ code: 200, data: user });
  } catch (error) {
    res.status(500).json({ code: 500, message: '系统错误' });
  }
});

app.put('/api/admin/profile', authenticateToken, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await run(
      `UPDATE admin_users SET name = ?, phone = ? WHERE id = ?`,
      [name || '', phone || '', req.user.id]
    );
    res.json({ code: 200, message: '个人资料修改成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '修改个人资料失败' });
  }
});

app.put('/api/admin/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ code: 400, message: '原始密码和新密码不能为空' });
  }
  try {
    const user = await get(`SELECT password_hash FROM admin_users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    const hashedOld = hashPassword(oldPassword);
    if (user.password_hash !== hashedOld) {
      return res.status(400).json({ code: 400, message: '原始密码不正确' });
    }
    const hashedNew = hashPassword(newPassword);
    await run(`UPDATE admin_users SET password_hash = ? WHERE id = ?`, [hashedNew, req.user.id]);
    res.json({ code: 200, message: '密码修改成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '修改密码失败' });
  }
});

// ----------------------------------------
// 2. DASHBOARD / STATS
// ----------------------------------------
app.get('/api/admin/dashboard/stats', authenticateToken, async (req, res) => {
  const range = req.query.range || 'month'; // 'today', 'week', 'month'
  
  let dateFilterAppt = `appointment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  let dateFilterOrder = `pay_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  let dateFilterPatient = `created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  
  let prevDateFilterAppt = `appointment_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND appointment_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  let prevDateFilterOrder = `pay_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND pay_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  let prevDateFilterPatient = `created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  
  let periodLabel = '本月';

  if (range === 'today') {
    dateFilterAppt = `appointment_date = CURDATE()`;
    dateFilterOrder = `DATE(pay_at) = CURDATE()`;
    dateFilterPatient = `DATE(created_at) = CURDATE()`;
    
    prevDateFilterAppt = `appointment_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    prevDateFilterOrder = `DATE(pay_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    prevDateFilterPatient = `DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    
    periodLabel = '今日';
  } else if (range === 'week') {
    dateFilterAppt = `YEARWEEK(appointment_date, 1) = YEARWEEK(CURDATE(), 1)`;
    dateFilterOrder = `YEARWEEK(pay_at, 1) = YEARWEEK(CURDATE(), 1)`;
    dateFilterPatient = `YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)`;
    
    prevDateFilterAppt = `YEARWEEK(appointment_date, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)`;
    prevDateFilterOrder = `YEARWEEK(pay_at, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)`;
    prevDateFilterPatient = `YEARWEEK(created_at, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)`;
    
    periodLabel = '本周';
  }

  try {
    // 1. Revenue (Current & Previous)
    let revSql = `SELECT SUM(pay_amount) as total FROM orders WHERE status IN (${PAID_ORDER_STATUSES_SQL}) AND ${dateFilterOrder}`;
    let prevRevSql = `SELECT SUM(pay_amount) as total FROM orders WHERE status IN (${PAID_ORDER_STATUSES_SQL}) AND ${prevDateFilterOrder}`;
    const revParams = [];
    const prevRevParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      const storeFilter = ` AND user_id IN (
        SELECT p.user_id FROM patients p
        WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
           OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
      )`;
      revSql += storeFilter;
      prevRevSql += storeFilter;
      revParams.push(req.user.store_id, req.user.store_id);
      prevRevParams.push(req.user.store_id, req.user.store_id);
    }
    const revRow = await get(revSql, revParams);
    const prevRevRow = await get(prevRevSql, prevRevParams);
    const revenue = revRow.total || 0;
    const prevRevenue = prevRevRow.total || 0;

    // 2. Appointments count (Current & Previous)
    let apptSql = `SELECT COUNT(*) as count FROM appointments WHERE ${dateFilterAppt}`;
    let prevApptSql = `SELECT COUNT(*) as count FROM appointments WHERE ${prevDateFilterAppt}`;
    const apptParams = [];
    const prevApptParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      apptSql += ` AND store_id = ?`;
      prevApptSql += ` AND store_id = ?`;
      apptParams.push(req.user.store_id);
      prevApptParams.push(req.user.store_id);
    }
    const apptRow = await get(apptSql, apptParams);
    const prevApptRow = await get(prevApptSql, prevApptParams);
    const appointments = apptRow.count || 0;
    const prevAppointments = prevApptRow.count || 0;

    // 3. New Patients count (Current & Previous)
    let patientSql = `SELECT COUNT(*) as count FROM patients WHERE ${dateFilterPatient}`;
    let prevPatientSql = `SELECT COUNT(*) as count FROM patients WHERE ${prevDateFilterPatient}`;
    const patientParams = [];
    const prevPatientParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      const storeFilter = ` AND (
        id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
        OR id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
      )`;
      patientSql += storeFilter;
      prevPatientSql += storeFilter;
      patientParams.push(req.user.store_id, req.user.store_id);
      prevPatientParams.push(req.user.store_id, req.user.store_id);
    }
    const patientRow = await get(patientSql, patientParams);
    const prevPatientRow = await get(prevPatientSql, prevPatientParams);
    const newPatients = patientRow.count || 0;
    const prevNewPatients = prevPatientRow.count || 0;

    // 4. Visit rate (completed / total appointments) (Current & Previous)
    let completedApptSql = `SELECT COUNT(*) as count FROM appointments WHERE status IN ('completed', 'arrived', 'settled') AND ${dateFilterAppt}`;
    let prevCompletedApptSql = `SELECT COUNT(*) as count FROM appointments WHERE status IN ('completed', 'arrived', 'settled') AND ${prevDateFilterAppt}`;
    const completedApptParams = [];
    const prevCompletedApptParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      completedApptSql += ` AND store_id = ?`;
      prevCompletedApptSql += ` AND store_id = ?`;
      completedApptParams.push(req.user.store_id);
      prevCompletedApptParams.push(req.user.store_id);
    }
    const completedApptRow = await get(completedApptSql, completedApptParams);
    const prevCompletedApptRow = await get(prevCompletedApptSql, prevCompletedApptParams);
    const completedAppts = completedApptRow.count || 0;
    const prevCompletedAppts = prevCompletedApptRow.count || 0;
    const visitRate = appointments > 0 ? Math.round((completedAppts / appointments) * 100) : 0;
    const prevVisitRate = prevAppointments > 0 ? Math.round((prevCompletedAppts / prevAppointments) * 100) : 0;

    // Helper to calculate comparison trend percentage
    const calculateTrend = (curr, prev) => {
      if (prev === 0) {
        if (curr === 0) return { trend: '0%', trendType: 'up' };
        return { trend: '+100%', trendType: 'up' };
      }
      const diff = curr - prev;
      const pct = Math.round((diff / prev) * 100);
      if (pct >= 0) {
        return { trend: `+${pct}%`, trendType: 'up' };
      } else {
        return { trend: `${pct}%`, trendType: 'down' };
      }
    };

    const apptTrendInfo = calculateTrend(appointments, prevAppointments);
    const revenueTrendInfo = calculateTrend(revenue, prevRevenue);
    const patientTrendInfo = calculateTrend(newPatients, prevNewPatients);
    
    // Visit rate comparison (difference in percentage points)
    const rateDiff = visitRate - prevVisitRate;
    const rateTrendInfo = {
      trend: rateDiff >= 0 ? `+${rateDiff}%` : `${rateDiff}%`,
      trendType: rateDiff >= 0 ? 'up' : 'down'
    };

    // 5. Department distribution based on appointment counts
    let deptSql = `
      SELECT d.specialty as name, COUNT(*) as count 
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
    `;
    const deptParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      deptSql += ` WHERE a.store_id = ?`;
      deptParams.push(req.user.store_id);
    }
    deptSql += ` GROUP BY d.specialty`;
    const deptRows = await query(deptSql, deptParams);
    
    let totalApptsAll = 0;
    deptRows.forEach(r => totalApptsAll += r.count);
    
    const colors = ['#3B6BF5', '#5A85F5', '#1A9D5C', '#F5A623', '#8B5CF6'];
    const depts = deptRows.map((r, idx) => ({
      name: r.name,
      percent: totalApptsAll > 0 ? Math.round((r.count / totalApptsAll) * 100) : 0,
      color: colors[idx % colors.length]
    })).sort((a, b) => b.percent - a.percent);



    let docSql = `SELECT COUNT(*) as count FROM doctors WHERE status = 1`;
    const docParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      docSql = `
        SELECT COUNT(DISTINCT d.id) as count 
        FROM doctors d 
        JOIN doctor_store_mapping m ON d.id = m.doctor_id 
        WHERE d.status = 1 AND m.store_id = ?
      `;
      docParams.push(req.user.store_id);
    }
    const onlineDoctorsRow = await get(docSql, docParams);
    const onlineDoctors = onlineDoctorsRow.count || 0;

    // 6. Chart: Appointments grouped by date/time based on range
    let apptTrendSql = '';
    const apptTrendParams = [];
    if (range === 'today') {
      apptTrendSql = `
        SELECT appointment_time as date, COUNT(*) as count 
        FROM appointments 
        WHERE appointment_date = CURDATE()
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        apptTrendSql += ` AND store_id = ?`;
        apptTrendParams.push(req.user.store_id);
      }
      apptTrendSql += `
        GROUP BY appointment_time 
        ORDER BY appointment_time DESC
      `;
    } else if (range === 'week') {
      apptTrendSql = `
        SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') as date, COUNT(*) as count 
        FROM appointments 
        WHERE YEARWEEK(appointment_date, 1) = YEARWEEK(CURDATE(), 1)
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        apptTrendSql += ` AND store_id = ?`;
        apptTrendParams.push(req.user.store_id);
      }
      apptTrendSql += `
        GROUP BY appointment_date 
        ORDER BY appointment_date DESC
      `;
    } else { // month
      apptTrendSql = `
        SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') as date, COUNT(*) as count 
        FROM appointments 
        WHERE appointment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND appointment_date <= LAST_DAY(CURDATE())
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        apptTrendSql += ` AND store_id = ?`;
        apptTrendParams.push(req.user.store_id);
      }
      apptTrendSql += `
        GROUP BY appointment_date 
        ORDER BY appointment_date DESC
      `;
    }
    const appointmentTrends = await query(apptTrendSql, apptTrendParams);

    // 7. Chart: Revenue grouped by date/time based on range
    let revTrendSql = '';
    const revTrendParams = [];
    if (range === 'today') {
      revTrendSql = `
        SELECT DATE_FORMAT(pay_at, '%H:00') as date, SUM(pay_amount) as total 
        FROM orders 
        WHERE status IN (${PAID_ORDER_STATUSES_SQL}) AND DATE(pay_at) = CURDATE()
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        revTrendSql += `
          AND user_id IN (
            SELECT p.user_id FROM patients p
            WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
               OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
          )
        `;
        revTrendParams.push(req.user.store_id, req.user.store_id);
      }
      revTrendSql += `
        GROUP BY DATE_FORMAT(pay_at, '%H:00') 
        ORDER BY date DESC
      `;
    } else if (range === 'week') {
      revTrendSql = `
        SELECT DATE_FORMAT(pay_at, '%Y-%m-%d') as date, SUM(pay_amount) as total 
        FROM orders 
        WHERE status IN (${PAID_ORDER_STATUSES_SQL}) AND YEARWEEK(pay_at, 1) = YEARWEEK(CURDATE(), 1)
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        revTrendSql += `
          AND user_id IN (
            SELECT p.user_id FROM patients p
            WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
               OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
          )
        `;
        revTrendParams.push(req.user.store_id, req.user.store_id);
      }
      revTrendSql += `
        GROUP BY DATE_FORMAT(pay_at, '%Y-%m-%d') 
        ORDER BY date DESC
      `;
    } else { // month
      revTrendSql = `
        SELECT DATE_FORMAT(pay_at, '%Y-%m-%d') as date, SUM(pay_amount) as total 
        FROM orders 
        WHERE status IN (${PAID_ORDER_STATUSES_SQL}) 
          AND pay_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') 
          AND pay_at < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
      `;
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        revTrendSql += `
          AND user_id IN (
            SELECT p.user_id FROM patients p
            WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
               OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
          )
        `;
        revTrendParams.push(req.user.store_id, req.user.store_id);
      }
      revTrendSql += `
        GROUP BY DATE_FORMAT(pay_at, '%Y-%m-%d') 
        ORDER BY date DESC
      `;
    }
    const revenueTrends = await query(revTrendSql, revTrendParams);

    res.json({
      code: 200,
      data: {
        range,
        periodLabel,
        totalRevenue: revenue,
        totalAppointments: appointments,
        totalPatients: newPatients,
        visitRate: visitRate + '%',
        trends: {
          appointments: apptTrendInfo,
          revenue: revenueTrendInfo,
          patients: patientTrendInfo,
          visitRate: rateTrendInfo
        },
        departments: depts,
        onlineDoctors,
        appointmentTrends: appointmentTrends.reverse(),
        revenueTrends: revenueTrends.reverse()
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ code: 500, message: '获取看板统计数据失败' });
  }
});


// ----------------------------------------
// 3. APPOINTMENTS
// ----------------------------------------
app.get('/api/admin/appointments', authenticateToken, async (req, res) => {
  const { date, tab, search, patient_id } = req.query;
  const page = req.query.page ? parseInt(req.query.page, 10) : null;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10;
  if (req.user.role === 'doctor' && !req.user.doctor_id) {
    return res.status(403).json({ code: 403, message: '医生账号未绑定医生档案，无法访问预约数据' });
  }

  // 1. Build Base Where Clause
  let baseWhere = '';
  const baseParams = [];

  if (patient_id) {
    baseWhere += ` AND a.patient_id = ?`;
    baseParams.push(patient_id);
  }

  if (date && tab !== 'today') {
    if (date.includes(',')) {
      const [start, end] = date.split(',');
      if (start && end) {
        baseWhere += ` AND a.appointment_date >= ? AND a.appointment_date <= ?`;
        baseParams.push(start, end);
      }
    } else {
      baseWhere += ` AND a.appointment_date = ?`;
      baseParams.push(date);
    }
  }

  if (req.query.year) {
    baseWhere += ` AND a.appointment_date LIKE ?`;
    baseParams.push(`${req.query.year}%`);
  }

  if (req.query.month) {
    baseWhere += ` AND a.appointment_date LIKE ?`;
    baseParams.push(`${req.query.month}%`);
  }

  if (req.query.store_name) {
    baseWhere += ` AND a.store_name = ?`;
    baseParams.push(req.query.store_name);
  }

  if (req.query.doctor_name) {
    baseWhere += ` AND a.doctor_name = ?`;
    baseParams.push(req.query.doctor_name);
  }

  if (search) {
    baseWhere += ` AND (p.name LIKE ? OR p.phone LIKE ? OR a.doctor_name LIKE ?)`;
    const searchParam = `%${search}%`;
    baseParams.push(searchParam, searchParam, searchParam);
  }

  if (req.user.role === 'doctor' && req.user.doctor_id) {
    baseWhere += ` AND a.doctor_id = ?`;
    baseParams.push(req.user.doctor_id);
  }

  if (req.user.role !== 'super_admin' && req.user.store_id) {
    baseWhere += ` AND a.store_id = ?`;
    baseParams.push(req.user.store_id);
  }

  // 2. Build Specific Where Clause for the queried list
  let listWhere = baseWhere;
  const listParams = [...baseParams];

  if (tab === 'today') {
    listWhere += ` AND a.appointment_date = CURDATE()`;
  } else if (tab === 'week') {
    listWhere += ` AND a.appointment_date >= '2026-05-25' AND a.appointment_date <= '2026-05-31'`;
  } else if (req.query.status) {
    const statusVal = req.query.status;
    if (statusVal === 'waiting') {
      listWhere += ` AND a.status IN ('confirmed', 'waiting', 'called')`;
    } else if (statusVal === 'arrived') {
      listWhere += ` AND a.status IN ('arrived', 'settled')`;
    } else {
      listWhere += ` AND a.status = ?`;
      listParams.push(statusVal);
    }
  }

  try {
    await autoUpdateExpiredAppointments();
    if (page) {
      // Query list count
      const countSql = `
        SELECT COUNT(*) as total
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${listWhere}
      `;
      const countRes = await get(countSql, listParams);
      const total = countRes ? countRes.total : 0;

      // Query status stats counts for frontend tab badges
      const statsSql = `
        SELECT a.status, COUNT(*) as count
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${baseWhere}
        GROUP BY a.status
      `;
      const statsRows = await query(statsSql, baseParams);

      // Build today params dynamically
      let todayWhere = '';
      const todayParams = [];
      if (patient_id) { todayWhere += ` AND a.patient_id = ?`; todayParams.push(patient_id); }
      if (req.query.store_name) { todayWhere += ` AND a.store_name = ?`; todayParams.push(req.query.store_name); }
      if (req.query.doctor_name) { todayWhere += ` AND a.doctor_name = ?`; todayParams.push(req.query.doctor_name); }
      if (search) {
        todayWhere += ` AND (p.name LIKE ? OR p.phone LIKE ? OR a.doctor_name LIKE ?)`;
        const searchParam = `%${search}%`;
        todayParams.push(searchParam, searchParam, searchParam);
      }
      if (req.user.role === 'doctor' && req.user.doctor_id) { todayWhere += ` AND a.doctor_id = ?`; todayParams.push(req.user.doctor_id); }
      if (req.user.role !== 'super_admin' && req.user.store_id) { todayWhere += ` AND a.store_id = ?`; todayParams.push(req.user.store_id); }

      const todayCountRes = await get(
        `SELECT COUNT(*) as total
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.appointment_date = CURDATE() ${todayWhere}`,
        todayParams
      );
      const todayCount = todayCountRes ? todayCountRes.total : 0;

      const countsMap = {
        all: 0,
        today: todayCount,
        pending_payment: 0,
        pending: 0,
        waiting: 0,
        checked_in: 0,
        completed: 0,
        arrived: 0,
        no_show: 0,
        cancelled: 0
      };
      
      statsRows.forEach(row => {
        const status = row.status;
        const count = row.count || 0;
        if (status === 'pending_payment') countsMap.pending_payment += count;
        else if (status === 'pending') countsMap.pending += count;
        else if (['confirmed', 'waiting', 'called'].includes(status)) countsMap.waiting += count;
        else if (status === 'checked_in') countsMap.checked_in += count;
        else if (status === 'completed') countsMap.completed += count;
        else if (['arrived', 'settled'].includes(status)) countsMap.arrived += count;
        else if (status === 'no_show') countsMap.no_show += count;
        else if (status === 'cancelled') countsMap.cancelled += count;
      });

      const allCountRes = await get(
        `SELECT COUNT(*) as total
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE 1=1 ${baseWhere}`,
        baseParams
      );
      countsMap.all = allCountRes ? allCountRes.total : 0;

      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT a.*, p.patient_no, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${listWhere}
        ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const list = await query(dataSql, listParams);
      const maskedList = list.map(item => ({
        ...item,
        patient_phone: maskPhone(item.patient_phone)
      }));

      res.json({
        code: 200,
        data: {
          list: maskedList,
          total,
          counts: countsMap,
          page,
          pageSize
        }
      });
    } else {
      const dataSql = `
        SELECT a.*, p.patient_no, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${listWhere}
        ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
      `;
      const list = await query(dataSql, listParams);
      const maskedList = list.map(item => ({
        ...item,
        patient_phone: maskPhone(item.patient_phone)
      }));
      res.json({ code: 200, data: maskedList });
    }
  } catch (error) {
    console.error('Failed to query appointments list:', error);
    res.status(500).json({ code: 500, message: '获取预约列表失败' });
  }
});

app.get('/api/admin/appointments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user.role === 'doctor' && !req.user.doctor_id) {
    return res.status(403).json({ code: 403, message: '医生账号未绑定医生档案，无法访问预约数据' });
  }
  try {
    await autoUpdateExpiredAppointments();
    let sql = `
      SELECT a.*, p.patient_no, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age, p.user_id as patient_user_id,
             p.medical_history as patient_medical_history, p.allergy_history as patient_allergy_history,
             u.member_level
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
    `;
    const isNo = isNaN(id) || id.startsWith('BK');
    if (isNo) {
      sql += ` WHERE a.appointment_no = ?`;
    } else {
      sql += ` WHERE a.id = ?`;
    }
    const params = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` AND a.store_id = ?`;
      params.push(req.user.store_id);
    }
    if (req.user.role === 'doctor' && req.user.doctor_id) {
      sql += ` AND a.doctor_id = ?`;
      params.push(req.user.doctor_id);
    }
    const appt = await get(sql, params);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }
    appt.patient_phone = maskPhone(appt.patient_phone);
    const preExam = await get('SELECT * FROM appointment_pre_exams WHERE appointment_id = ?', [appt.id]);
    appt.pre_exam = preExam || null;
    const latestPreExam = await get(
      `SELECT pe.* 
       FROM appointment_pre_exams pe
       JOIN appointments a ON pe.appointment_id = a.id
       WHERE a.patient_id = ?
       ORDER BY pe.id DESC LIMIT 1`,
      [appt.patient_id]
    );
    appt.latest_pre_exam = latestPreExam || null;

    const previousPreExam = await get(
      `SELECT pe.* 
       FROM appointment_pre_exams pe
       JOIN appointments a ON pe.appointment_id = a.id
       WHERE a.patient_id = ? AND a.id != ?
       ORDER BY pe.id DESC LIMIT 1`,
      [appt.patient_id, appt.id]
    );
    appt.previous_pre_exam = previousPreExam || null;

    res.json({ code: 200, data: appt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取预约详情失败' });
  }
});

app.put('/api/admin/appointments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason, store_id, doctor_id, date, period, time, symptom_desc } = req.body;

  try {
    let checkSql = `SELECT * FROM appointments`;
    const isNo = isNaN(id) || id.startsWith('BK');
    if (isNo) {
      checkSql += ` WHERE appointment_no = ?`;
    } else {
      checkSql += ` WHERE id = ?`;
    }
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += ` AND store_id = ?`;
      checkParams.push(req.user.store_id);
    }
    const appt = await get(checkSql, checkParams);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }
    if (req.user.role === 'doctor' && req.user.doctor_id && Number(appt.doctor_id) !== Number(req.user.doctor_id)) {
      return res.status(403).json({ code: 403, message: '您无权修改其他医生的预约' });
    }

    if (date || time || doctor_id || store_id) {
      const nextStoreId = Number(store_id || appt.store_id);
      const nextDoctorId = Number(doctor_id || appt.doctor_id);
      const nextDate = date || formatDate(appt.appointment_date);
      const nextTime = time || appt.appointment_time;
      const nextPeriod = period || (parseInt(String(nextTime).split(':')[0], 10) < 12 ? 'morning' : 'afternoon');
      if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== nextStoreId) {
        return res.status(403).json({ code: 403, message: '您无权改约到该门店' });
      }
      if (req.user.role === 'doctor' && req.user.doctor_id && nextDoctorId !== Number(req.user.doctor_id)) {
        return res.status(403).json({ code: 403, message: '医生账号不能将预约改约给其他医生' });
      }
      if (!await assertDoctorStoreMapping(nextDoctorId, nextStoreId)) {
        return res.status(400).json({ code: 400, message: '目标医生未绑定该门店，不能改约' });
      }

      const nextSchedule = await get(
        `SELECT * FROM doctor_schedules
         WHERE doctor_id = ? AND store_id = ? AND date = ? AND period = ?`,
        [nextDoctorId, nextStoreId, nextDate, nextPeriod]
      );
      if (!nextSchedule) {
        return res.status(400).json({ code: 400, message: '目标日期没有医生排班' });
      }
      // Allow overbooking in admin panel, bypass capacity checks
      /*
      if (nextSchedule.booked_slots >= nextSchedule.total_slots && Number(nextSchedule.id) !== Number(appt.schedule_id)) {
        return res.status(400).json({ code: 400, message: '目标号源已满' });
      }

      const conflict = await get(
        `SELECT id FROM appointments
         WHERE id != ? AND doctor_id = ? AND appointment_date = ? AND appointment_time = ?
           AND status NOT IN ('cancelled', 'no_show')`,
        [appt.id, nextDoctorId, nextDate, nextTime]
      );
      if (conflict) {
        return res.status(400).json({ code: 400, message: '目标时段已有预约' });
      }
      */

      const doctorObj = await get(`SELECT * FROM doctors WHERE id = ?`, [nextDoctorId]);
      const storeObj = await get(`SELECT * FROM stores WHERE id = ?`, [nextStoreId]);
      await transaction(async (conn) => {
        if (Number(appt.schedule_id) !== Number(nextSchedule.id)) {
          await conn.execute(
            `UPDATE doctor_schedules SET booked_slots = GREATEST(0, booked_slots - 1) WHERE id = ?`,
            [appt.schedule_id]
          );
          await conn.execute(
            `UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`,
            [nextSchedule.id]
          );
        }
        await conn.execute(
          `UPDATE appointments
           SET store_id = ?, doctor_id = ?, schedule_id = ?, appointment_date = ?, appointment_time = ?,
               status = ?, symptom_desc = COALESCE(?, symptom_desc),
               doctor_name = ?, doctor_title = ?, doctor_specialty = ?, doctor_avatar = ?, consult_fee = ?, store_name = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            nextStoreId,
            nextDoctorId,
            nextSchedule.id,
            nextDate,
            nextTime,
            status || 'pending',
            symptom_desc || null,
            doctorObj ? doctorObj.name : appt.doctor_name,
            doctorObj ? doctorObj.title : appt.doctor_title,
            doctorObj ? doctorObj.specialty : appt.doctor_specialty,
            doctorObj ? doctorObj.avatar_url : appt.doctor_avatar,
            doctorObj ? doctorObj.consult_fee : appt.consult_fee,
            storeObj ? storeObj.name : appt.store_name,
            appt.id
          ]
        );
        await conn.execute(
          `INSERT INTO user_notifications (user_id, title, content)
           VALUES (?, '预约已改期', ?)`,
          [appt.user_id, `您的预约已改至 ${nextDate} ${nextTime}，请按时到诊。`]
        );
      });
      await logAdminAction(req.user.id, 'reschedule_appointment', 'appointment', appt.id, { nextDate, nextTime, nextDoctorId, nextStoreId });
      return res.json({ code: 200, message: '预约改约成功' });
    }

    if (cancel_reason) {
      let updateSql = `UPDATE appointments SET status = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP`;
      if (isNo) {
        updateSql += ` WHERE appointment_no = ?`;
      } else {
        updateSql += ` WHERE id = ?`;
      }
      await run(updateSql, [status, cancel_reason, id]);
    } else {
      let updateSql = `UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP`;
      if (isNo) {
        updateSql += ` WHERE appointment_no = ?`;
      } else {
        updateSql += ` WHERE id = ?`;
      }
      await run(updateSql, [status, id]);
    }

    res.json({ code: 200, message: '更新预约状态成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '更新预约状态失败' });
  }
});

app.post('/api/admin/appointments', authenticateToken, async (req, res) => {
  const { patient_id, store_id, doctor_id, date, period, time, type, symptom_desc, consult_fee, deposit_amount } = req.body;
  
  if (!patient_id || !store_id || !doctor_id || !date || !time) {
    return res.status(400).json({ code: 400, message: '必填参数缺失' });
  }

  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
    return res.status(403).json({ code: 403, message: '您无权在该门店创建预约' });
  }
  if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(doctor_id))) {
    return res.status(403).json({ code: 403, message: '医生账号只能为本人创建预约' });
  }
  if (!await assertDoctorStoreMapping(doctor_id, store_id)) {
    return res.status(400).json({ code: 400, message: '所选医生未绑定该门店，不能创建预约' });
  }

  try {
    const appointment_no = `APPT${date.replace(/-/g, '')}${String(Date.now()).slice(-4)}`;
    
    const nextPeriod = period || 'morning';
    const schedule = await get(
      `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND store_id = ? AND date = ? AND period = ?`,
      [doctor_id, store_id, date, nextPeriod]
    );
    if (!schedule) {
      return res.status(400).json({ code: 400, message: '所选医生当天没有对应门店和时段排班' });
    }
    // Allow overbooking in admin panel, bypass capacity and conflict checks
    /*
    if (Number(schedule.booked_slots || 0) >= Number(schedule.total_slots || 0)) {
      return res.status(400).json({ code: 400, message: '所选时段号源已满' });
    }
    const conflict = await get(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
         AND status NOT IN ('cancelled', 'no_show')`,
      [doctor_id, date, time]
    );
    if (conflict) {
      return res.status(400).json({ code: 400, message: '该医生在所选时间已有预约' });
    }
    */

    const schedule_id = schedule.id;
    await run(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [schedule_id]);

    const patientObj = await get(`SELECT user_id FROM patients WHERE id = ?`, [patient_id]);
    const user_id = patientObj ? patientObj.user_id : 1;

    const doctorObj = await get(`SELECT * FROM doctors WHERE id = ?`, [doctor_id]);
    const storeObj = await get(`SELECT * FROM stores WHERE id = ?`, [store_id]);

    const finalConsultFee = consult_fee !== undefined ? Number(consult_fee) : (doctorObj ? doctorObj.consult_fee : 0);
    const finalDepositAmount = deposit_amount !== undefined ? Number(deposit_amount) : 0;
    
    const initialStatus = (finalConsultFee + finalDepositAmount > 0) ? 'pending_payment' : 'pending';

    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source, doctor_name, doctor_title, doctor_specialty, doctor_avatar, consult_fee, deposit_amount, store_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'walk_in', ?, ?, ?, ?, ?, ?, ?)`,
      [
        appointment_no, 
        user_id, 
        patient_id, 
        store_id, 
        doctor_id, 
        schedule_id, 
        date, 
        time, 
        type || 'first', 
        initialStatus,
        symptom_desc || '',
        doctorObj ? doctorObj.name : '',
        doctorObj ? doctorObj.title : '',
        doctorObj ? doctorObj.specialty : '',
        doctorObj ? doctorObj.avatar_url : '',
        finalConsultFee,
        finalDepositAmount,
        storeObj ? storeObj.name : ''
      ]
    );

    // Log admin action
    await logAdminAction(req.user.id, 'create_appointment', 'appointment', result.id, {
      appointment_no,
      patient_id,
      store_id,
      doctor_id,
      appointment_date: date,
      appointment_time: time
    });

    res.json({ code: 200, message: '新建预约成功', data: { appointment_no, id: result.id, status: initialStatus } });
  } catch (error) {
    console.error('Failed to create appointment:', error);
    res.status(500).json({ code: 500, message: '新建预约失败' });
  }
});



// ----------------------------------------
// 4. PATIENTS & CLINICAL FLOWS
// ----------------------------------------
app.get('/api/admin/patients', authenticateToken, async (req, res) => {
  const { search } = req.query;
  const page = req.query.page ? parseInt(req.query.page, 10) : null;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10;
  if (req.user.role === 'doctor' && !req.user.doctor_id) {
    return res.status(403).json({ code: 403, message: '医生账号未绑定医生档案，无法访问患者数据' });
  }

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause += ` AND (p.name LIKE ? OR p.phone LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam);
  }

  if (req.user.role === 'doctor' && req.user.doctor_id) {
    whereClause += ` AND (
      p.id IN (SELECT patient_id FROM appointments WHERE doctor_id = ?)
      OR p.id IN (SELECT patient_id FROM medical_records WHERE doctor_id = ?)
    )`;
    params.push(req.user.doctor_id, req.user.doctor_id);
  } else if (req.user.role !== 'super_admin' && req.user.store_id) {
    whereClause += ` AND (
      p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
      OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
    )`;
    params.push(req.user.store_id, req.user.store_id);
  }

  try {
    const appendPatientListDetails = async (list) => {
      if (!list.length) return [];

      const patientIds = list.map(item => item.id);
      const placeholders = patientIds.map(() => '?').join(',');
      const userIds = [...new Set(list.map(item => item.user_id).filter(Boolean))];
      const userPlaceholders = userIds.map(() => '?').join(',');

      const recordRows = await query(`
        SELECT mr.patient_id, mr.visit_date, mr.diagnosis, mr.prescription, d.name as doctor_name
        FROM medical_records mr
        LEFT JOIN doctors d ON mr.doctor_id = d.id
        WHERE mr.patient_id IN (${placeholders})
        ORDER BY mr.visit_date DESC, mr.id DESC
      `, patientIds);

      const recordsByPatient = recordRows.reduce((map, row) => {
        if (!map[row.patient_id]) map[row.patient_id] = [];
        if (map[row.patient_id].length < 5) {
          map[row.patient_id].push({
            date: row.visit_date instanceof Date ? row.visit_date.toISOString().slice(0, 10) : String(row.visit_date || ''),
            doctor: row.doctor_name || '',
            type: '诊疗',
            diagnosis: row.diagnosis || '',
            treatment: row.prescription || ''
          });
        }
        return map;
      }, {});

      const orderRows = await query(`
        SELECT p.id as patient_id, COALESCE(SUM(o.pay_amount), 0) as total_spent
        FROM patients p
        LEFT JOIN orders o ON o.user_id = p.user_id AND o.status IN ('paid', 'delivered', 'completed')
        WHERE p.id IN (${placeholders})
        GROUP BY p.id
      `, patientIds);
      const spentByPatient = orderRows.reduce((map, row) => {
        map[row.patient_id] = Number(row.total_spent || 0);
        return map;
      }, {});

      const familyRows = userIds.length ? await query(`
        SELECT user_id, COUNT(*) as family_count
        FROM patients
        WHERE user_id IN (${userPlaceholders})
        GROUP BY user_id
      `, userIds) : [];
      const familyCountByUser = familyRows.reduce((map, row) => {
        map[row.user_id] = Number(row.family_count || 0);
        return map;
      }, {});

      const essRows = patientIds.length ? await query(`
        SELECT id, patient_id, total_score, risk_level, created_at
        FROM ess_assessments
        WHERE patient_id IN (${placeholders})
        ORDER BY created_at DESC, id DESC
      `, patientIds) : [];
      const essByPatient = {};
      const essAbnormalByPatient = {};
      essRows.forEach(row => {
        if (row.patient_id && !essByPatient[row.patient_id]) essByPatient[row.patient_id] = row;
        if (row.risk_level && row.risk_level !== 'normal') essAbnormalByPatient[row.patient_id] = true;
      });

      const snoreRows = patientIds.length ? await query(`
        SELECT id, patient_id, apnea_events, risk_level, created_at
        FROM snore_assessments
        WHERE patient_id IN (${placeholders})
        ORDER BY created_at DESC, id DESC
      `, patientIds) : [];
      const snoreByPatient = {};
      const snoreAbnormalByPatient = {};
      snoreRows.forEach(row => {
        if (row.patient_id && !snoreByPatient[row.patient_id]) snoreByPatient[row.patient_id] = row;
        if (row.risk_level && !['normal', 'low'].includes(row.risk_level)) snoreAbnormalByPatient[row.patient_id] = true;
      });

      return list.map(item => {
        const records = recordsByPatient[item.id] || [];
        const ess = essByPatient[item.id] || null;
        const snore = snoreByPatient[item.id] || null;
        const medicalHistory = [item.medical_history, item.allergy_history]
          .filter(Boolean)
          .map(text => String(text).trim())
          .filter(Boolean);
        const tags = [];
        if (item.has_snore === 1) tags.push('有鼾症记录');

        return {
          ...item,
          patient_no: item.patient_no,
          phone: maskPhone(item.phone),
          user_phone: maskPhone(item.user_phone),
          total_spent: spentByPatient[item.id] || 0,
          last_visit: item.last_visit instanceof Date ? item.last_visit.toISOString().slice(0, 10) : item.last_visit,
          resolved_source: item.patient_source || item.latest_source || (item.openid && item.openid.startsWith('manual_') ? 'walk_in' : 'mini_app'),
          status: item.last_visit ? 'active' : 'inactive',
          tags,
          family_count: Math.max(0, (familyCountByUser[item.user_id] || 0) - 1),
          ess_result: ess ? {
            id: ess.id,
            total_score: Number(ess.total_score || 0),
            risk_level: ess.risk_level,
            created_at: ess.created_at
          } : null,
          ess_has_abnormal: Boolean(essAbnormalByPatient[item.id]),
          snore_result: snore ? {
            id: snore.id,
            apnea_events: Number(snore.apnea_events || 0),
            risk_level: snore.risk_level,
            created_at: snore.created_at
          } : null,
          snore_has_abnormal: Boolean(snoreAbnormalByPatient[item.id]),
          medical_history_list: medicalHistory,
          recent_records: records
        };
      });
    };

    if (page) {
      const countSql = `
        SELECT COUNT(*) as total
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE 1=1 ${whereClause}
      `;
      const countRes = await get(countSql, params);
      const total = countRes ? countRes.total : 0;

      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT p.*, p.source as patient_source, u.openid, u.nickname as user_nickname, u.phone as user_phone, u.member_level,
               au.name as follower_name,
               (SELECT stage FROM patient_crm_records WHERE patient_id = p.id ORDER BY id DESC LIMIT 1) as crm_stage,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status NOT IN ('cancelled', 'no_show')) as visit_count,
               (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = p.id AND status NOT IN ('cancelled', 'no_show')) as last_visit,
               (SELECT source FROM appointments WHERE patient_id = p.id ORDER BY appointment_date DESC, id DESC LIMIT 1) as latest_source
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN admin_users au ON p.follower_id = au.id
        WHERE 1=1 ${whereClause}
        ORDER BY p.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const list = await query(dataSql, params);
      const maskedList = await appendPatientListDetails(list);

      res.json({
        code: 200,
        data: {
          list: maskedList,
          pagination: {
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
          }
        }
      });
    } else {
      const dataSql = `
        SELECT p.*, p.source as patient_source, u.openid, u.nickname as user_nickname, u.phone as user_phone, u.member_level,
               au.name as follower_name,
               (SELECT stage FROM patient_crm_records WHERE patient_id = p.id ORDER BY id DESC LIMIT 1) as crm_stage,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status NOT IN ('cancelled', 'no_show')) as visit_count,
               (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = p.id AND status NOT IN ('cancelled', 'no_show')) as last_visit,
               (SELECT source FROM appointments WHERE patient_id = p.id ORDER BY appointment_date DESC, id DESC LIMIT 1) as latest_source
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN admin_users au ON p.follower_id = au.id
        WHERE 1=1 ${whereClause}
        ORDER BY p.id DESC
      `;
      const list = await query(dataSql, params);
      const maskedList = await appendPatientListDetails(list);
      res.json({ code: 200, data: maskedList });
    }
  } catch (error) {
    console.error('Failed to query patients list:', error);
    res.status(500).json({ code: 500, message: '获取患者列表失败' });
  }
});

// GET /api/admin/admin-users (List of all backend accounts)
app.get('/api/admin/admin-users', authenticateToken, async (req, res) => {
  try {
    const users = await query('SELECT id, username, name, phone FROM admin_users ORDER BY id ASC');
    res.json({ code: 200, data: users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取跟进人列表失败' });
  }
});

// PUT /api/admin/patients/:id/follower (Assign a follower)
app.put('/api/admin/patients/:id/follower', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { follower_id } = req.body;
  try {
    await run('UPDATE patients SET follower_id = ? WHERE id = ?', [follower_id || null, id]);
    res.json({ code: 200, message: '分配跟进人成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '分配跟进人失败' });
  }
});

// GET /api/admin/patients/:id/crm-records (Get CRM follow-up logs)
app.get('/api/admin/patients/:id/crm-records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const records = await query(`
      SELECT r.*, au.name as creator_name
      FROM patient_crm_records r
      JOIN admin_users au ON r.admin_user_id = au.id
      WHERE r.patient_id = ?
      ORDER BY r.id DESC
    `, [id]);
    res.json({ code: 200, data: records });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取跟进记录失败' });
  }
});

// POST /api/admin/patients/:id/crm-records (Add a CRM follow-up log)
app.post('/api/admin/patients/:id/crm-records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { content, stage } = req.body;
  if (!content || !stage) {
    return res.status(400).json({ code: 400, message: '跟进内容和阶段不能为空' });
  }
  try {
    await run(
      'INSERT INTO patient_crm_records (patient_id, admin_user_id, content, stage) VALUES (?, ?, ?, ?)',
      [id, req.user.id, content, stage]
    );
    await logAdminAction(req.user.id, 'create_crm_record', 'patient', id, { stage, contentSnippet: content.slice(0, 50) }, req.ip || null);
    res.json({ code: 200, message: '添加跟进记录成功' });
  } catch (error) {
    console.error(error);
    await logAdminAction(req.user.id, 'create_crm_record', 'patient', id, { stage }, req.ip || null, 'fail', error.message || '添加跟进记录失败');
    res.status(500).json({ code: 500, message: '添加跟进记录失败' });
  }
});

app.post('/api/admin/patients', authenticateToken, async (req, res) => {
  const { name, phone, gender, age, level, source } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ code: 400, message: '姓名和手机号为必填项' });
  }

  try {
    const existing = await get(`SELECT id FROM users WHERE phone = ?`, [phone.trim()]);
    if (existing) {
      return res.status(400).json({ code: 400, message: '登记失败：该手机号已在系统中建档登记，请勿重复创建。' });
    }

    // 1. Create a user entry
    const openid = `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const genderVal = gender === '男' ? 1 : gender === '女' ? 2 : 0;
    
    // Map member level
    const levelMap = {
      '普通': 'normal',
      'VIP': 'silver',
      'SVIP': 'diamond'
    };
    const memberLevel = levelMap[level] || 'normal';
    const sourceMap = {
      '小程序': 'mini_app',
      '分销': 'distribution',
      '转介绍': 'referral',
      '门店': 'walk_in',
      '直播': 'live'
    };
    const patientSource = sourceMap[source] || 'walk_in';

    const resultData = await transaction(async (conn) => {
      const patientNo = await generateUniquePatientNo(async (candidate) => {
        const [rows] = await conn.execute(`SELECT id FROM patients WHERE patient_no = ? LIMIT 1`, [candidate]);
        return rows.length > 0;
      });
      const [userResult] = await conn.execute(
        `INSERT INTO users (openid, nickname, phone, gender, member_level) VALUES (?, ?, ?, ?, ?)`,
        [openid, name, phone, genderVal, memberLevel]
      );

      const [patientResult] = await conn.execute(
        `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, source, has_snore) VALUES (?, ?, ?, 'self', ?, ?, ?, ?, 0)`,
        [patientNo, userResult.insertId, name, genderVal, age || null, phone, patientSource]
      );

      return {
        id: patientResult.insertId,
        patient_no: patientNo,
        name,
        phone,
        gender,
        age,
        level,
        source
      };
    });

    await logAdminAction(req.user.id, 'create_patient', 'patient', resultData.id, { name, phone: resultData.phone, source }, req.ip || null);
    res.json({
      code: 200,
      message: '手动建档成功',
      data: resultData
    });
  } catch (error) {
    console.error('Failed to create patient:', error);
    await logAdminAction(req.user.id, 'create_patient', 'patient', null, { name, phone, source }, req.ip || null, 'fail', error.message || '手动建档失败');
    if (error.message && error.message.includes('UNIQUE')) {
      res.status(400).json({ code: 400, message: '该手机号已在系统中建档' });
    } else {
      res.status(500).json({ code: 500, message: '手动建档失败' });
    }
  }
});

app.put('/api/admin/patients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, phone, gender, age, level, source, medical_history, allergy_history } = req.body || {};

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权修改该患者的信息' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ code: 400, message: '患者姓名不能为空' });
  }

  try {
    const patient = await get(
      `SELECT p.*, u.id as user_id, u.phone as user_phone, u.member_level
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [id]
    );
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }

    const cleanPhone = phone ? String(phone).trim() : null;
    if (cleanPhone) {
      const existing = await get(
        `SELECT id FROM users WHERE phone = ? AND id != ? LIMIT 1`,
        [cleanPhone, patient.user_id]
      );
      if (existing) {
        return res.status(400).json({ code: 400, message: '该手机号已被其他患者使用' });
      }
    }

    const genderVal = gender === '男' || gender === 1 ? 1 : gender === '女' || gender === 2 ? 2 : 0;
    const levelMap = {
      '普通': 'normal',
      'VIP': 'silver',
      'SVIP': 'diamond',
      normal: 'normal',
      silver: 'silver',
      gold: 'gold',
      diamond: 'diamond'
    };
    const memberLevel = levelMap[level] || patient.member_level || 'normal';

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE patients
         SET name = ?, gender = ?, age = ?, phone = ?, source = ?, medical_history = ?, allergy_history = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          String(name).trim(),
          genderVal,
          age !== undefined && age !== null && age !== '' ? Number(age) : null,
          cleanPhone,
          mapPatientSource(source),
          medical_history || null,
          allergy_history || null,
          id
        ]
      );
      await conn.execute(
        `UPDATE users SET nickname = ?, phone = ?, gender = ?, member_level = ? WHERE id = ?`,
        [String(name).trim(), cleanPhone, genderVal, memberLevel, patient.user_id]
      );
    });

    await logAdminAction(req.user.id, 'update_patient', 'patient', id, { name, phone: cleanPhone, source });
    res.json({ code: 200, message: '保存患者信息成功' });
  } catch (error) {
    console.error('Failed to update patient:', error);
    res.status(500).json({ code: 500, message: '保存患者信息失败' });
  }
});


app.get('/api/admin/patients/:id/sleep-diagnostics', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的睡眠诊断数据' });
  }
  try {
    const patient = await get('SELECT user_id FROM patients WHERE id = ?', [id]);
    if (!patient) return res.status(404).json({ code: 404, message: '患者不存在' });

    const ess = await get(
      `SELECT * FROM ess_assessments
       WHERE patient_id = ? OR (patient_id IS NULL AND user_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [id, patient.user_id]
    );
    const snore = await get(
      `SELECT * FROM snore_assessments
       WHERE patient_id = ? OR (patient_id IS NULL AND user_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [id, patient.user_id]
    );
    const wearingStats = await get(
      `SELECT COUNT(wl.id) as total_days,
              COALESCE(AVG(wl.wear_duration), 0) as avg_duration,
              COALESCE(AVG(wl.comfort), 0) as avg_comfort,
              COALESCE(AVG(wl.ahi_index), 0) as avg_ahi
       FROM treatment_records tr
       LEFT JOIN wearing_logs wl ON wl.treatment_id = tr.id AND wl.source = 'mini_program_checkin'
       WHERE tr.patient_id = ?`,
      [id]
    );

    res.json({
      code: 200,
      data: {
        ess: ess || null,
        snore: snore || null,
        wearing: wearingStats || null
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取患者睡眠诊断数据失败' });
  }
});

app.get('/api/admin/patients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的信息' });
  }

  try {
    const patient = await get(
      `SELECT p.*, u.nickname as user_nickname, u.avatar_url as user_avatar, u.phone as user_phone, u.member_level,
              au.name as follower_name,
              (SELECT stage FROM patient_crm_records WHERE patient_id = p.id ORDER BY id DESC LIMIT 1) as crm_stage,
              (
                SELECT COALESCE(d.nickname, pu.nickname, pu.phone)
                FROM distribution_relationships dr
                JOIN users pu ON dr.parent_user_id = pu.id
                LEFT JOIN distributors d ON d.user_id = pu.id
                WHERE dr.child_user_id = p.user_id
                ORDER BY dr.created_at ASC
                LIMIT 1
              ) as referrer_name
       FROM patients p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN admin_users au ON p.follower_id = au.id
       WHERE p.id = ?`,
      [id]
    );

    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }

    let appointmentsSql = `
       SELECT a.*, d.name as doctor_name, s.name as store_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN stores s ON a.store_id = s.id
       WHERE a.patient_id = ?
    `;
    const appointmentsParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      appointmentsSql += ` AND a.store_id = ?`;
      appointmentsParams.push(req.user.store_id);
    }
    if (req.user.role === 'doctor' && req.user.doctor_id) {
      appointmentsSql += ` AND a.doctor_id = ?`;
      appointmentsParams.push(req.user.doctor_id);
    }
    appointmentsSql += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC`;

    const appointments = await query(appointmentsSql, appointmentsParams);

    const totalSpentRow = await get(
      `SELECT COALESCE(SUM(pay_amount), 0) as total_spent
       FROM orders
       WHERE user_id = ? AND status IN ('paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed')`,
      [patient.user_id]
    );

    const latestMedicalRecord = await get(
      `SELECT r.*, d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, s.name as store_name
       FROM medical_records r
       JOIN doctors d ON r.doctor_id = d.id
       JOIN stores s ON r.store_id = s.id
       WHERE r.patient_id = ?
       ORDER BY r.visit_date DESC, r.id DESC
       LIMIT 1`,
      [id]
    );

    const activeTreatment = await get(
      `SELECT t.*, d.name as doctor_name
       FROM treatment_records t
       JOIN doctors d ON t.doctor_id = d.id
       WHERE t.patient_id = ? AND t.status = 'active'
       ORDER BY t.start_date DESC, t.id DESC
       LIMIT 1`,
      [id]
    );

    const nextFollowup = await get(
      `SELECT t.*, d.name as doctor_name
       FROM follow_up_tasks t
       JOIN doctors d ON t.doctor_id = d.id
       WHERE t.patient_id = ? AND t.status != 'completed'
       ORDER BY t.due_date ASC, t.id ASC
       LIMIT 1`,
      [id]
    );

    patient.phone = maskPhone(patient.phone);
    patient.user_phone = maskPhone(patient.user_phone);

    // Fetch family members with their latest ESS and Snore results
    const familyMembers = await query(
      `SELECT id, name, relation, gender, age, phone FROM patients WHERE user_id = ?`,
      [patient.user_id]
    );
    const familyMembersWithDiagnostics = [];
    for (const member of familyMembers) {
      const ess = await get(
        `SELECT total_score, risk_level, created_at FROM ess_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
        [member.id]
      );
      const snore = await get(
        `SELECT apnea_events, risk_level, created_at FROM snore_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
        [member.id]
      );
      familyMembersWithDiagnostics.push({
        id: member.id.toString(),
        name: member.name,
        relation: member.relation,
        gender: member.gender,
        age: member.age,
        phone: maskPhone(member.phone),
        ess: ess || null,
        snore: snore || null
      });
    }

    res.json({
      code: 200,
      data: {
        ...patient,
        total_spent: Number(totalSpentRow?.total_spent || 0),
        latest_medical_record: latestMedicalRecord || null,
        active_treatment: activeTreatment || null,
        next_followup: nextFollowup || null,
        appointments,
        family_members: familyMembersWithDiagnostics
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取患者详情失败' });
  }
});

app.get('/api/admin/patients/:id/phone', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!['super_admin', 'store_mgr', 'doctor'].includes(req.user.role)) {
    return res.status(403).json({ code: 403, message: '您没有权限执行手机号解密操作' });
  }

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权查看该门店患者的手机号' });
  }

  try {
    const patient = await get('SELECT name, phone FROM patients WHERE id = ?', [id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }

    // Write audit log for high-risk data access
    await logAdminAction(
      req.user.id,
      'decrypt_phone',
      'patient',
      id,
      { name: patient.name, reason: '管理员在后台查看了解密后的手机号' }
    );

    res.json({ code: 200, data: { phone: patient.phone } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '解密患者手机号失败' });
  }
});

app.get('/api/admin/patients/:id/orders', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的订单记录' });
  }

  try {
    const patient = await get('SELECT user_id FROM patients WHERE id = ?', [id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }

    const list = await query(
      `SELECT o.*, u.nickname as buyer_nickname, u.phone as buyer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [patient.user_id]
    );

    const orderIds = list.map(o => o.id);
    let allOrderItems = [];
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      allOrderItems = await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
    }
    const orderItemsMap = {};
    allOrderItems.forEach(item => {
      if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
      orderItemsMap[item.order_id].push(item);
    });

    for (const order of list) {
      order.items = orderItemsMap[order.id] || [];
      try {
        order.shipping_address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address;
      } catch (error) {
        // Keep original value if historical data is not JSON.
      }
    }

    res.json({ code: 200, data: list });
  } catch (error) {
    console.error('Failed to get patient orders:', error);
    res.status(500).json({ code: 500, message: '获取患者订单记录失败' });
  }
});

// Medical Records (病历)
app.get('/api/admin/patients/:id/medical-records', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的病历信息' });
  }

  try {
    let sql = `
       SELECT r.*, d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, s.name as store_name
       FROM medical_records r
       JOIN doctors d ON r.doctor_id = d.id
       JOIN stores s ON r.store_id = s.id
       WHERE r.patient_id = ?
    `;
    const params = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` AND r.store_id = ?`;
      params.push(req.user.store_id);
    }
    if (req.user.role === 'doctor' && req.user.doctor_id) {
      sql += ` AND r.doctor_id = ?`;
      params.push(req.user.doctor_id);
    }
    sql += ` ORDER BY r.visit_date DESC`;

    const records = await query(sql, params);
    res.json({
      code: 200,
      data: records.map(record => ({
        ...record,
        attachments: safeJsonArray(record.attachments)
      }))
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门诊病历失败' });
  }
});

app.put('/api/admin/patients/:id/medical-records/:recordId/attachments', authenticateToken, async (req, res) => {
  const { id, recordId } = req.params;
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权维护该患者的病历附件' });
  }

  try {
    const record = await get('SELECT id FROM medical_records WHERE id = ? AND patient_id = ?', [recordId, id]);
    if (!record) {
      return res.status(404).json({ code: 404, message: '病历记录不存在' });
    }

    const normalized = attachments
      .filter(item => item && item.url)
      .map(item => ({
        name: String(item.name || '病历附件').slice(0, 120),
        url: String(item.url),
        path: item.path ? String(item.path) : String(item.url),
        size: Number(item.size || 0),
        mimeType: item.mimeType ? String(item.mimeType) : '',
        uploaded_at: item.uploaded_at || new Date().toISOString()
      }));

    await run(
      `UPDATE medical_records SET attachments = ? WHERE id = ? AND patient_id = ?`,
      [JSON.stringify(normalized), recordId, id]
    );
    await logAdminAction(req.user.id, 'update_medical_record_attachments', 'medical_record', recordId, { patientId: id, count: normalized.length });
    res.json({ code: 200, message: '保存病历附件成功', data: normalized });
  } catch (error) {
    console.error('Failed to save medical record attachments:', error);
    res.status(500).json({ code: 500, message: '保存病历附件失败' });
  }
});

app.post('/api/admin/patients/:id/medical-records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note, medical_history, allergy_history } = req.body;

  if (!doctor_id || !store_id || !visit_date || !diagnosis) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（医生、门店、就诊日期、诊断结果）' });
  }

  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
    return res.status(403).json({ code: 403, message: '您无权在该门店创建病历' });
  }
  if (req.user.role === 'doctor' && req.user.doctor_id && Number(req.user.doctor_id) !== Number(doctor_id)) {
    return res.status(403).json({ code: 403, message: '医生账号只能以本人身份创建病历' });
  }

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者添加病历' });
  }

  try {
    const recordId = await transaction(async (conn) => {
      // 1. Insert record
      const [mrResult] = await conn.execute(
        `INSERT INTO medical_records (patient_id, doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, doctor_id, store_id, appointment_id || null, visit_date, diagnosis, prescription || null, doctor_advice || null, note || null]
      );
      const newRecordId = mrResult.insertId;

      // Update patient's medical history and allergy history
      await conn.execute(
        `UPDATE patients SET medical_history = ?, allergy_history = ? WHERE id = ?`,
        [medical_history || null, allergy_history || null, id]
      );

      // 2. If appointment_id is supplied, mark appointment as completed
      if (appointment_id) {
        await conn.execute(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [appointment_id]);
      }

      return newRecordId;
    });

    await logAdminAction(req.user.id, 'create_medical_record', 'medical_record', recordId, {
      patient_id: id,
      doctor_id,
      store_id,
      visit_date,
      diagnosis
    });

    res.json({ code: 200, message: '新增病历成功', data: { id: recordId } });
  } catch (error) {
    console.error('Failed to create medical record inside transaction:', error);
    res.status(500).json({ code: 500, message: '新增病历失败' });
  }
});

const getConsultationAppointment = async (id, user, medicalRecord, actionText) => {
  const appt = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
  if (!appt) {
    const error = new Error('预约不存在');
    error.statusCode = 404;
    throw error;
  }
  if (user.role !== 'super_admin' && user.store_id && Number(user.store_id) !== Number(appt.store_id)) {
    const error = new Error(`您无权${actionText}该门店预约`);
    error.statusCode = 403;
    throw error;
  }
  if (user.role === 'doctor' && user.doctor_id && Number(user.doctor_id) !== Number(appt.doctor_id)) {
    const error = new Error(`医生账号只能${actionText}自己的预约`);
    error.statusCode = 403;
    throw error;
  }
  if (!await verifyPatientAccess(appt.patient_id, user)) {
    const error = new Error('您无权操作该患者');
    error.statusCode = 403;
    throw error;
  }
  if (
    user.role === 'doctor' &&
    user.doctor_id &&
    medicalRecord.doctor_id &&
    Number(medicalRecord.doctor_id) !== Number(user.doctor_id)
  ) {
    const error = new Error(`医生账号只能以本人身份${actionText}诊疗`);
    error.statusCode = 403;
    throw error;
  }
  return appt;
};

const saveAppointmentMedicalRecord = async (conn, appt, medicalRecord) => {
  const visitDate = medicalRecord.visit_date || new Date().toISOString().split('T')[0];
  const doctorId = medicalRecord.doctor_id || appt.doctor_id;
  const storeId = medicalRecord.store_id || appt.store_id;
  const [existingRows] = await conn.execute(
    `SELECT id FROM medical_records WHERE appointment_id = ? ORDER BY id DESC LIMIT 1`,
    [appt.id]
  );

  let medicalRecordId = existingRows[0] ? existingRows[0].id : null;
  if (medicalRecordId) {
    await conn.execute(
      `UPDATE medical_records
       SET doctor_id = ?, store_id = ?, visit_date = ?, diagnosis = ?, prescription = ?, doctor_advice = ?, note = ?
       WHERE id = ?`,
      [
        doctorId,
        storeId,
        visitDate,
        medicalRecord.diagnosis,
        medicalRecord.prescription || null,
        medicalRecord.doctor_advice || null,
        medicalRecord.note || null,
        medicalRecordId
      ]
    );
  } else {
    const [mrResult] = await conn.execute(
      `INSERT INTO medical_records (patient_id, doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appt.patient_id,
        doctorId,
        storeId,
        appt.id,
        visitDate,
        medicalRecord.diagnosis,
        medicalRecord.prescription || null,
        medicalRecord.doctor_advice || null,
        medicalRecord.note || null
      ]
    );
    medicalRecordId = mrResult.insertId;
  }

  await conn.execute(
    `UPDATE patients SET medical_history = COALESCE(?, medical_history), allergy_history = COALESCE(?, allergy_history) WHERE id = ?`,
    [medicalRecord.medical_history || null, medicalRecord.allergy_history || null, appt.patient_id]
  );

  return {
    medicalRecordId,
    visitDate,
    doctorId,
    storeId
  };
};

app.post('/api/admin/appointments/:id/save-consultation', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { medical_record } = req.body;
  if (!medical_record || !medical_record.diagnosis) {
    return res.status(400).json({ code: 400, message: '诊断病历信息不能为空' });
  }

  try {
    const appt = await getConsultationAppointment(id, req.user, medical_record, '保存');
    const result = await transaction(async (conn) => saveAppointmentMedicalRecord(conn, appt, medical_record));

    await logAdminAction(req.user.id, 'save_consultation', 'appointment', id, result);
    res.json({ code: 200, message: '诊疗信息已保存', data: result });
  } catch (error) {
    console.error('Save consultation error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : '保存诊疗信息失败' });
  }
});

app.post('/api/admin/appointments/:id/complete-consultation', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { medical_record, treatment, adjustment, follow_up } = req.body;
  if (!medical_record || !medical_record.diagnosis) {
    return res.status(400).json({ code: 400, message: '诊断病历信息不能为空' });
  }

  try {
    const appt = await getConsultationAppointment(id, req.user, medical_record, '完成');

    const result = await transaction(async (conn) => {
      const { medicalRecordId, visitDate, doctorId } = await saveAppointmentMedicalRecord(conn, appt, medical_record);

      let treatmentId = treatment && treatment.treatment_id ? treatment.treatment_id : null;
      if (treatment && treatment.create) {
        const deviceProduct = treatment.device_product_id
          ? await conn.execute(
              `SELECT id, name, image_url, price, description
               FROM products
               WHERE id = ? AND category = 'device' AND status = 'on'
               LIMIT 1`,
              [treatment.device_product_id]
            )
          : null;
        const selectedDevice = deviceProduct && deviceProduct[0][0] ? deviceProduct[0][0] : null;
        if (!selectedDevice) {
          const err = new Error('请选择已上架的物理阻鼾器设备');
          err.statusCode = 400;
          throw err;
        }
        if (treatment.initial_advancement === undefined || treatment.initial_advancement === null || isNaN(treatment.initial_advancement) || treatment.initial_advancement < 0 || treatment.initial_advancement > 15) {
          const err = new Error('设备初始前伸量调节参数必须在 0 ~ 15 mm 之间');
          err.statusCode = 400;
          throw err;
        }

        await conn.execute(`UPDATE treatment_records SET status = 'paused' WHERE patient_id = ? AND status = 'active'`, [appt.patient_id]);
        const deviceSnapshot = buildTreatmentDeviceSnapshot(selectedDevice);
        const [trResult] = await conn.execute(
          `INSERT INTO treatment_records (
             patient_id, doctor_id, medical_record_id, device_product_id,
             device_product_name, device_product_image_url, device_product_price, device_product_description,
             device_model, initial_advancement, current_advancement, start_date, status
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            appt.patient_id,
            doctorId,
            medicalRecordId,
            deviceSnapshot.id,
            deviceSnapshot.name,
            deviceSnapshot.imageUrl,
            deviceSnapshot.price,
            deviceSnapshot.description,
            deviceSnapshot.name,
            treatment.initial_advancement,
            treatment.initial_advancement,
            treatment.start_date || visitDate
          ]
        );
        treatmentId = trResult.insertId;
      }

      if (adjustment && adjustment.create && treatmentId) {
        if (adjustment.adjusted_advancement === undefined || adjustment.adjusted_advancement === null || isNaN(adjustment.adjusted_advancement) || adjustment.adjusted_advancement < 0 || adjustment.adjusted_advancement > 15) {
          const err = new Error('单次设备调整量参数必须在 0 ~ 15 mm 之间');
          err.statusCode = 400;
          throw err;
        }
        await conn.execute(
          `INSERT INTO device_adjustments (treatment_id, adjust_date, operator_id, adjusted_advancement, patient_feedback, instructions)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            treatmentId,
            adjustment.adjust_date || visitDate,
            adjustment.operator_id || doctorId,
            adjustment.adjusted_advancement,
            adjustment.patient_feedback || null,
            adjustment.instructions || null
          ]
        );
        await conn.execute(
          `UPDATE treatment_records SET current_advancement = ?, next_adjust_date = ? WHERE id = ?`,
          [adjustment.adjusted_advancement, adjustment.next_adjust_date || null, treatmentId]
        );
      }

      if (follow_up && follow_up.create && follow_up.due_date) {
        await conn.execute(
          `INSERT INTO follow_up_tasks (patient_id, doctor_id, title, description, due_date, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [
            appt.patient_id,
            follow_up.doctor_id || doctorId,
            follow_up.title,
            follow_up.description || '',
            follow_up.due_date
          ]
        );
      }

      await conn.execute(`UPDATE appointments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [appt.id]);
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '就诊已完成', ?)`,
        [appt.user_id, `您 ${formatDate(appt.appointment_date)} 的门诊就诊已完成，病历和医嘱已同步。`]
      );

      return { medicalRecordId, treatmentId };
    });

    await logAdminAction(req.user.id, 'complete_consultation', 'appointment', id, result);
    res.json({ code: 200, message: '接诊已完成', data: result });
  } catch (error) {
    console.error('Complete consultation error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : '结束接诊失败' });
  }
});

app.post('/api/admin/appointments/:id/postpone', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const appt = await get('SELECT id, doctor_id, appointment_date FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }

    const maxPostponeRes = await get(
      `SELECT MAX(postpone_count) as max_val FROM appointments 
       WHERE doctor_id = ? AND appointment_date = ?`,
      [appt.doctor_id, appt.appointment_date]
    );
    const newPostponeCount = (maxPostponeRes && maxPostponeRes.max_val ? maxPostponeRes.max_val : 0) + 1;

    await query('UPDATE appointments SET postpone_count = ? WHERE id = ?', [newPostponeCount, id]);
    res.json({ code: 200, message: '顺延成功', data: { postpone_count: newPostponeCount } });
  } catch (error) {
    console.error('Failed to postpone appointment:', error);
    res.status(500).json({ code: 500, message: '顺延失败' });
  }
});

// Sleep Assessments (睡眠与鼾声评估详情)
app.get('/api/admin/assessments/ess/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const ess = await get('SELECT * FROM ess_assessments WHERE id = ?', [id]);
    if (!ess) return res.status(404).json({ code: 404, message: 'ESS评估记录不存在' });
    
    if (!await verifyUserAccess(ess.user_id, req.user)) {
      return res.status(403).json({ code: 403, message: '您无权访问该评估记录' });
    }

    res.json({ code: 200, data: ess });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取ESS评估详情失败' });
  }
});

app.get('/api/admin/assessments/snore/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const snore = await get('SELECT * FROM snore_assessments WHERE id = ?', [id]);
    if (!snore) return res.status(404).json({ code: 404, message: '鼾声评估记录不存在' });
    
    if (!await verifyUserAccess(snore.user_id, req.user)) {
      return res.status(403).json({ code: 403, message: '您无权访问该评估记录' });
    }

    res.json({ code: 200, data: snore });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取鼾声评估详情失败' });
  }
});

// Treatment Records (治疗建档 & 随访数据)
app.get('/api/admin/patients/:id/treatment', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的治疗建档信息' });
  }

  try {
    const tr = await get(
      `SELECT t.*, d.name as doctor_name
       FROM treatment_records t
       JOIN doctors d ON t.doctor_id = d.id
       WHERE t.patient_id = ? AND t.status = 'active'`,
      [id]
    );

    if (!tr) {
      return res.json({ code: 200, data: null });
    }

    // Fetch wearing logs
    const logs = await query(
      `SELECT * FROM wearing_logs WHERE treatment_id = ? AND source = 'mini_program_checkin' ORDER BY date DESC LIMIT 30`,
      [tr.id]
    );

    // Fetch device adjustments
    const adjustments = await query(
      `SELECT a.*, d.name as operator_name 
       FROM device_adjustments a
       JOIN doctors d ON a.operator_id = d.id
       WHERE a.treatment_id = ? 
       ORDER BY a.adjust_date DESC`,
      [tr.id]
    );

    res.json({
      code: 200,
      data: {
        ...tr,
        device: tr.device_product_id ? {
          id: String(tr.device_product_id),
          name: tr.device_product_name || tr.device_model,
          image_url: tr.device_product_image_url || '',
          price: Number(tr.device_product_price || 0),
          description: tr.device_product_description || ''
        } : null,
        logs,
        adjustments
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取阻鼾器治疗建档信息失败' });
  }
});

app.post('/api/admin/patients/:id/treatment', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctor_id, device_product_id, initial_advancement, start_date } = req.body;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者进行治疗建档' });
  }
  if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(doctor_id))) {
    return res.status(403).json({ code: 403, message: '医生账号只能以本人身份治疗建档' });
  }
  if (!device_product_id) {
    return res.status(400).json({ code: 400, message: '请选择已上架的物理阻鼾器设备' });
  }

  try {
    // Deactivate previous active treatments
    const deviceProduct = await get(
      `SELECT id, name, image_url, price, description
       FROM products
       WHERE id = ? AND category = 'device' AND status = 'on'
       LIMIT 1`,
      [device_product_id]
    );
    if (!deviceProduct) {
      return res.status(400).json({ code: 400, message: '请选择已上架的物理阻鼾器设备' });
    }

    await run(`UPDATE treatment_records SET status = 'paused' WHERE patient_id = ? AND status = 'active'`, [id]);

    const deviceSnapshot = buildTreatmentDeviceSnapshot(deviceProduct);
    const result = await run(
      `INSERT INTO treatment_records (
         patient_id, doctor_id, device_product_id,
         device_product_name, device_product_image_url, device_product_price, device_product_description,
         device_model, initial_advancement, current_advancement, start_date, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id,
        doctor_id,
        deviceSnapshot.id,
        deviceSnapshot.name,
        deviceSnapshot.imageUrl,
        deviceSnapshot.price,
        deviceSnapshot.description,
        deviceSnapshot.name,
        initial_advancement,
        initial_advancement,
        start_date
      ]
    );

    res.json({ code: 200, message: '治疗建档成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '治疗建档失败' });
  }
});

// Device Adjustments (参数微调)
app.post('/api/admin/patients/:id/treatment/adjustments', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { treatment_id, adjust_date, operator_id, adjusted_advancement, patient_feedback, instructions, next_adjust_date } = req.body;

  if (!treatment_id || !adjust_date || !operator_id || adjusted_advancement === undefined) {
    return res.status(400).json({ code: 400, message: '参数微调必填项缺失' });
  }

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者添加微调记录' });
  }
  if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(operator_id))) {
    return res.status(403).json({ code: 403, message: '医生账号只能以本人身份添加微调记录' });
  }

  try {
    // 1. Add adjustment record
    const result = await run(
      `INSERT INTO device_adjustments (treatment_id, adjust_date, operator_id, adjusted_advancement, patient_feedback, instructions)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [treatment_id, adjust_date, operator_id, adjusted_advancement, patient_feedback || null, instructions || null]
    );

    // 2. Update current advancement and next adjust date in treatment master table
    await run(
      `UPDATE treatment_records 
       SET current_advancement = ?, next_adjust_date = ? 
       WHERE id = ?`,
      [adjusted_advancement, next_adjust_date || null, treatment_id]
    );

    // Log admin action
    await logAdminAction(req.user.id, 'create_device_adjustment', 'device_adjustment', result.id, {
      treatment_id,
      operator_id,
      adjusted_advancement,
      adjust_date
    });

    res.json({ code: 200, message: '添加参数微调成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加参数微调失败' });
  }
});

// Follow Up Tasks (随访工作流)
app.get('/api/admin/patients/:id/follow-ups', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的随访记录' });
  }

  try {
    const tasks = await query(
      `SELECT t.*, d.name as doctor_name 
       FROM follow_up_tasks t
       JOIN doctors d ON t.doctor_id = d.id
       WHERE t.patient_id = ?
       ORDER BY t.due_date DESC`,
      [id]
    );

    const taskIds = tasks.map(t => t.id);
    let records = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      records = await query(
        `SELECT r.*, d.name as doctor_name 
         FROM follow_up_records r
         JOIN doctors d ON r.doctor_id = d.id
         WHERE r.task_id IN (${placeholders})
         ORDER BY r.created_at DESC`,
        taskIds
      );
    }

    res.json({ code: 200, data: { tasks, records } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取随访记录失败' });
  }
});

app.post('/api/admin/patients/:id/follow-ups', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctor_id, title, description, due_date } = req.body;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者创建随访任务' });
  }
  if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(doctor_id))) {
    return res.status(403).json({ code: 403, message: '医生账号只能以本人身份创建随访任务' });
  }

  try {
    const result = await run(
      `INSERT INTO follow_up_tasks (patient_id, doctor_id, title, description, due_date, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [id, doctor_id, title, description || null, due_date]
    );
    res.json({ code: 200, message: '创建随访任务成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建随访任务失败' });
  }
});

app.post('/api/admin/patients/:id/follow-ups/records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { task_id, doctor_id, contact_type, summary } = req.body;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者保存随访沟通记录' });
  }
  if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(doctor_id))) {
    return res.status(403).json({ code: 403, message: '医生账号只能以本人身份保存随访记录' });
  }

  try {
    await run(
      `INSERT INTO follow_up_records (task_id, patient_id, doctor_id, contact_type, summary)
       VALUES (?, ?, ?, ?, ?)`,
      [task_id, id, doctor_id, contact_type, summary]
    );
    
    // Complete the task
    await run(`UPDATE follow_up_tasks SET status = 'completed' WHERE id = ?`, [task_id]);

    res.json({ code: 200, message: '记录随访内容并完成任务成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存随访沟通记录失败' });
  }
});

app.put('/api/admin/patients/:id/follow-ups/:taskId', authenticateToken, async (req, res) => {
  const { id, taskId } = req.params;
  const { due_date, status, description, title, doctor_id } = req.body;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权修改该患者的随访任务' });
  }

  const task = await get(`SELECT * FROM follow_up_tasks WHERE id = ? AND patient_id = ?`, [taskId, id]);
  if (!task) {
    return res.status(404).json({ code: 404, message: '随访任务不存在' });
  }
  if (task.status === 'completed' && status !== 'completed') {
    return res.status(400).json({ code: 400, message: '已完成随访不能回退状态' });
  }
  if (req.user.role === 'doctor' && req.user.doctor_id) {
    const nextDoctorId = doctor_id ?? task.doctor_id;
    if (Number(nextDoctorId) !== Number(req.user.doctor_id)) {
      return res.status(403).json({ code: 403, message: '医生账号只能维护自己的随访任务' });
    }
  }

  try {
    await run(
      `UPDATE follow_up_tasks
       SET title = ?, description = ?, due_date = ?, status = ?, doctor_id = ?
       WHERE id = ? AND patient_id = ?`,
      [
        title ?? task.title,
        description ?? task.description,
        due_date ?? task.due_date,
        status ?? task.status,
        doctor_id ?? task.doctor_id,
        taskId,
        id
      ]
    );
    await logAdminAction(req.user.id, 'update_follow_up', 'follow_up_task', taskId, { patientId: id, status, due_date });
    res.json({ code: 200, message: '更新随访任务成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新随访任务失败' });
  }
});

// ----------------------------------------
// 5. DOCTORS & SCHEDULES
// ----------------------------------------
async function getDoctorStoreRows(doctorIds) {
  if (!doctorIds.length) return {};
  const placeholders = doctorIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT m.doctor_id, s.id as store_id, s.name as store_name
     FROM doctor_store_mapping m
     JOIN stores s ON m.store_id = s.id
     WHERE m.doctor_id IN (${placeholders})
     ORDER BY s.id ASC`,
    doctorIds
  );
  return rows.reduce((acc, row) => {
    if (!acc[row.doctor_id]) acc[row.doctor_id] = [];
    acc[row.doctor_id].push(row);
    return acc;
  }, {});
}

async function normalizeDoctorStoreIds(storeIds, user) {
  const ids = Array.isArray(storeIds)
    ? storeIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
    : [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    throw new Error('请至少选择一个就诊门店');
  }
  if (user.role !== 'super_admin' && user.store_id) {
    if (uniqueIds.length !== 1 || Number(uniqueIds[0]) !== Number(user.store_id)) {
      throw new Error('您无权维护其他门店的医生');
    }
  }
  const placeholders = uniqueIds.map(() => '?').join(',');
  const stores = await query(`SELECT id FROM stores WHERE id IN (${placeholders})`, uniqueIds);
  if (stores.length !== uniqueIds.length) {
    throw new Error('选择的就诊门店不存在');
  }
  return uniqueIds;
}

async function assertDoctorStoreMapping(doctorId, storeId) {
  const mapping = await get(
    `SELECT id FROM doctor_store_mapping WHERE doctor_id = ? AND store_id = ? LIMIT 1`,
    [doctorId, storeId]
  );
  return Boolean(mapping);
}

app.get('/api/admin/doctors', authenticateToken, async (req, res) => {
  const { store_id } = req.query;
  if (req.user.role === 'doctor' && !req.user.doctor_id) {
    return res.status(403).json({ code: 403, message: '医生账号未绑定医生档案，无法访问医生数据' });
  }
  try {
    let sql = `
      SELECT d.*, au.id as admin_user_id, au.username as admin_username, au.status as admin_status
      FROM doctors d
      LEFT JOIN admin_users au ON au.doctor_id = d.id
    `;
    const params = [];
    const whereClauses = [];

    if (store_id && store_id !== 'all') {
      whereClauses.push(`d.id IN (SELECT doctor_id FROM doctor_store_mapping WHERE store_id = ?)`);
      params.push(store_id);
    } else if (req.user.role === 'doctor' && req.user.doctor_id) {
      whereClauses.push(`d.id = ?`);
      params.push(req.user.doctor_id);
    } else if (req.user.role !== 'super_admin' && req.user.store_id) {
      whereClauses.push(`d.id IN (SELECT doctor_id FROM doctor_store_mapping WHERE store_id = ?)`);
      params.push(req.user.store_id);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ` + whereClauses.join(' AND ');
    }

    sql += ` ORDER BY d.id ASC`;
    const list = await query(sql, params);
    const storeMap = await getDoctorStoreRows(list.map(d => d.id));
    const formatted = [];
    for (const d of list) {
      let consultSql = `SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND status = 'completed'`;
      const consultParams = [d.id];
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        consultSql += ` AND store_id = ?`;
        consultParams.push(req.user.store_id);
      }
      const consultRow = await get(consultSql, consultParams);
      const consultCount = consultRow ? consultRow.count : 0;
      
      let reviewSql = `
         SELECT COUNT(*) as count, AVG(rating) as avg_rating 
         FROM appointment_evaluations 
         WHERE doctor_id = ?
      `;
      const reviewParams = [d.id];
      if (req.user.role !== 'super_admin' && req.user.store_id) {
        reviewSql += ` AND appointment_id IN (SELECT id FROM appointments WHERE store_id = ?)`;
        reviewParams.push(req.user.store_id);
      }
      const reviewRow = await get(reviewSql, reviewParams);
      const reviewCount = reviewRow ? reviewRow.count : 0;
      const goodReviewRow = await get(
        `${reviewSql.replace('COUNT(*) as count, AVG(rating) as avg_rating', 'COUNT(*) as count')} AND rating >= 4`,
        reviewParams
      );
      const goodReviewCount = goodReviewRow ? goodReviewRow.count : 0;
      let rating = 5.0;
      if (reviewRow && reviewRow.avg_rating !== null) {
        rating = Math.round(Number(reviewRow.avg_rating) * 10) / 10;
      }
      const storeRows = storeMap[d.id] || [];

      formatted.push({
        ...d,
        consult_count: consultCount,
        review_count: reviewCount,
        rating: rating,
        positive_rate: reviewCount > 0 ? Math.round((goodReviewCount / reviewCount) * 100) : null,
        store_ids: storeRows.map(row => row.store_id),
        store_names: storeRows.map(row => row.store_name)
      });
    }
    res.json({ code: 200, data: formatted });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取医生列表失败' });
  }
});

app.post('/api/admin/doctors', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可执行此操作' });
  }
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise, experience_years, experienceYears, avatar_url, store_ids } = req.body;
  if (!name || !title || !specialty) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（姓名、职称、科室）' });
  }

  const expYears = experience_years !== undefined ? Number(experience_years) : (experienceYears !== undefined ? Number(experienceYears) : 0);

  try {
    const normalizedStoreIds = await normalizeDoctorStoreIds(store_ids, req.user);
    const resultId = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO doctors (name, title, specialty, hospital, intro, consult_fee, status, avatar_url, expertise, experience_years)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, avatar_url || null, expertise ? JSON.stringify(expertise) : null, expYears]
      );
      for (const storeId of normalizedStoreIds) {
        await conn.execute(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [result.insertId, storeId]);
      }
      return result.insertId;
    });
    await logAdminAction(req.user.id, 'create_doctor', 'doctor', resultId, { name, title, specialty }, req.ip || null);
    res.json({ code: 200, message: '添加医生成功', data: { id: resultId } });
  } catch (error) {
    await logAdminAction(req.user.id, 'create_doctor', 'doctor', null, { name, title, specialty }, req.ip || null, 'fail', error.message || '添加医生失败');
    res.status(400).json({ code: 400, message: error.message || '添加医生失败' });
  }
});

app.put('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可执行此操作' });
  }
  const { id } = req.params;
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise, experience_years, experienceYears, avatar_url, store_ids } = req.body;

  const expYears = experience_years !== undefined ? Number(experience_years) : (experienceYears !== undefined ? Number(experienceYears) : 0);

  try {
    const normalizedStoreIds = await normalizeDoctorStoreIds(store_ids, req.user);
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE doctors
         SET name = ?, title = ?, specialty = ?, hospital = ?, intro = ?, consult_fee = ?, status = ?, avatar_url = ?, expertise = ?, experience_years = ?
         WHERE id = ?`,
        [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, avatar_url || null, expertise ? JSON.stringify(expertise) : null, expYears, id]
      );
      await conn.execute(`DELETE FROM doctor_store_mapping WHERE doctor_id = ?`, [id]);
      for (const storeId of normalizedStoreIds) {
        await conn.execute(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [id, storeId]);
      }
    });
    await logAdminAction(req.user.id, 'update_doctor', 'doctor', id, { name, title, specialty, status }, req.ip || null);
    res.json({ code: 200, message: '编辑医生成功' });
  } catch (error) {
    await logAdminAction(req.user.id, 'update_doctor', 'doctor', id, { name, title, specialty, status }, req.ip || null, 'fail', error.message || '编辑医生失败');
    res.status(400).json({ code: 400, message: error.message || '编辑医生失败' });
  }
});

app.delete('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可执行此操作' });
  }
  const { id } = req.params;
  try {
    const doctor = await get(`SELECT * FROM doctors WHERE id = ?`, [id]);
    if (!doctor) {
      return res.status(404).json({ code: 404, message: '医生不存在' });
    }
    await run(`UPDATE doctors SET status = 0 WHERE id = ?`, [id]);
    
    if (doctor) {
      await logAdminAction(req.user.id, 'disable_doctor', 'doctor', id, { name: doctor.name, title: doctor.title });
    }
    
    res.json({ code: 200, message: '医生已停用' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '停用医生失败' });
  }
});

// Schedules
app.get('/api/admin/schedules', authenticateToken, async (req, res) => {
  const { date, doctor_id } = req.query; // Expecting YYYY-MM-DD, YYYY-MM or week dates
  if (req.user.role === 'doctor' && !req.user.doctor_id) {
    return res.status(403).json({ code: 403, message: '医生账号未绑定医生档案，无法访问排班数据' });
  }
  try {
    let sql = `
      SELECT s.*, d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, st.name as store_name
           , COALESCE(b.booked_count, 0) as booked_count
      FROM doctor_schedules s
      JOIN doctors d ON s.doctor_id = d.id
      JOIN stores st ON s.store_id = st.id
      LEFT JOIN (
        SELECT schedule_id, COUNT(*) as booked_count
        FROM appointments
        WHERE status NOT IN ('cancelled', 'no_show')
        GROUP BY schedule_id
      ) b ON b.schedule_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (date) {
      if (date.length === 7) {
        sql += ` AND s.date LIKE ?`;
        params.push(`${date}%`);
      } else {
        sql += ` AND s.date = ?`;
        params.push(date);
      }
    }
    if (doctor_id) {
      sql += ` AND s.doctor_id = ?`;
      params.push(doctor_id);
    }
    if (req.user.role === 'doctor' && req.user.doctor_id) {
      sql += ` AND s.doctor_id = ?`;
      params.push(req.user.doctor_id);
    }
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` AND s.store_id = ?`;
      params.push(req.user.store_id);
    }
    const list = await query(sql, params);
    const formattedList = list.map(item => ({
      ...item,
      date: item.date instanceof Date ? 
        `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}-${String(item.date.getDate()).padStart(2, '0')}` : 
        String(item.date).slice(0, 10),
      capacity: Number(item.total_slots || 0) * Number(item.people_per_slot || 1),
      available_capacity: Math.max(0, Number(item.total_slots || 0) * Number(item.people_per_slot || 1) - Number(item.booked_count || 0))
    }));
    res.json({ code: 200, data: formattedList });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班列表失败' });
  }
});

app.post('/api/admin/schedules', authenticateToken, async (req, res) => {
  const { doctor_id, store_id, date, period, start_time, end_time, total_slots, people_per_slot, is_rest } = req.body;
  if (!doctor_id || !date || !period) {
    return res.status(400).json({ code: 400, message: '排班参数不足' });
  }

  if (!is_rest && !store_id) {
    return res.status(400).json({ code: 400, message: '非休息排班必须选择门店' });
  }

  if (!is_rest && req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
    return res.status(403).json({ code: 403, message: '您无权为其他门店排班' });
  }
    if (req.user.role === 'doctor' && req.user.doctor_id && Number(req.user.doctor_id) !== Number(doctor_id)) {
      return res.status(403).json({ code: 403, message: '医生账号只能维护自己的排班' });
    }
    if (!is_rest && !await assertDoctorStoreMapping(doctor_id, store_id)) {
      return res.status(400).json({ code: 400, message: '该医生未绑定所选门店，不能排班' });
    }

    try {
    const existing = await get(
      `SELECT id FROM doctor_schedules WHERE doctor_id = ? AND date = ? AND period = ?`,
      [doctor_id, date, period]
    );

    if (is_rest) {
      if (existing) {
        const booked = await get(
          `SELECT COUNT(*) as count FROM appointments WHERE schedule_id = ? AND status NOT IN ('cancelled', 'no_show')`,
          [existing.id]
        );
        if (booked && booked.count > 0) {
          return res.status(400).json({ code: 400, message: `${date} ${period === 'morning' ? '上午' : '下午'}已有预约，不能设置为休息` });
        }
        await run(`DELETE FROM doctor_schedules WHERE id = ?`, [existing.id]);
      }
      await logAdminAction(req.user.id, 'create_schedule', 'doctor', doctor_id, { date, period, is_rest: true }, req.ip || null);
      return res.json({ code: 200, message: '设置休息成功' });
    }

    if (existing) {
      const booked = await get(
        `SELECT COUNT(*) as count FROM appointments WHERE schedule_id = ? AND status NOT IN ('cancelled', 'no_show')`,
        [existing.id]
      );
      const bookedCount = booked ? booked.count : 0;
      const proposedTotal = (total_slots || 6) * (people_per_slot || 1);
      if (bookedCount > proposedTotal) {
        return res.status(400).json({ code: 400, message: `${date} ${period === 'morning' ? '上午' : '下午'}已有较多预约（已约 ${bookedCount} 人），新设置的总号源数（${proposedTotal} 人）不足` });
      }

      await run(
        `UPDATE doctor_schedules SET store_id = ?, start_time = ?, end_time = ?, total_slots = ?, people_per_slot = ? WHERE id = ?`,
        [store_id, start_time || '09:00:00', end_time || '12:00:00', total_slots || 6, people_per_slot || 1, existing.id]
      );
    } else {
      await run(
        `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, people_per_slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [doctor_id, store_id, date, period, start_time || '09:00:00', end_time || '12:00:00', total_slots || 6, people_per_slot || 1]
      );
    }
    await logAdminAction(req.user.id, 'create_schedule', 'doctor', doctor_id, { date, period, is_rest: false, store_id }, req.ip || null);
    res.json({ code: 200, message: '设置排班成功' });
  } catch (error) {
    await logAdminAction(req.user.id, 'create_schedule', 'doctor', doctor_id, { date, period, is_rest: !!is_rest }, req.ip || null, 'fail', error.message || '设置排班失败');
    res.status(500).json({ code: 500, message: '设置排班失败' });
  }
});

app.post('/api/admin/schedules/batch', authenticateToken, async (req, res) => {
  const { doctor_id, list } = req.body;
  if (!doctor_id || !Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ code: 400, message: '排班参数不足' });
  }
  if (req.user.role === 'doctor' && req.user.doctor_id && Number(req.user.doctor_id) !== Number(doctor_id)) {
    return res.status(403).json({ code: 403, message: '医生账号只能维护自己的排班' });
  }

  try {
    const monthStr = list[0].date.slice(0, 7); // e.g. "2026-06"
    
    await transaction(async (conn) => {
      // 1. Fetch all existing schedules for this doctor in this month in one query
      const [existingRows] = await conn.execute(
        `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND date LIKE ?`,
        [doctor_id, `${monthStr}%`]
      );
      
      const existingMap = {};
      existingRows.forEach(row => {
        const dateStr = row.date instanceof Date ? 
          `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}` : 
          String(row.date).slice(0, 10);
        existingMap[`${dateStr}_${row.period}`] = row;
      });

      // 2. Fetch all active booked appointment counts for this doctor in this month in one query
      const [bookedRows] = await conn.execute(
        `SELECT schedule_id, COUNT(*) as count 
         FROM appointments 
         WHERE doctor_id = ? AND appointment_date LIKE ? AND status NOT IN ('cancelled', 'no_show')
         GROUP BY schedule_id`,
        [doctor_id, `${monthStr}%`]
      );
      
      const bookedMap = {};
      bookedRows.forEach(row => {
        bookedMap[row.schedule_id] = row.count;
      });

      const idsToDelete = [];
      const inserts = [];
      const updates = [];

      // 3. Process differences in memory
      for (const item of list) {
        const { store_id, date, period, start_time, end_time, total_slots, people_per_slot, is_rest } = item;
        if (!date || !period) {
          throw new Error('排班日期与时段不能为空');
        }

        const key = `${date}_${period}`;
        const existing = existingMap[key];

        if (is_rest) {
          if (existing) {
            const bookedCount = bookedMap[existing.id] || 0;
            if (bookedCount > 0) {
              throw new Error(`${date} ${period === 'morning' ? '上午' : '下午'}已有预约，不能设置为休息`);
            }
            idsToDelete.push(existing.id);
          }
        } else {
          if (!store_id) {
            throw new Error('非休息排班必须选择门店');
          }
          const canScheduleStore = await get(
            `SELECT id FROM doctor_store_mapping WHERE doctor_id = ? AND store_id = ? LIMIT 1`,
            [doctor_id, store_id]
          );
          if (!canScheduleStore) {
            throw new Error(`${date} ${period === 'morning' ? '上午' : '下午'}：该医生未绑定所选门店，不能排班`);
          }

          if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
            throw new Error('您无权为其他门店排班');
          }

          const targetStartTime = start_time || '09:00:00';
          const targetEndTime = end_time || (period === 'morning' ? '12:00:00' : '18:00:00');
          const targetTotalSlots = total_slots || 6;
          const targetPeoplePerSlot = people_per_slot || 1;

          if (existing) {
            // Check if values have actually changed
            const existingStartTime = String(existing.start_time).slice(0, 8);
            const existingEndTime = String(existing.end_time).slice(0, 8);
            const hasChanged = 
              Number(existing.store_id) !== Number(store_id) ||
              existingStartTime !== targetStartTime ||
              existingEndTime !== targetEndTime ||
              Number(existing.total_slots) !== Number(targetTotalSlots) ||
              Number(existing.people_per_slot) !== Number(targetPeoplePerSlot);

            if (hasChanged) {
              const bookedCount = bookedMap[existing.id] || 0;
              const proposedTotal = Number(targetTotalSlots) * Number(targetPeoplePerSlot);
              if (bookedCount > proposedTotal) {
                throw new Error(`${date} ${period === 'morning' ? '上午' : '下午'}已有较多预约（已约 ${bookedCount} 人），新设置的总号源数（${proposedTotal} 人）不足`);
              }

              updates.push({
                id: existing.id,
                store_id,
                start_time: targetStartTime,
                end_time: targetEndTime,
                total_slots: targetTotalSlots,
                people_per_slot: targetPeoplePerSlot
              });
            }
          } else {
            // Collect new schedules to insert
            inserts.push([
              doctor_id,
              store_id,
              date,
              period,
              targetStartTime,
              targetEndTime,
              targetTotalSlots,
              targetPeoplePerSlot
            ]);
          }
        }
      }

      // 4. Perform database operations in batches
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        await conn.execute(
          `DELETE FROM doctor_schedules WHERE id IN (${placeholders})`,
          idsToDelete
        );
      }

      if (inserts.length > 0) {
        const placeholders = inserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const flatValues = inserts.reduce((acc, val) => acc.concat(val), []);
        await conn.execute(
          `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, people_per_slot)
           VALUES ${placeholders}`,
          flatValues
        );
      }

      for (const val of updates) {
        await conn.execute(
          `UPDATE doctor_schedules SET store_id = ?, start_time = ?, end_time = ?, total_slots = ?, people_per_slot = ? WHERE id = ?`,
          [val.store_id, val.start_time, val.end_time, val.total_slots, val.people_per_slot, val.id]
        );
      }
    });

    await logAdminAction(req.user.id, 'batch_create_schedule', 'doctor', doctor_id, { count: list.length, dates: list.map(x => x.date) }, req.ip || null);
    res.json({ code: 200, message: '批量保存排班成功' });
  } catch (error) {
    console.error('Batch schedule save error:', error);
    await logAdminAction(req.user.id, 'batch_create_schedule', 'doctor', doctor_id, { count: list ? list.length : 0 }, req.ip || null, 'fail', error.message || '批量保存排班失败');
    res.status(400).json({ code: 400, message: error.message || '批量保存排班失败' });
  }
});

app.post('/api/admin/schedules/copy-last-month', authenticateToken, async (req, res) => {
  const { doctor_id, year, month } = req.body;
  if (!doctor_id || !year || !month) {
    return res.status(400).json({ code: 400, message: '医生和目标月份为必填项' });
  }
  if (req.user.role === 'doctor' && req.user.doctor_id && Number(req.user.doctor_id) !== Number(doctor_id)) {
    return res.status(403).json({ code: 403, message: '医生账号只能复制自己的排班' });
  }

  const targetMonth = String(month).padStart(2, '0');
  const targetPrefix = `${year}-${targetMonth}`;
  const previousDate = new Date(Number(year), Number(month) - 2, 1);
  const previousYear = previousDate.getFullYear();
  const previousMonth = String(previousDate.getMonth() + 1).padStart(2, '0');
  const previousPrefix = `${previousYear}-${previousMonth}`;

  try {
    const copied = await transaction(async (conn) => {
      const [sourceRows] = await conn.execute(
        `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND date LIKE ? ORDER BY date ASC`,
        [doctor_id, `${previousPrefix}%`]
      );
      if (sourceRows.length === 0) {
        throw new Error('上月没有可复制的排班');
      }

      const [existingRows] = await conn.execute(
        `SELECT s.id, s.date, s.period, COUNT(a.id) as booked_count
         FROM doctor_schedules s
         LEFT JOIN appointments a ON a.schedule_id = s.id AND a.status NOT IN ('cancelled', 'no_show')
         WHERE s.doctor_id = ? AND s.date LIKE ?
         GROUP BY s.id`,
        [doctor_id, `${targetPrefix}%`]
      );
      const existingMap = {};
      existingRows.forEach(row => {
        const dateStr = row.date instanceof Date
          ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
          : String(row.date).slice(0, 10);
        existingMap[`${dateStr}_${row.period}`] = row;
      });

      let count = 0;
      for (const row of sourceRows) {
        const sourceDate = row.date instanceof Date
          ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
          : String(row.date).slice(0, 10);
        const day = sourceDate.slice(8, 10);
        const targetDate = `${targetPrefix}-${day}`;
        if (targetDate.slice(0, 7) !== targetPrefix) continue;

        if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(row.store_id)) {
          continue;
        }

        const existing = existingMap[`${targetDate}_${row.period}`];
        if (existing && Number(existing.booked_count || 0) > 0) {
          continue;
        }

        if (existing) {
          await conn.execute(
            `UPDATE doctor_schedules
             SET store_id = ?, start_time = ?, end_time = ?, total_slots = ?, people_per_slot = ?
             WHERE id = ?`,
            [row.store_id, row.start_time, row.end_time, row.total_slots, row.people_per_slot, existing.id]
          );
        } else {
          await conn.execute(
            `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, people_per_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [doctor_id, row.store_id, targetDate, row.period, row.start_time, row.end_time, row.total_slots, row.people_per_slot]
          );
        }
        count += 1;
      }
      return count;
    });
    await logAdminAction(req.user.id, 'copy_last_month_schedule', 'doctor', doctor_id, { targetPrefix, copied });
    res.json({ code: 200, message: `已复制 ${copied} 条上月排班`, data: { copied } });
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message || '复制上月排班失败' });
  }
});

// ----------------------------------------
// 6. STORES
// ----------------------------------------
app.get('/api/admin/stores', authenticateToken, async (req, res) => {
  try {
    let sql = `SELECT * FROM stores`;
    const params = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` WHERE id = ?`;
      params.push(req.user.store_id);
    }
    sql += ` ORDER BY id ASC`;
    const list = await query(sql, params);
    
    const storeIds = list.map(s => s.id);
    let allFeatures = [];
    let allHours = [];
    let allDocCounts = [];
    let allDeviceCounts = [];
    let allBookingCounts = [];
    let allRevenueStats = [];
    let allManagers = [];

    if (storeIds.length > 0) {
      const placeholders = storeIds.map(() => '?').join(',');
      const currentMonth = new Date().toISOString().slice(0, 7);

      allFeatures = await query(`SELECT store_id, feature FROM store_features WHERE store_id IN (${placeholders})`, storeIds);
      allHours = await query(`SELECT store_id, open_time, close_time FROM store_hours WHERE store_id IN (${placeholders})`, storeIds);
      allDocCounts = await query(`SELECT store_id, COUNT(DISTINCT doctor_id) as count FROM doctor_store_mapping WHERE store_id IN (${placeholders}) GROUP BY store_id`, storeIds);

      allDeviceCounts = await query(`
        SELECT m.store_id, COUNT(DISTINCT t.id) as count 
        FROM treatment_records t
        JOIN medical_records m ON t.medical_record_id = m.id
        WHERE m.store_id IN (${placeholders})
        GROUP BY m.store_id
      `, storeIds);
      allBookingCounts = await query(
          `SELECT store_id, COUNT(*) as count
           FROM appointments
           WHERE store_id IN (${placeholders})
             AND appointment_date LIKE ?
             AND status NOT IN ('cancelled', 'no_show')
           GROUP BY store_id`,
          [...storeIds, `${currentMonth}%`]
        );
      allRevenueStats = await query(`
	        SELECT a.store_id, SUM(a.consult_fee + a.deposit_amount) as total
	        FROM appointments a
	        WHERE a.store_id IN (${placeholders})
            AND a.appointment_date LIKE ?
            AND a.status IN ('completed', 'arrived', 'settled')
	        GROUP BY a.store_id
	      `, [...storeIds, `${currentMonth}%`]);
      
      allManagers = await query(`
        SELECT store_id, name FROM admin_users 
        WHERE store_id IN (${placeholders}) 
          AND role_id = (SELECT id FROM roles WHERE code = 'store_mgr')
      `, storeIds);
    }

    const featuresMap = {};
    allFeatures.forEach(f => {
      if (!featuresMap[f.store_id]) featuresMap[f.store_id] = [];
      featuresMap[f.store_id].push(f.feature);
    });

    const hoursMap = {};
    allHours.forEach(h => {
      if (!hoursMap[h.store_id]) hoursMap[h.store_id] = [];
      hoursMap[h.store_id].push(h);
    });

    const docCountsMap = {};
    allDocCounts.forEach(d => {
      docCountsMap[d.store_id] = d.count;
    });

    const deviceCountsMap = {};
    allDeviceCounts.forEach(d => {
      deviceCountsMap[d.store_id] = d.count;
    });

    const bookingCountsMap = {};
    allBookingCounts.forEach(b => {
      bookingCountsMap[b.store_id] = b.count;
    });

    const revenueMap = {};
    allRevenueStats.forEach(r => {
      revenueMap[r.store_id] = r.total;
    });

    const managersMap = {};
    allManagers.forEach(m => {
      managersMap[m.store_id] = m.name;
    });

    for (const store of list) {
      store.features = featuresMap[store.id] || [];

      const hours = hoursMap[store.id] || [];
      if (hours.length > 0) {
        store.hours = hours.map(h => ({
          openTime: h.open_time.slice(0, 5),
          closeTime: h.close_time.slice(0, 5)
        }));
      } else {
        const formatT = (t) => t ? t.slice(0, 5) : '09:00';
        store.hours = [{
          openTime: formatT(store.open_time),
          closeTime: formatT(store.close_time)
        }];
      }
      store.isOpen = checkStoreIsOpen(store.status, store.hours, store.open_time, store.close_time);

      store.doctors = docCountsMap[store.id] || 0;

	      store.devices = deviceCountsMap[store.id] || 0;

      store.monthBookings = bookingCountsMap[store.id] || 0;

	      const revenueAmount = Number(revenueMap[store.id] || 0);
	      store.monthRevenue = `¥${(revenueAmount / 100).toFixed(2)}`;
        store.monthRevenueAmount = revenueAmount;

	      store.manager = managersMap[store.id] || '';
	    }
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
	});

app.get('/api/admin/stores/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(id)) {
    return res.status(403).json({ code: 403, message: '您无权查看其他门店的信息' });
  }

  try {
    const store = await get(`SELECT * FROM stores WHERE id = ?`, [id]);
    if (!store) {
      return res.status(404).json({ code: 404, message: '门店不存在' });
    }
    const features = await query(`SELECT feature FROM store_features WHERE store_id = ? ORDER BY id ASC`, [id]);
    const hours = await query(`SELECT open_time, close_time FROM store_hours WHERE store_id = ? ORDER BY id ASC`, [id]);
    const manager = await get(
      `SELECT id, name, username FROM admin_users
       WHERE store_id = ? AND role_id = (SELECT id FROM roles WHERE code = 'store_mgr')
       ORDER BY id ASC LIMIT 1`,
      [id]
    );
    store.features = features.map(item => item.feature);
    store.hours = hours.length
      ? hours.map(h => ({ openTime: h.open_time.slice(0, 5), closeTime: h.close_time.slice(0, 5) }))
      : [{ openTime: String(store.open_time || '09:00').slice(0, 5), closeTime: String(store.close_time || '18:00').slice(0, 5) }];
    store.manager = manager ? manager.name : '';
    store.manager_user_id = manager ? manager.id : null;
    res.json({ code: 200, data: store });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店详情失败' });
  }
});

app.post('/api/admin/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可新建门店' });
  }
  const { name, code, address, city, district, phone, latitude, longitude, cover_url, image_urls, open_time, close_time, status, features, hours } = req.body;
  if (!name || !code || !address) {
    return res.status(400).json({ code: 400, message: '门店名称、编号、地址为必填项' });
  }

  try {
    let mainOpen = open_time || '09:00:00';
    let mainClose = close_time || '18:00:00';
    if (hours && hours.length > 0) {
      mainOpen = hours[0].openTime + ':00';
      mainClose = hours[0].closeTime + ':00';
    }

	    const result = await run(
	      `INSERT INTO stores (name, code, address, city, district, latitude, longitude, phone, cover_url, image_urls, open_time, close_time, status)
	       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	      [name, code, address, city || '', district || '', latitude || null, longitude || null, phone || '', cover_url || null, image_urls ? JSON.stringify(image_urls) : null, mainOpen, mainClose, status || 'open']
	    );

    if (features && Array.isArray(features)) {
      for (const feature of features) {
        await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [result.id, feature]);
      }
    }

    if (hours && Array.isArray(hours)) {
      for (const h of hours) {
        if (h.openTime && h.closeTime) {
          await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [result.id, h.openTime, h.closeTime]);
        }
      }
    } else {
      await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [result.id, '09:00', '18:00']);
    }

    await logAdminAction(req.user.id, 'create_store', 'store', result.id, { name, code, address, status: status || 'open' }, req.ip || null);
    res.json({ code: 200, message: '添加门店成功', data: { id: result.id } });
  } catch (error) {
    await logAdminAction(req.user.id, 'create_store', 'store', null, { name, code, address }, req.ip || null, 'fail', error.message || '添加门店失败');
    res.status(500).json({ code: 500, message: '添加门店失败' });
  }
});

app.put('/api/admin/stores/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(id)) {
    return res.status(403).json({ code: 403, message: '您无权修改其他门店的信息' });
  }
  const { name, code, address, city, district, latitude, longitude, phone, cover_url, image_urls, status, features, hours } = req.body;
  if (!name || !address) {
    return res.status(400).json({ code: 400, message: '门店名称、地址为必填项' });
  }

  try {
    let mainOpen = '09:00:00';
    let mainClose = '18:00:00';
    if (hours && hours.length > 0) {
      mainOpen = hours[0].openTime + ':00';
      mainClose = hours[0].closeTime + ':00';
    }

	    await run(
	      `UPDATE stores SET name = ?, code = COALESCE(?, code), address = ?, city = ?, district = ?, latitude = ?, longitude = ?, phone = ?, cover_url = ?, image_urls = ?, status = ?, open_time = ?, close_time = ? WHERE id = ?`,
	      [name, code || null, address, city || '', district || '', latitude || null, longitude || null, phone, cover_url || null, image_urls ? JSON.stringify(image_urls) : null, status, mainOpen, mainClose, id]
	    );

    if (features && Array.isArray(features)) {
      await run(`DELETE FROM store_features WHERE store_id = ?`, [id]);
      for (const feature of features) {
        await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [id, feature]);
      }
    }

    if (hours && Array.isArray(hours)) {
      await run(`DELETE FROM store_hours WHERE store_id = ?`, [id]);
      for (const h of hours) {
        if (h.openTime && h.closeTime) {
          await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [id, h.openTime, h.closeTime]);
        }
      }
    }

    await logAdminAction(req.user.id, 'update_store', 'store', id, { name, address, phone, status });

    res.json({ code: 200, message: '编辑门店成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '编辑门店失败' });
  }
	});

app.delete('/api/admin/stores/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可停用门店' });
  }
  const { id } = req.params;
  try {
    const store = await get(`SELECT id, name FROM stores WHERE id = ?`, [id]);
    if (!store) {
      return res.status(404).json({ code: 404, message: '门店不存在' });
    }
    await run(`UPDATE stores SET status = 'closed' WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'disable_store', 'store', id, { name: store.name });
    res.json({ code: 200, message: '门店已停用' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '停用门店失败' });
  }
});

// ----------------------------------------
// 7. MALL ORDERS
// ----------------------------------------
app.get('/api/admin/orders', authenticateToken, async (req, res) => {
  try {
    let sql = `
      SELECT o.*, u.nickname as buyer_nickname, u.phone as buyer_phone
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `;
    const params = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += `
        WHERE o.user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      params.push(req.user.store_id, req.user.store_id);
    }
    sql += ` ORDER BY o.created_at DESC`;
    const list = await query(sql, params);

    const orderIds = list.map(o => o.id);
    let allOrderItems = [];
    let allCommissions = [];
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      allOrderItems = await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
      allCommissions = await query(
        `SELECT do.*, d.nickname as promoter_name
         FROM distribution_orders do
         JOIN distributors d ON do.distributor_id = d.id
         WHERE do.order_id IN (${placeholders})
         ORDER BY do.commission_level ASC, do.id ASC`,
        orderIds
      );
    }

    const orderItemsMap = {};
    allOrderItems.forEach(item => {
      if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
      orderItemsMap[item.order_id].push(item);
    });

    const commissionsMap = {};
    allCommissions.forEach(commission => {
      if (!commissionsMap[commission.order_id]) commissionsMap[commission.order_id] = [];
      commissionsMap[commission.order_id].push(commission);
    });

    for (const order of list) {
      order.items = orderItemsMap[order.id] || [];
      order.commissions = commissionsMap[order.id] || [];
      order.commission_total = order.commissions.reduce((sum, commission) => {
        if (commission.status === 'refunded') return sum;
        return sum + Number(commission.commission_amount || 0);
      }, 0);
      try {
        order.shipping_address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address;
      } catch (e) {
        // Keep value
      }
    }

    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取订单列表失败' });
  }
});

app.get('/api/admin/orders/refunds', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT o.*, u.nickname as buyer_nickname, u.phone as buyer_phone,
              GROUP_CONCAT(oi.product_name SEPARATOR '、') as product_names
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status IN ('refund_pending', 'refunding', 'refunded')
       GROUP BY o.id
       ORDER BY o.updated_at DESC, o.created_at DESC
       LIMIT 200`
    );
    res.json({
      code: 200,
      data: list.map(order => {
        let addr = {};
        try {
          addr = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
        } catch (error) {}
        return {
          id: order.id,
          refundNo: `RF${String(order.order_no || order.id).replace(/\D/g, '').slice(-12)}`,
          orderNo: order.order_no,
          patient: addr.receiver || order.buyer_nickname || order.buyer_phone || '患者',
          product: order.product_names || '订单商品',
          amount: order.pay_amount,
          reason: addr.refund_reason || '用户申请退款',
          applyTime: order.updated_at || order.created_at,
          status: order.status === 'refunded' ? 'approved' : 'pending'
        };
      })
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取退款列表失败' });
  }
});

app.get('/api/admin/orders/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let sql = `
      SELECT o.*, u.nickname as user_name, u.phone as user_phone, u.avatar_url as user_avatar
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `;
    const params = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += `
        AND o.user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      params.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(sql, params);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const commissions = await query(
      `SELECT do.*, d.nickname as promoter_name
       FROM distribution_orders do
       JOIN distributors d ON do.distributor_id = d.id
       WHERE do.order_id = ?
       ORDER BY do.commission_level ASC, do.id ASC`,
      [id]
    );
    order.items = items;
    order.commissions = commissions;
    order.commission_total = commissions.reduce((sum, commission) => {
      if (commission.status === 'refunded') return sum;
      return sum + Number(commission.commission_amount || 0);
    }, 0);
    try {
      order.shipping_address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : order.shipping_address;
    } catch (error) {}
    try {
      order.invoice_info = typeof order.invoice_info === 'string' ? JSON.parse(order.invoice_info || 'null') : order.invoice_info;
    } catch (error) {}
    res.json({ code: 200, data: order });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取订单详情失败' });
  }
});

app.post('/api/admin/orders/:id/ship', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let checkSql = `SELECT * FROM orders WHERE id = ?`;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.type !== 'online' || order.status !== 'shipping') {
      return res.status(400).json({ code: 400, message: '只有快递待发货订单可以确认发货' });
    }

    const carrier = (req.body.express_company || req.body.carrier || '').trim();
    const trackingNo = (req.body.tracking_number || req.body.trackingNo || '').trim();
    
    if (!carrier || !trackingNo) {
      return res.status(400).json({ code: 400, message: '快递公司和运单号不能为空' });
    }
    if (!/^[A-Za-z0-9-]{6,30}$/.test(trackingNo)) {
      return res.status(400).json({ code: 400, message: '运单号格式不正确，应为6-30位字母、数字或横杠' });
    }

    let addr = {};
    try {
      addr = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
    } catch (error) {}
    addr.express_company = carrier;
    addr.tracking_number = trackingNo;

    await run(`UPDATE orders SET status = 'shipped', shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(addr), id]);
    await logAdminAction(req.user.id, 'ship_order', 'order', id, { carrier, trackingNo }, req.ip || null);
    res.json({ code: 200, message: '发货成功' });
  } catch (error) {
    await logAdminAction(req.user.id, 'ship_order', 'order', id, { express_company: req.body.express_company, tracking_number: req.body.tracking_number }, req.ip || null, 'fail', error.message || '发货失败');
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// GET order express tracking steps
app.get('/api/admin/orders/:id/tracking', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let checkSql = `SELECT * FROM orders WHERE id = ?`;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

    let addr = {};
    try {
      addr = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
    } catch (error) {}

    const carrier = addr.express_company || '';
    const trackingNo = addr.tracking_number || '';

    if (!carrier || !trackingNo) {
      return res.json({ code: 200, data: { carrier: '', trackingNo: '', steps: [] } });
    }

    // Generate realistic logistics events
    const orderTime = new Date(order.created_at);
    const formatDateStr = (d) => d.toISOString().replace('T', ' ').slice(0, 19).replace('.000Z', '');
    
    const steps = [
      {
        time: formatDateStr(new Date(orderTime.getTime())),
        desc: `【发货】您的订单已由商家发货，发货快递：${carrier}，运单号：${trackingNo}`
      },
      {
        time: formatDateStr(new Date(orderTime.getTime() + 2 * 3600000)),
        desc: `【揽收】快件已由 [深圳福田区营业点] 揽收，揽收员：张华 (13800138000)`
      },
      {
        time: formatDateStr(new Date(orderTime.getTime() + 6 * 3600000)),
        desc: `【在途】快件已到达 [深圳转运中心]`
      },
      {
        time: formatDateStr(new Date(orderTime.getTime() + 12 * 3600000)),
        desc: `【在途】快件已从 [深圳转运中心] 发出，正在发往目的地`
      }
    ];

    if (order.status === 'completed') {
      steps.push({
        time: formatDateStr(new Date(orderTime.getTime() + 24 * 3600000)),
        desc: `【派送】快件已到达目的地营业点，正在派送中。派送员：王五 (13912345678)`
      });
      steps.push({
        time: formatDateStr(new Date(orderTime.getTime() + 26 * 3600000)),
        desc: `【签收】快件已签收，签收人：本人。感谢您使用${carrier}，期待再次为您服务！`
      });
    }

    // Sort by time descending
    steps.reverse();

    res.json({
      code: 200,
      data: {
        carrier,
        trackingNo,
        steps
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取物流信息失败' });
  }
});

// POST issue e-invoice for order
app.post('/api/admin/orders/:id/invoice', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, tax_id } = req.body || {};
  try {
    let checkSql = `SELECT * FROM orders WHERE id = ?`;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (!['paid', 'completed', 'shipped'].includes(order.status)) {
      return res.status(400).json({ code: 400, message: '只有已支付或已完成的订单可以开具发票' });
    }

    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    
    // Generate invoice model
    const invoiceInfo = {
      invoice_no: `INV${Date.now()}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
      invoice_code: `INC${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      taxpayer_id: '91440300MA5HNJNG99',
      company_name: '鼾静健康诊所（深圳）有限公司',
      title: title || '个人',
      tax_id: tax_id || '',
      amount: order.pay_amount,
      items: items.map(item => ({
        name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity
      })),
      created_at: new Date().toISOString()
    };

    await run('UPDATE orders SET invoice_info = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(invoiceInfo), id]);
    res.json({ code: 200, message: '发票开具成功', data: invoiceInfo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '开具发票失败' });
  }
});

// Notify patient for offline self-pickup order arrival
app.post('/api/admin/orders/:id/notify', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let checkSql = `
      SELECT o.*, u.nickname, u.phone 
      FROM orders o 
      JOIN users u ON o.user_id = u.id 
      WHERE o.id = ?
    `;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND o.user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.type !== 'offline' || order.status !== 'processing') {
      return res.status(400).json({ code: 400, message: '只有自提待到货订单可以发送到货通知' });
    }

    let addr = {};
    try {
      addr = JSON.parse(order.shipping_address || '{}');
    } catch(e) {}

    // Update delivery status in shipping_address JSON
    addr.status = '已到店（待自提）';
    await transaction(async (conn) => {
      await conn.execute('UPDATE orders SET shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(addr), id]);
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '商品已到店', ?)`,
        [order.user_id, `您的订单 ${order.order_no} 商品已到店，可到门店自提。`]
      );
    });
    await logAdminAction(req.user.id, 'notify_order_arrival', 'order', id, { orderNo: order.order_no });

    res.json({ code: 200, message: '到货自提通知已成功推送给患者！' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '推送通知失败' });
  }
});

// Complete offline pick-up order
app.post('/api/admin/orders/:id/complete', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let checkSql = `SELECT * FROM orders WHERE id = ?`;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.type !== 'offline' || !['paid', 'processing'].includes(order.status)) {
      return res.status(400).json({ code: 400, message: '只有待取货或自提待到货订单可以提货核销' });
    }

    await transaction(async (conn) => {
      await conn.execute(`UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '订单已完成', ?)`,
        [order.user_id, `您的订单 ${order.order_no} 已完成。`]
      );

      const sysSetting = await get(`SELECT key_value FROM system_settings WHERE key_name = 'distribution_settle_days'`);
      const settleDays = parseInt(sysSetting?.key_value, 10);
      const days = Number.isInteger(settleDays) && settleDays >= 0 ? settleDays : 7;
      await conn.execute(
        `UPDATE distribution_orders SET lock_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY) WHERE order_id = ?`,
        [days, id]
      );
    });
    await logAdminAction(req.user.id, 'complete_order', 'order', id, { orderNo: order.order_no });
    res.json({ code: 200, message: '订单交易成功完成' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});


app.put('/api/admin/orders/:id/refund', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const approve = req.body.approve !== undefined
    ? Boolean(req.body.approve)
    : req.body.status === 'approved';

  try {
    let checkSql = `SELECT * FROM orders WHERE id = ?`;
    const checkParams = [id];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      checkSql += `
        AND user_id IN (
          SELECT p.user_id FROM patients p
          WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
             OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
        )
      `;
      checkParams.push(req.user.store_id, req.user.store_id);
    }
    const order = await get(checkSql, checkParams);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (!['refund_pending', 'refunding', 'refunded'].includes(order.status)) {
      return res.status(400).json({ code: 400, message: '当前订单不是退款审核状态' });
    }
    if (order.status === 'refunded') {
      return res.status(400).json({ code: 400, message: '订单已退款，不能重复审批' });
    }

    await transaction(async (conn) => {
      let addr = {};
      try {
        addr = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
      } catch (error) {}
      const restoreStatus = ['paid', 'shipping', 'shipped'].includes(addr.refund_from_status)
        ? addr.refund_from_status
        : (order.type === 'online' ? 'shipping' : 'paid');
      delete addr.refund_from_status;
      const status = approve ? 'refunded' : restoreStatus;
      await conn.execute(`UPDATE orders SET status = ?, shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, JSON.stringify(addr), id]);

      if (approve) {
        const items = await query('SELECT oi.*, p.category FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?', [id]);
        for (const item of items) {
          if (item.category !== 'service') {
            await conn.execute(
              `UPDATE products SET stock = stock + ?, sales_count = GREATEST(0, sales_count - ?) WHERE id = ?`,
              [item.quantity, item.quantity, item.product_id]
            );
          }
        }

        const commissions = await query(
          `SELECT distributor_id, commission_amount, status FROM distribution_orders WHERE order_id = ? AND status != 'refunded'`,
          [id]
        );
        for (const commission of commissions) {
          await conn.execute(
            `UPDATE distribution_orders SET status = 'refunded' WHERE order_id = ? AND distributor_id = ?`,
            [id, commission.distributor_id]
          );
          await conn.execute(
            `UPDATE distributors
             SET total_commission = GREATEST(0, total_commission - ?),
                 available_commission = CASE WHEN ? = 'settled' THEN GREATEST(0, available_commission - ?) ELSE available_commission END
             WHERE id = ?`,
            [commission.commission_amount, commission.status, commission.commission_amount, commission.distributor_id]
          );
        }
      }

      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, ?, ?)`,
        [
          order.user_id,
          approve ? '退款审核通过' : '退款申请未通过',
          approve
            ? `您的订单 ${order.order_no} 退款审核已通过，退款状态已更新。`
            : `您的订单 ${order.order_no} 退款申请未通过，如有疑问请联系客服。`
        ]
      );
    });
    await logAdminAction(req.user.id, approve ? 'approve_refund' : 'reject_refund', 'order', id, { orderNo: order.order_no });
    res.json({ code: 200, message: approve ? '退款审批已通过，资金已原路退回' : '已拒绝退款申请' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '审批操作失败' });
  }
});

// ----------------------------------------
// 8. DISTRIBUTION (推广与提现)
// ----------------------------------------
app.get('/api/admin/distribution/promoters', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT d.*, u.phone as user_phone, 
             (SELECT COUNT(*) FROM distribution_relationships WHERE parent_user_id = d.user_id AND level = 1) as invitees_l1_count,
             (SELECT COUNT(*) FROM distribution_relationships WHERE parent_user_id = d.user_id AND level = 2) as invitees_l2_count,
             (SELECT COUNT(*) FROM distribution_orders WHERE distributor_id = d.id AND status != 'refunded') as total_orders
       FROM distributors d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取推广员列表失败' });
  }
});

app.get('/api/admin/distribution/promoters/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const promoter = await get(
      `SELECT d.*, u.phone as user_phone, u.nickname as user_nickname, u.created_at as user_reg_date
       FROM distributors d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [id]
    );
    if (!promoter) return res.status(404).json({ code: 404, message: '推广员不存在' });

    const l1Count = await get('SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 1', [promoter.user_id]);
    const l2Count = await get('SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 2', [promoter.user_id]);
    const orderStats = await get(
      `SELECT COUNT(*) as count, COALESCE(SUM(order_amount), 0) as amount
       FROM distribution_orders
       WHERE distributor_id = ? AND status <> 'refunded'`,
      [promoter.id]
    );

    const parent = await get(
      `SELECT d.nickname FROM distributors d
       JOIN distribution_relationships dr ON d.user_id = dr.parent_user_id
       WHERE dr.child_user_id = ? AND dr.level = 1`,
      [promoter.user_id]
    );

    res.json({
      code: 200,
      data: {
        id: promoter.id,
        name: promoter.nickname,
        avatar_url: promoter.avatar_url,
        level: promoter.level,
        code: promoter.invite_code,
        phone: promoter.user_phone,
        regDate: promoter.created_at,
        status: promoter.status,
        parentName: parent?.nickname || '无（自主加入）',
        firstLevelDownline: l1Count.count,
        secondLevelDownline: l2Count.count,
        totalOrders: orderStats.count,
        totalAmount: orderStats.amount,
        totalCommission: promoter.total_commission,
        availableCommission: promoter.available_commission,
        withdrawnAmount: promoter.withdrawn_amount
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取推广员详情失败' });
  }
});

app.get('/api/admin/distribution/promoters/:id/commissions', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const list = await query(
      `SELECT do.*, MAX(o.order_no) as order_no, MAX(p.name) as patient_name,
              GROUP_CONCAT(DISTINCT pr.name SEPARATOR '、') as product_names
       FROM distribution_orders do
       LEFT JOIN orders o ON do.order_id = o.id
       LEFT JOIN patients p ON o.user_id = p.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pr ON oi.product_id = pr.id
       WHERE do.distributor_id = ?
       GROUP BY do.id
       ORDER BY do.created_at DESC`,
      [id]
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取佣金流水失败' });
  }
});

app.get('/api/admin/distribution/promoters/:id/team', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const promoter = await get('SELECT user_id FROM distributors WHERE id = ?', [id]);
    if (!promoter) return res.status(404).json({ code: 404, message: '推广员不存在' });

    const l1 = await query(
      `SELECT dr.child_user_id as user_id, COALESCE(d.nickname, u.nickname) as name, u.phone, d.level, d.id as distributor_id, dr.created_at
       FROM distribution_relationships dr
       JOIN users u ON dr.child_user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       WHERE dr.parent_user_id = ? AND dr.level = 1`,
      [promoter.user_id]
    );

    const l2 = await query(
      `SELECT dr.child_user_id as user_id, COALESCE(d.nickname, u.nickname) as name, u.phone, d.level, d.id as distributor_id, dr.created_at
       FROM distribution_relationships dr
       JOIN users u ON dr.child_user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       WHERE dr.parent_user_id = ? AND dr.level = 2`,
      [promoter.user_id]
    );

    res.json({
      code: 200,
      data: {
        level1: l1.map(item => ({
          userId: item.user_id,
          name: item.name,
          phone: item.phone,
          level: item.level || 'customer',
          distributorId: item.distributor_id,
          joinDate: item.created_at
        })),
        level2: l2.map(item => ({
          userId: item.user_id,
          name: item.name,
          phone: item.phone,
          level: item.level || 'customer',
          distributorId: item.distributor_id,
          joinDate: item.created_at
        }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取团队关系失败' });
  }
});

app.put('/api/admin/distribution/promoters/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await run('UPDATE distributors SET status = ? WHERE id = ?', [status || 'active', id]);
    res.json({ code: 200, message: '状态修改成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '修改状态失败' });
  }
});

app.get('/api/admin/distribution/overview', authenticateToken, async (req, res) => {
  try {
    const summary = await get(
      `SELECT
         COALESCE(SUM(total_commission), 0) as total_commission,
         COUNT(*) as promoters_count,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_promoters
       FROM distributors`
    );
    const orders = await get(
      `SELECT
         COUNT(*) as promoted_orders,
         COALESCE(SUM(commission_amount), 0) as generated_commission,
         COALESCE(SUM(order_amount), 0) as promoted_amount
       FROM distribution_orders
       WHERE status <> 'refunded'`
    );
    const relations = await get(`SELECT COUNT(*) as invited_users FROM distribution_relationships`);
    res.json({
      code: 200,
      data: {
        totalCommission: Number(summary.total_commission || 0),
        promotersCount: Number(summary.promoters_count || 0),
        activePromoters: Number(summary.active_promoters || 0),
        promotedOrders: Number(orders.promoted_orders || 0),
        generatedCommission: Number(orders.generated_commission || 0),
        promotedAmount: Number(orders.promoted_amount || 0),
        invitedUsers: Number(relations.invited_users || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取分销总览失败' });
  }
});

app.get('/api/admin/distribution/commissions', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT do.*, d.nickname as promoter_name,
              MAX(o.order_no) as order_no,
              MAX(p.name) as patient_name,
              GROUP_CONCAT(DISTINCT pr.name SEPARATOR '、') as product_names
       FROM distribution_orders do
       JOIN distributors d ON do.distributor_id = d.id
       LEFT JOIN orders o ON do.order_id = o.id
       LEFT JOIN patients p ON o.user_id = p.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pr ON oi.product_id = pr.id
       GROUP BY do.id
       ORDER BY do.created_at DESC
       LIMIT 20`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取佣金流水失败' });
  }
});

app.get('/api/admin/products', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT id, name, category, image_url, price, description, stock, sales_count,
              is_distribution, commission_rate, status, created_at, original_price, gallery_urls
       FROM products
       ORDER BY id DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品列表失败' });
  }
});

app.post('/api/admin/products', authenticateToken, async (req, res) => {
  const { name, description, price, commission_rate, status, category, image_url, stock, is_distribution, original_price, gallery_urls } = req.body;
  if (!name || !price) {
    return res.status(400).json({ code: 400, message: '商品名称和价格为必填项' });
  }
  try {
    let galleryUrlsVal = '[]';
    if (gallery_urls !== undefined && gallery_urls !== null) {
      galleryUrlsVal = typeof gallery_urls === 'string' ? gallery_urls : JSON.stringify(gallery_urls);
    }
    const result = await run(
      `INSERT INTO products (name, category, image_url, price, description, stock, is_distribution, commission_rate, status, original_price, gallery_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        category || 'service',
        image_url || '/static/products/default.png',
        Number(price),
        description || '',
        Number(stock || 0),
        is_distribution ? 1 : 0,
        Number(commission_rate || 0),
        status === 'on' ? 'on' : 'off',
        original_price ? Number(original_price) : null,
        galleryUrlsVal
      ]
    );
    await logAdminAction(req.user.id, 'create_product', 'product', result.id, { name, is_distribution: !!is_distribution });
    res.json({ code: 200, message: '添加商品成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加商品失败' });
  }
});

app.get('/api/admin/products/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const product = await get(`SELECT * FROM products WHERE id = ?`, [id]);
    if (!product) {
      return res.status(404).json({ code: 404, message: '商品不存在' });
    }
    res.json({ code: 200, data: product });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品详情失败' });
  }
});

app.put('/api/admin/products/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const product = await get(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!product) {
    return res.status(404).json({ code: 404, message: '商品不存在' });
  }
  try {
    let galleryUrlsVal = product.gallery_urls;
    if (req.body.gallery_urls !== undefined) {
      galleryUrlsVal = req.body.gallery_urls === null ? '[]' : (typeof req.body.gallery_urls === 'string' ? req.body.gallery_urls : JSON.stringify(req.body.gallery_urls));
    } else if (galleryUrlsVal && typeof galleryUrlsVal !== 'string') {
      galleryUrlsVal = JSON.stringify(galleryUrlsVal);
    }
    if (!galleryUrlsVal) {
      galleryUrlsVal = '[]';
    }

    await run(
      `UPDATE products
       SET name = ?, category = ?, image_url = ?, price = ?, description = ?, stock = ?,
           is_distribution = ?, commission_rate = ?, status = ?, original_price = ?, gallery_urls = ?
       WHERE id = ?`,
      [
        req.body.name ?? product.name,
        req.body.category ?? product.category,
        req.body.image_url ?? product.image_url,
        req.body.price !== undefined ? Number(req.body.price) : product.price,
        req.body.description ?? product.description,
        req.body.stock !== undefined ? Number(req.body.stock) : product.stock,
        req.body.is_distribution !== undefined ? (req.body.is_distribution ? 1 : 0) : product.is_distribution,
        req.body.commission_rate !== undefined ? Number(req.body.commission_rate) : product.commission_rate,
        req.body.status ?? product.status,
        req.body.original_price !== undefined ? (req.body.original_price ? Number(req.body.original_price) : null) : product.original_price,
        galleryUrlsVal,
        id
      ]
    );
    await logAdminAction(req.user.id, 'update_product', 'product', id, {
      status: req.body.status,
      is_distribution: req.body.is_distribution
    });
    res.json({ code: 200, message: '保存商品成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存商品失败' });
  }
});

app.get('/api/admin/distribution/products', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT id, name, category, image_url, price, description, stock, sales_count,
              is_distribution, commission_rate, status, created_at
       FROM products
       WHERE is_distribution = 1 AND status = 'on'
       ORDER BY id DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取推广商品失败' });
  }
});

app.get('/api/admin/distribution/withdraws', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT w.*, u.nickname, u.phone, d.nickname as promoter_name
       FROM withdraw_records w
       JOIN users u ON w.user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       ORDER BY w.created_at DESC`
    );
    res.json({
      code: 200,
      data: list.map(item => ({
        ...item,
        status: item.status === 'success' ? 'approved' : item.status === 'failed' ? 'rejected' : item.status
      }))
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取提现审批列表失败' });
  }
});

app.put('/api/admin/distribution/withdraws/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const approve = req.body.approve !== undefined
    ? Boolean(req.body.approve)
    : req.body.status === 'approved';
  const remark = req.body.remark || '';

  try {
    const record = await get(`SELECT * FROM withdraw_records WHERE id = ?`, [id]);
    if (!record || record.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '记录未找到或已被处理' });
    }

    await transaction(async (conn) => {
      const status = approve ? 'success' : 'failed';
      await conn.execute(
        `UPDATE withdraw_records SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, id]
      );

      if (approve) {
        await conn.execute(
          `UPDATE distributors
           SET withdrawn_amount = withdrawn_amount + ?
           WHERE user_id = ?`,
          [record.actual_amount || record.amount, record.user_id]
        );
      } else {
        await conn.execute(
          `UPDATE distributors
           SET available_commission = available_commission + ?
           WHERE user_id = ?`,
          [record.amount, record.user_id]
        );
      }

      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, ?, ?)`,
        [
          record.user_id,
          approve ? '提现审核通过' : '提现申请已驳回',
          approve
            ? `您的提现申请 ¥${(record.actual_amount / 100).toFixed(2)} 已审核通过，请关注到账情况。${remark ? '备注：' + remark : ''}`
            : `您的提现申请 ¥${(record.amount / 100).toFixed(2)} 未通过审核，金额已退回可提现余额。${remark ? '原因：' + remark : ''}`
        ]
      );
    });

    await logAdminAction(req.user.id, approve ? 'approve_withdraw' : 'reject_withdraw', 'withdraw', id, { remark });

    res.json({ code: 200, message: approve ? '提现审批通过，打款中' : '已驳回提现申请' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '处理失败' });
  }
});

// Leaderboard
app.get('/api/admin/distribution/leaderboard', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT d.id, d.nickname, d.avatar_url, d.level, d.total_commission,
             (SELECT COUNT(*) FROM distribution_relationships WHERE parent_user_id = d.user_id) as invites
       FROM distributors d
       ORDER BY d.total_commission DESC
       LIMIT 10`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排行列表失败' });
  }
});

// ----------------------------------------
// 9. CONTENT MANAGEMENT
// ----------------------------------------
app.post('/api/admin/uploads/images', authenticateToken, async (req, res) => {
  const { fileName, mimeType, fileData, context } = req.body || {};
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!fileData || !mimeType || !allowedMimeTypes.includes(mimeType)) {
    return res.status(400).json({ code: 400, message: '仅支持 JPG、PNG、WEBP 图片' });
  }

  try {
    const buffer = Buffer.from(String(fileData).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (!buffer.length || buffer.length > 3 * 1024 * 1024) {
      return res.status(400).json({ code: 400, message: '图片大小不能超过 3MB' });
    }

    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp'
    };
    const safeContext = String(context || 'common').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'common';
    const safeBaseName = path.basename(fileName || 'image').replace(/[^a-z0-9._-]/gi, '_');
    const ext = extByMime[mimeType] || path.extname(safeBaseName) || '.jpg';
    const uploadDir = path.resolve('./uploads/admin/images', safeContext);
    fs.mkdirSync(uploadDir, { recursive: true });
    const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storedPath = path.join(uploadDir, storedName);
    fs.writeFileSync(storedPath, buffer);

    const urlPath = `/uploads/admin/images/${safeContext}/${storedName}`;
    res.json({
      code: 200,
      message: '上传成功',
      data: {
        url: `${buildRequestOrigin(req)}${urlPath}`,
        path: urlPath,
        name: safeBaseName,
        size: buffer.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '上传图片失败' });
  }
});

app.post('/api/admin/uploads/files', authenticateToken, async (req, res) => {
  const { fileName, mimeType, fileData, context } = req.body || {};
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!fileData || !mimeType || !allowedMimeTypes.includes(mimeType)) {
    return res.status(400).json({ code: 400, message: '仅支持 JPG、PNG、WEBP、PDF 文件' });
  }

  try {
    const buffer = Buffer.from(String(fileData).replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ code: 400, message: '附件大小不能超过 10MB' });
    }

    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf'
    };
    const safeContext = String(context || 'common').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'common';
    const safeBaseName = path.basename(fileName || 'file').replace(/[^a-z0-9._-]/gi, '_');
    const ext = extByMime[mimeType] || path.extname(safeBaseName) || '.dat';
    const uploadDir = path.resolve('./uploads/admin/files', safeContext);
    fs.mkdirSync(uploadDir, { recursive: true });
    const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storedPath = path.join(uploadDir, storedName);
    fs.writeFileSync(storedPath, buffer);

    const urlPath = `/uploads/admin/files/${safeContext}/${storedName}`;
    res.json({
      code: 200,
      message: '上传成功',
      data: {
        url: `${buildRequestOrigin(req)}${urlPath}`,
        path: urlPath,
        name: safeBaseName,
        size: buffer.length,
        mimeType
      }
    });
  } catch (error) {
    console.error('Upload file failed:', error);
    res.status(500).json({ code: 500, message: '上传附件失败' });
  }
});

// Banners (小程序首页轮播)
app.get('/api/admin/content/banners', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT id, title, preview_text, preview_color, link_url, validity, status, sort_order, created_at, updated_at
       FROM content_banners
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取轮播图失败' });
  }
});

app.post('/api/admin/content/banners', authenticateToken, async (req, res) => {
  const { title, preview_text, preview_color, link_url, validity, status, sort_order } = req.body;
  if (!title || !preview_text) {
    return res.status(400).json({ code: 400, message: '标题和预览文字为必填项' });
  }

  try {
    const maxSort = await get(`SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM content_banners`);
    const result = await run(
      `INSERT INTO content_banners (title, preview_text, preview_color, link_url, validity, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        preview_text,
        preview_color || 'linear-gradient(135deg, #1A3580, #3B6BF5)',
        link_url || '',
        validity || '长期',
        ['active', 'inactive', 'expired'].includes(status) ? status : 'active',
        Number.isInteger(Number(sort_order)) ? Number(sort_order) : Number(maxSort?.max_sort || 0) + 1
      ]
    );
    await logAdminAction(req.user.id, 'create_banner', 'content_banner', result.id, { title, status });
    res.json({ code: 200, message: '新增轮播图成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '新增轮播图失败' });
  }
});

app.put('/api/admin/content/banners/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const existing = await get(`SELECT * FROM content_banners WHERE id = ?`, [id]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '轮播图不存在' });
  }

  const nextStatus = req.body.status ?? existing.status;
  if (!['active', 'inactive', 'expired'].includes(nextStatus)) {
    return res.status(400).json({ code: 400, message: '轮播图状态不合法' });
  }

  try {
    await run(
      `UPDATE content_banners
       SET title = ?, preview_text = ?, preview_color = ?, link_url = ?, validity = ?, status = ?, sort_order = ?
       WHERE id = ?`,
      [
        req.body.title ?? existing.title,
        req.body.preview_text ?? existing.preview_text,
        req.body.preview_color ?? existing.preview_color,
        req.body.link_url ?? existing.link_url,
        req.body.validity ?? existing.validity,
        nextStatus,
        Number.isInteger(Number(req.body.sort_order)) ? Number(req.body.sort_order) : existing.sort_order,
        id
      ]
    );
    await logAdminAction(req.user.id, 'update_banner', 'content_banner', id, { title: req.body.title, status: nextStatus });
    res.json({ code: 200, message: '保存轮播图成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存轮播图失败' });
  }
});

app.delete('/api/admin/content/banners/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(`DELETE FROM content_banners WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'delete_banner', 'content_banner', id, {});
    res.json({ code: 200, message: '删除轮播图成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除轮播图失败' });
  }
});

// Live Rooms (直播管理)
app.get('/api/admin/content/live-rooms', authenticateToken, async (req, res) => {
  try {
    const list = await query(`SELECT * FROM live_rooms ORDER BY id DESC`);
    for (const room of list) {
      try {
        room.product_ids = typeof room.product_ids === 'string' ? JSON.parse(room.product_ids) : room.product_ids;
      } catch (e) {
        room.product_ids = [];
      }
    }
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取直播列表失败' });
  }
});

app.post('/api/admin/content/live-rooms', authenticateToken, async (req, res) => {
  const {
    title,
    cover_url,
    wechat_room_id,
    wechat_anchor_wechat,
    wechat_cover_media_id,
    wechat_share_media_id,
    anchor_name,
    status,
    start_time,
    end_time,
    replay_url,
    product_ids
  } = req.body;
  try {
    let nextWechatRoomId = wechat_room_id ? String(wechat_room_id) : '';
    let nextCoverMediaId = wechat_cover_media_id || '';
    let nextShareMediaId = wechat_share_media_id || '';
    const nextEndTime = end_time || new Date(new Date(start_time).getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    if (!nextWechatRoomId) {
      const createdRoom = await createWechatLiveRoom({
        title,
        cover_url,
        wechat_cover_media_id,
        wechat_share_media_id,
        anchor_name,
        wechat_anchor_wechat,
        start_time,
        end_time: nextEndTime
      });
      nextWechatRoomId = createdRoom.roomId;
      nextCoverMediaId = createdRoom.coverMediaId;
      nextShareMediaId = createdRoom.shareMediaId;
    }

    const result = await run(
      `INSERT INTO live_rooms (title, cover_url, wechat_room_id, wechat_anchor_wechat, wechat_cover_media_id, wechat_share_media_id, anchor_name, status, start_time, end_time, replay_url, product_ids, anchor_avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        cover_url || '/static/demo/store-3.jpg',
        nextWechatRoomId || null,
        wechat_anchor_wechat || null,
        nextCoverMediaId || null,
        nextShareMediaId || null,
        anchor_name,
        status || 'upcoming',
        start_time,
        nextEndTime,
        replay_url || '',
        JSON.stringify(product_ids || []),
        '/static/demo/doctor-1.jpg'
      ]
    );
    res.json({ code: 200, message: '添加直播成功', data: { id: result.id, wechat_room_id: nextWechatRoomId } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '添加失败' });
  }
});

app.put('/api/admin/content/live-rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    title,
    cover_url,
    wechat_room_id,
    wechat_anchor_wechat,
    wechat_cover_media_id,
    wechat_share_media_id,
    anchor_name,
    status,
    start_time,
    replay_url,
    product_ids,
    end_time
  } = req.body;
  try {
    await run(
      `UPDATE live_rooms 
       SET title = ?, cover_url = ?, wechat_room_id = ?, wechat_anchor_wechat = ?, wechat_cover_media_id = ?, wechat_share_media_id = ?, anchor_name = ?, status = ?, start_time = ?, end_time = ?, replay_url = ?, product_ids = ?
       WHERE id = ?`,
      [
        title,
        cover_url,
        wechat_room_id ? String(wechat_room_id) : null,
        wechat_anchor_wechat || null,
        wechat_cover_media_id || null,
        wechat_share_media_id || null,
        anchor_name,
        status,
        start_time,
        end_time || null,
        replay_url || '',
        JSON.stringify(product_ids || []),
        id
      ]
    );
    res.json({ code: 200, message: '编辑成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '编辑失败' });
  }
});

app.post('/api/admin/content/live-rooms/:id/sync-wechat', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const room = await get(`SELECT * FROM live_rooms WHERE id = ?`, [id]);
    if (!room) {
      return res.status(404).json({ code: 404, message: '直播不存在' });
    }
    if (!room.wechat_room_id) {
      return res.status(400).json({ code: 400, message: '请先配置微信直播间ID' });
    }

    const official = await fetchWechatLiveRoom(room.wechat_room_id);
    await run(
      `UPDATE live_rooms
       SET title = ?, cover_url = ?, anchor_name = ?, status = ?, start_time = ?, end_time = ?
       WHERE id = ?`,
      [
        official.title || room.title,
        official.coverUrl || room.cover_url,
        official.anchorName || room.anchor_name,
        official.status || room.status,
        official.startTime || room.start_time,
        official.endTime || room.end_time || null,
        id
      ]
    );

    res.json({
      code: 200,
      message: '已同步微信直播间信息',
      data: {
        room_id: room.wechat_room_id,
        live_status: official.raw?.live_status ?? null
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      code: error.statusCode || 500,
      message: error.message || '同步微信直播间失败'
    });
  }
});

app.delete('/api/admin/content/live-rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(`DELETE FROM live_rooms WHERE id = ?`, [id]);
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

// Articles (健康科普)
app.get('/api/admin/content/articles', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT p.id, p.title, p.content, p.cover_url, p.tags, p.likes_count, p.comments_count,
              p.is_top, p.status, p.created_at, u.nickname, u.phone
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.is_top DESC, p.created_at DESC
       LIMIT 500`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取内容列表失败' });
  }
});

app.get('/api/admin/content/articles/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const post = await get(`SELECT * FROM community_posts WHERE id = ?`, [id]);
    if (!post) {
      return res.status(404).json({ code: 404, message: '文章不存在' });
    }
    res.json({ code: 200, data: post });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取文章详情失败' });
  }
});

app.post('/api/admin/content/articles', authenticateToken, async (req, res) => {
  const { title, content, cover_url, tags = [], status = 'pending' } = req.body;
  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '文章标题和正文为必填项' });
  }
  if (!['pending', 'approved', 'rejected', 'draft'].includes(status)) {
    return res.status(400).json({ code: 400, message: '文章状态不合法' });
  }

  try {
    const author = await get(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
    if (!author) {
      return res.status(400).json({ code: 400, message: '缺少系统用户，无法发布文章' });
    }
    const result = await run(
      `INSERT INTO community_posts (user_id, user_role, title, content, cover_url, tags, status)
       VALUES (?, 'admin', ?, ?, ?, ?, ?)`,
      [author.id, title, content, cover_url || null, JSON.stringify(tags), status === 'draft' ? 'pending' : status]
    );
    await logAdminAction(req.user.id, 'create_article', 'community_post', result.id, { title, status });
    res.json({ code: 200, message: '保存文章成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存文章失败' });
  }
});

app.put('/api/admin/content/articles/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content, cover_url, tags, status, is_top } = req.body;
  const post = await get(`SELECT id FROM community_posts WHERE id = ?`, [id]);
  if (!post) {
    return res.status(404).json({ code: 404, message: '内容不存在' });
  }
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ code: 400, message: '内容状态不合法' });
  }

  try {
    await run(
      `UPDATE community_posts
       SET title = COALESCE(?, title),
           content = COALESCE(?, content),
           cover_url = COALESCE(?, cover_url),
           tags = COALESCE(?, tags),
           status = COALESCE(?, status),
           is_top = COALESCE(?, is_top)
       WHERE id = ?`,
      [
        title ?? null,
        content ?? null,
        cover_url ?? null,
        Array.isArray(tags) ? JSON.stringify(tags) : null,
        status ?? null,
        typeof is_top === 'boolean' ? (is_top ? 1 : 0) : null,
        id
      ]
    );
    await logAdminAction(req.user.id, 'update_article', 'community_post', id, { title, status, is_top });
    res.json({ code: 200, message: '更新内容成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新内容失败' });
  }
});

app.delete('/api/admin/content/articles/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(`DELETE FROM community_posts WHERE id = ?`, [id]);
    await logAdminAction(req.user.id, 'delete_article', 'community_post', id, {});
    res.json({ code: 200, message: '删除内容成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除内容失败' });
  }
});

// Article Categories (健康科普分类)
app.get('/api/admin/content/categories', authenticateToken, async (req, res) => {
  try {
    const list = await query('SELECT * FROM article_categories ORDER BY sort_order ASC, id ASC');
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取分类列表失败' });
  }
});

app.post('/api/admin/content/categories', authenticateToken, async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '分类名称为必填项' });
  try {
    const result = await run(
      'INSERT INTO article_categories (name, sort_order) VALUES (?, ?)',
      [name, sort_order || 0]
    );
    await logAdminAction(req.user.id, 'create_article_category', 'article_category', result.id, { name });
    res.json({ code: 200, message: '创建分类成功', data: { id: result.id } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ code: 400, message: '分类名称不能重复' });
    }
    res.status(500).json({ code: 500, message: '创建分类失败' });
  }
});

app.put('/api/admin/content/categories/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, sort_order } = req.body;
  try {
    const category = await get('SELECT id FROM article_categories WHERE id = ?', [id]);
    if (!category) return res.status(404).json({ code: 404, message: '分类不存在' });
    await run(
      'UPDATE article_categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [name || null, sort_order !== undefined ? Number(sort_order) : null, id]
    );
    await logAdminAction(req.user.id, 'update_article_category', 'article_category', id, { name });
    res.json({ code: 200, message: '更新分类成功' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ code: 400, message: '分类名称已存在' });
    }
    res.status(500).json({ code: 500, message: '更新分类失败' });
  }
});

app.delete('/api/admin/content/categories/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const category = await get('SELECT id FROM article_categories WHERE id = ?', [id]);
    if (!category) return res.status(404).json({ code: 404, message: '分类不存在' });
    await run('DELETE FROM article_categories WHERE id = ?', [id]);
    await logAdminAction(req.user.id, 'delete_article_category', 'article_category', id, {});
    res.json({ code: 200, message: '删除分类成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除分类失败' });
  }
});

// Q&As
app.get('/api/admin/content/qa', authenticateToken, async (req, res) => {
  res.json({
    code: 200,
    data: [
      { id: 1, question: '佩戴阻鼾器牙齿发酸怎么缓解？', answer: '清晨醒来取出阻鼾器后，可以做几次轻轻张口和前伸下颌的放松操，一般酸痛可在10分钟内消退。', category: '佩戴常见问题' },
      { id: 2, question: '清洁片需要每天都使用吗？', answer: '建议每天清晨取出后使用温水配合清洁片泡腾清洗15分钟，杀灭滋生的微生物，保持卫生。', category: '日常维护' }
    ]
  });
});

// ----------------------------------------
// 10. SYSTEM USERS & ROLES
// ----------------------------------------
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT u.id, u.username, u.name, u.phone, u.status, u.role_id, u.store_id, u.doctor_id, u.last_login_at, u.created_at,
             r.name as role_name, r.code as role_code, s.name as store_name, d.name as doctor_name
       FROM admin_users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN stores s ON u.store_id = s.id
       LEFT JOIN doctors d ON u.doctor_id = d.id
       ORDER BY u.id ASC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取账号列表失败' });
  }
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
  const { username, name, phone, role_id, store_id, doctor_id, password, status } = req.body;
  if (!username || !role_id || !password) {
    return res.status(400).json({ code: 400, message: '用户名、角色和密码为必填项' });
  }

  try {
    if (doctor_id) {
      const doctor = await get(`SELECT id FROM doctors WHERE id = ?`, [doctor_id]);
      if (!doctor) {
        return res.status(400).json({ code: 400, message: '绑定的医生不存在' });
      }
      const existing = await get(`SELECT id FROM admin_users WHERE doctor_id = ?`, [doctor_id]);
      if (existing) {
        return res.status(400).json({ code: 400, message: '该医生已绑定后台账号' });
      }
    }
    const passwordHash = hashPassword(password);
    const result = await run(
      `INSERT INTO admin_users (username, password_hash, name, phone, role_id, store_id, doctor_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, name || '', phone || '', role_id, store_id || null, doctor_id || null, status || 'online']
    );
    await logAdminAction(req.user.id, 'create_admin', 'admin', result.id, { username, name, role_id, store_id, doctor_id }, req.ip || null);
    res.json({ code: 200, message: '创建账号成功', data: { id: result.id } });
  } catch (error) {
    await logAdminAction(req.user.id, 'create_admin', 'admin', null, { username, name, role_id, store_id, doctor_id }, req.ip || null, 'fail', error.message || '创建账号失败');
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ code: 400, message: '用户名已存在' });
    } else {
      res.status(500).json({ code: 500, message: '创建账号失败' });
    }
  }
});

app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, phone, role_id, store_id, doctor_id, status, password } = req.body;

  try {
    if (doctor_id) {
      const doctor = await get(`SELECT id FROM doctors WHERE id = ?`, [doctor_id]);
      if (!doctor) {
        return res.status(400).json({ code: 400, message: '绑定的医生不存在' });
      }
      const existing = await get(`SELECT id FROM admin_users WHERE doctor_id = ? AND id <> ?`, [doctor_id, id]);
      if (existing) {
        return res.status(400).json({ code: 400, message: '该医生已绑定其他后台账号' });
      }
    }
    if (password) {
      const passwordHash = hashPassword(password);
      await run(
        `UPDATE admin_users 
         SET name = ?, phone = ?, role_id = ?, store_id = ?, doctor_id = ?, status = ?, password_hash = ? 
         WHERE id = ?`,
        [name || '', phone || '', role_id, store_id || null, doctor_id || null, status || 'online', passwordHash, id]
      );
    } else {
      await run(
        `UPDATE admin_users 
         SET name = ?, phone = ?, role_id = ?, store_id = ?, doctor_id = ?, status = ?
         WHERE id = ?`,
        [name || '', phone || '', role_id, store_id || null, doctor_id || null, status || 'online', id]
      );
    }
    await logAdminAction(req.user.id, 'update_admin', 'admin', id, { name, phone, role_id, store_id, doctor_id, status }, req.ip || null);
    res.json({ code: 200, message: '修改账号成功' });
  } catch (error) {
    await logAdminAction(req.user.id, 'update_admin', 'admin', id, { name, phone, role_id, store_id, doctor_id, status }, req.ip || null, 'fail', error.message || '修改账号失败');
    res.status(500).json({ code: 500, message: '修改账号失败' });
  }
});

app.get('/api/admin/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await query(
      `SELECT r.*, COUNT(u.id) as members_count
       FROM roles r
       LEFT JOIN admin_users u ON u.role_id = r.id
       GROUP BY r.id
       ORDER BY r.id ASC`
    );
    for (const role of roles) {
      const perms = await query(`SELECT permission_resource FROM permissions WHERE role_id = ?`, [role.id]);
      role.permissions = perms.map(p => p.permission_resource);
    }
    res.json({ code: 200, data: roles });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取角色列表失败' });
  }
});

app.post('/api/admin/roles', authenticateToken, async (req, res) => {
  const { name, code, description, status, permissions = [], memberIds = [] } = req.body;
  if (!name) {
    return res.status(400).json({ code: 400, message: '角色名称为必填项' });
  }

  const roleCode = code || String(name).trim().toLowerCase().replace(/\s+/g, '_');
  try {
    const result = await transaction(async (conn) => {
      const [insertResult] = await conn.execute(
        `INSERT INTO roles (name, code, description, status) VALUES (?, ?, ?, ?)`,
        [name, roleCode, description || '', status || 'active']
      );
      const roleId = insertResult.insertId;
      for (const permission of permissions) {
        await conn.execute(
          `INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`,
          [roleId, permission]
        );
      }
      if (Array.isArray(memberIds) && memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE admin_users SET role_id = ? WHERE id IN (${placeholders})`,
          [roleId, ...memberIds]
        );
      }
      return { id: roleId };
    });
    await logAdminAction(req.user.id, 'create_role', 'role', result.id, { name, roleCode, memberCount: memberIds.length });
    res.json({ code: 200, message: '创建角色成功', data: result });
  } catch (error) {
    res.status(500).json({ code: 500, message: '创建角色失败' });
  }
});

app.put('/api/admin/roles/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const role = await get(`SELECT * FROM roles WHERE id = ?`, [id]);
  if (!role) {
    return res.status(404).json({ code: 404, message: '角色不存在' });
  }
  if (role.code === 'super_admin' && req.body.status === 'inactive') {
    return res.status(400).json({ code: 400, message: '超级管理员角色不能禁用' });
  }

  try {
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE roles SET name = ?, description = ?, status = ? WHERE id = ?`,
        [
          req.body.name ?? role.name,
          req.body.description ?? role.description ?? '',
          req.body.status ?? role.status ?? 'active',
          id
        ]
      );
      if (Array.isArray(req.body.permissions)) {
        await conn.execute(`DELETE FROM permissions WHERE role_id = ?`, [id]);
        for (const permission of req.body.permissions) {
          await conn.execute(
            `INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`,
            [id, permission]
          );
        }
      }
      if (Array.isArray(req.body.memberIds)) {
        const memberIds = req.body.memberIds.map(String);
        if (memberIds.length > 0) {
          const placeholders = memberIds.map(() => '?').join(',');
          await conn.execute(
            `UPDATE admin_users SET role_id = NULL WHERE role_id = ? AND id NOT IN (${placeholders})`,
            [id, ...memberIds]
          );
          await conn.execute(
            `UPDATE admin_users SET role_id = ? WHERE id IN (${placeholders})`,
            [id, ...memberIds]
          );
        } else {
          await conn.execute(
            `UPDATE admin_users SET role_id = NULL WHERE role_id = ?`,
            [id]
          );
        }
      }
    });
    await logAdminAction(req.user.id, 'update_role', 'role', id, { name: req.body.name, status: req.body.status });
    res.json({ code: 200, message: '保存角色成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存角色失败' });
  }
});

app.get('/api/admin/logs', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = (page - 1) * limit;

    const { keyword, module: reqModule, action, status } = req.query;

    let conditions = [];
    let params = [];

    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      conditions.push(`(
        u.username LIKE ? OR 
        u.name LIKE ? OR 
        l.details LIKE ? OR 
        l.ip_address LIKE ?
      )`);
      params.push(kw, kw, kw, kw);
    }

    if (reqModule && reqModule.trim()) {
      const modules = reqModule.split(',').map(m => m.trim()).filter(Boolean);
      if (modules.length > 0) {
        const placeholders = modules.map(() => '?').join(',');
        conditions.push(`l.target_type IN (${placeholders})`);
        params.push(...modules);
      }
    }

    if (action && action.trim()) {
      conditions.push(`l.action = ?`);
      params.push(action.trim());
    }

    if (status && status.trim()) {
      conditions.push(`l.status = ?`);
      params.push(status.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await get(
      `SELECT COUNT(*) as total
       FROM audit_logs l
       LEFT JOIN admin_users u ON l.admin_id = u.id
       ${whereClause}`,
      params
    );
    const total = countResult ? countResult.total : 0;

    const listSql = `
      SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.ip_address, l.status, l.error_message, l.created_at,
             u.username, u.name as operator_name, r.name as role_name
      FROM audit_logs l
      LEFT JOIN admin_users u ON l.admin_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const list = await query(listSql, params);

    res.json({
      code: 200,
      data: {
        list,
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ code: 500, message: '获取操作日志失败' });
  }
});

// Pre-exam vitals routes
app.post('/api/admin/appointments/:id/pre-exam', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { height, weight, systolicBp, diastolicBp, neckCircumference, bmi } = req.body;
  try {
    const appt = await get('SELECT a.doctor_id, a.store_id, p.user_id FROM appointments a JOIN patients p ON a.patient_id = p.id WHERE a.id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(appt.doctor_id))) {
      return res.status(403).json({ code: 403, message: '医生账号只能维护自己的预约预检信息' });
    }
    if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(appt.store_id)) {
      return res.status(403).json({ code: 403, message: '您无权维护该门店预约预检信息' });
    }
    const userId = appt ? appt.user_id : null;

    const existing = await get('SELECT id FROM appointment_pre_exams WHERE appointment_id = ?', [id]);
    if (existing) {
      await run(
        `UPDATE appointment_pre_exams 
         SET height = ?, weight = ?, systolic_bp = ?, diastolic_bp = ?, neck_circumference = ?, bmi = ?, user_id = ?
         WHERE appointment_id = ?`,
        [height, weight, systolicBp, diastolicBp, neckCircumference, bmi, userId, id]
      );
    } else {
      await run(
        `INSERT INTO appointment_pre_exams (appointment_id, user_id, height, weight, systolic_bp, diastolic_bp, neck_circumference, bmi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, height, weight, systolicBp, diastolicBp, neckCircumference, bmi]
      );
    }
    res.json({ code: 200, message: '保存预检信息成功' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '保存预检信息失败' });
  }
});

app.get('/api/admin/appointments/:id/pre-exam', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const appt = await get('SELECT doctor_id, store_id FROM appointments WHERE id = ?', [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (req.user.role === 'doctor' && (!req.user.doctor_id || Number(req.user.doctor_id) !== Number(appt.doctor_id))) {
      return res.status(403).json({ code: 403, message: '医生账号只能查看自己的预约预检信息' });
    }
    if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(appt.store_id)) {
      return res.status(403).json({ code: 403, message: '您无权查看该门店预约预检信息' });
    }
    let data = await get('SELECT * FROM appointment_pre_exams WHERE appointment_id = ?', [id]);
    if (!data) {
      data = await get(
        `SELECT ape.* FROM appointment_pre_exams ape
         JOIN appointments a ON ape.appointment_id = a.id
         WHERE a.patient_id = (SELECT patient_id FROM appointments WHERE id = ?)
         ORDER BY a.appointment_date DESC, a.id DESC
         LIMIT 1`,
        [id]
      );
    }
    res.json({ code: 200, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '获取体征信息失败' });
  }
});

// Bind distributor to patient
app.post('/api/admin/patients/:id/bind-promoter', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { promoter_user_id } = req.body;
  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权维护该患者的推广关系' });
  }
  if (!promoter_user_id) {
    return res.status(400).json({ code: 400, message: '请选择推广人' });
  }
  try {
    const patient = await get('SELECT user_id FROM patients WHERE id = ?', [id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }
    const promoter = await get(
      `SELECT user_id FROM distributors WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [promoter_user_id]
    );
    if (!promoter) {
      return res.status(400).json({ code: 400, message: '推广人不存在或已停用' });
    }
    if (Number(promoter_user_id) === Number(patient.user_id)) {
      return res.status(400).json({ code: 400, message: '患者不能绑定自己为推广人' });
    }
    const child_user_id = patient.user_id;
    const existing = await get('SELECT id FROM distribution_relationships WHERE child_user_id = ?', [child_user_id]);
    if (existing) {
      await run('UPDATE distribution_relationships SET parent_user_id = ? WHERE child_user_id = ?', [promoter_user_id, child_user_id]);
    } else {
      await run('INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, 1)', [promoter_user_id, child_user_id]);
    }
    await logAdminAction(req.user.id, 'bind_patient_promoter', 'patient', id, { promoter_user_id });
    res.json({ code: 200, message: '绑定推广人成功' });
  } catch (error) {
    console.error('Bind promoter failed:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// Create billing order
app.post('/api/admin/orders', authenticateToken, async (req, res) => {
  const { patient_id, items, pay_amount, discount_amount, coupon_id, pay_method, type, status, shipping_address } = req.body;
  if (!patient_id || !items || items.length === 0) {
    return res.status(400).json({ code: 400, message: '参数缺失' });
  }
  try {
    const patient = await get('SELECT user_id, name, phone FROM patients WHERE id = ?', [patient_id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }
    const user_id = patient.user_id;
    const order_no = `ORD${Date.now()}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;

    const productIds = items.map(item => Number(item.product_id || item.productId)).filter(Boolean);
    if (productIds.length !== items.length) {
      return res.status(400).json({ code: 400, message: '商品明细不完整' });
    }
    const placeholders = productIds.map(() => '?').join(',');
    const products = await query(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds);
    const productMap = {};
    products.forEach(product => {
      productMap[product.id] = product;
    });

    let total_amount = 0;
    const validatedItems = [];
    for (const item of items) {
      const productId = Number(item.product_id || item.productId);
      const product = productMap[productId];
      const quantity = parseInt(item.quantity, 10);
      if (!product) {
        return res.status(400).json({ code: 400, message: `商品 ${productId} 不存在` });
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
        return res.status(400).json({ code: 400, message: '商品数量不正确' });
      }
      if (product.status !== 'on') {
        return res.status(400).json({ code: 400, message: `商品 ${product.name} 已下架` });
      }
      if (product.category !== 'service' && product.stock < quantity) {
        return res.status(400).json({ code: 400, message: `商品 ${product.name} 库存不足` });
      }
      const itemPrice = (item.price !== undefined && item.price !== null) ? Number(item.price) : product.price;
      total_amount += itemPrice * quantity;
      validatedItems.push({
        product,
        quantity,
        price: itemPrice,
        isDistributionSnapshot: Number(product.is_distribution || 0) === 1 ? 1 : 0,
        commissionRateSnapshot: Number(product.commission_rate || 0)
      });
    }
    const discount = Math.max(0, parseInt(discount_amount || 0, 10));
    const calculatedPayAmount = Math.max(0, total_amount - discount);
    if (Number(pay_amount) !== calculatedPayAmount) {
      return res.status(400).json({
        code: 400,
        message: '收银金额与后端计算结果不一致，请刷新后重试',
        data: { calculatedPayAmount }
      });
    }

    let orderType = type === 'online' ? 'online' : 'offline';
    if (status === 'shipping') {
      orderType = 'online';
    } else if (status === 'processing' || status === 'paid') {
      orderType = 'offline';
    }
    const orderStatus = status === 'processing'
      ? 'processing'
      : orderType === 'online'
        ? 'shipping'
        : 'paid';
    const orderId = await transaction(async (conn) => {
      const [orderResult] = await conn.execute(
        `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [
          order_no,
          user_id,
          orderType,
          total_amount,
          discount,
          coupon_id || null,
          calculatedPayAmount,
          pay_method || 'wechat',
          orderStatus,
          shipping_address ? (typeof shipping_address === 'string' ? shipping_address : JSON.stringify(shipping_address)) : JSON.stringify({ receiver: patient.name, phone: patient.phone, province: '广东省', city: '深圳市', district: '到店自提', detail: '到店自提', deliveryMethod: 'pickup' })
        ]
      );
      const insertedId = orderResult.insertId;

      for (const item of validatedItems) {
        await conn.execute(
          `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, is_distribution_snapshot, commission_rate_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insertedId,
            item.product.id,
            item.product.name,
            item.product.image_url || '',
            item.price,
            item.quantity,
            item.isDistributionSnapshot,
            item.commissionRateSnapshot
          ]
        );

        if (item.product.category !== 'service') {
          await conn.execute(
            `UPDATE products SET stock = stock - ?, sales_count = sales_count + ? WHERE id = ?`,
            [item.quantity, item.quantity, item.product.id]
          );
        }
      }

      const relationships = await query(
        `SELECT parent_user_id, level FROM distribution_relationships WHERE child_user_id = ? ORDER BY level ASC`,
        [user_id]
      );

      const relL1 = relationships.find(r => r.level === 1);
      let calculatedL1Commission = 0;

      if (relL1) {
        const promoter = await get(
          `SELECT id, level FROM distributors WHERE user_id = ?`,
          [relL1.parent_user_id]
        );
        if (promoter) {
          const distributionItems = validatedItems.filter(item => Number(item.isDistributionSnapshot || 0) === 1);
          const commissionBase = distributionItems.reduce((sum, item) => {
            const rate = Number(item.commissionRateSnapshot || 0);
            return sum + Math.round(item.price * item.quantity * rate / 100);
          }, 0);

          let commission = distributionItems.length > 0 ? commissionBase : 0;
          if (distributionItems.length > 0 && commissionBase <= 0) {
            const rateMap = { silver: 0.08, gold: 0.12, diamond: 0.15 };
            const rate = rateMap[promoter.level] || 0.10;
            commission = Math.round(calculatedPayAmount * rate);
          }

          calculatedL1Commission = commission;

          if (commission > 0) {
            await conn.execute(
              `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status)
               VALUES (?, ?, ?, ?, ?, 1, 'pending')`,
              [insertedId, promoter.id, `${patient.name} (${maskPhone(patient.phone || '')})`, calculatedPayAmount, commission]
            );
            await conn.execute(
              `UPDATE distributors SET total_commission = total_commission + ? WHERE id = ?`,
              [commission, promoter.id]
            );
          }
        }
      }

      const relL2 = relationships.find(r => r.level === 2);
      if (relL2 && calculatedL1Commission > 0) {
        const promoterL2 = await get(
          `SELECT id FROM distributors WHERE user_id = ?`,
          [relL2.parent_user_id]
        );
        if (promoterL2) {
          const commissionL2 = Math.round(calculatedL1Commission * 0.2);
          if (commissionL2 > 0) {
            await conn.execute(
              `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status)
               VALUES (?, ?, ?, ?, ?, 2, 'pending')`,
              [insertedId, promoterL2.id, `${patient.name} (${maskPhone(patient.phone || '')})`, calculatedPayAmount, commissionL2]
            );
            await conn.execute(
              `UPDATE distributors SET total_commission = total_commission + ? WHERE id = ?`,
              [commissionL2, promoterL2.id]
            );
          }
        }
      }

      return insertedId;
    });

    const savedOrder = await get(
      `SELECT id, order_no, type, total_amount, discount_amount, pay_amount, pay_method, pay_at, status, shipping_address
       FROM orders WHERE id = ?`,
      [orderId]
    );
    const savedItems = await query(
      `SELECT product_id, product_name, price, quantity
       FROM order_items WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );

    await logAdminAction(req.user.id, 'create_cashier_order', 'order', orderId, { orderNo: order_no, amount: calculatedPayAmount });
    res.json({
      code: 200,
      message: '收费收银成功',
      data: {
        order_no,
        order_id: orderId,
        pay_amount: calculatedPayAmount,
        receipt: {
          orderId,
          orderNo: savedOrder.order_no,
          patientName: patient.name,
          totalAmount: Number(savedOrder.total_amount || 0),
          discountAmount: Number(savedOrder.discount_amount || 0),
          payAmount: Number(savedOrder.pay_amount || 0),
          payMethod: savedOrder.pay_method,
          payAt: savedOrder.pay_at,
          status: savedOrder.status,
          type: savedOrder.type,
          shippingAddress: savedOrder.shipping_address,
          items: savedItems.map(item => ({
            productId: item.product_id,
            productName: item.product_name,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0)
          }))
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '收银失败' });
  }
});

// 全局模糊搜索 API (支持预约单、患者姓名/电话、订单号)
app.get('/api/admin/global-search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json({ code: 200, data: { patients: [], appointments: [], orders: [] } });
  }
  const kw = `%${q}%`;
  try {
    const patients = await query(
      `SELECT p.id, p.name, p.phone, p.gender, p.age, u.member_level 
       FROM patients p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.name LIKE ? OR p.phone LIKE ? LIMIT 5`,
      [kw, kw]
    );
    const appointments = await query(
      `SELECT a.id, a.appointment_no, p.name as patient_name, a.appointment_date, a.status 
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.appointment_no LIKE ? OR p.name LIKE ? LIMIT 5`,
      [kw, kw]
    );
    const orders = await query(
      `SELECT o.id, o.order_no, o.pay_amount, o.status
       FROM orders o
       WHERE o.order_no LIKE ? LIMIT 5`,
      [kw]
    );
    res.json({
      code: 200,
      data: { patients, appointments, orders }
    });
  } catch (error) {
    console.error('Global Search Error:', error);
    res.status(500).json({ code: 500, message: '搜索失败' });
  }
});

// 顶部消息通知/待办统计 API
app.get('/api/admin/notifications/stats', authenticateToken, async (req, res) => {
  try {
    const pendingWithdraws = await get(`SELECT COUNT(*) as count FROM withdraw_records WHERE status = 'pending'`);
    const pendingAppointments = await get(`SELECT COUNT(*) as count FROM appointments WHERE status = 'pending'`);
    const pendingOrders = await get(`SELECT COUNT(*) as count FROM orders WHERE status IN ('paid', 'shipping', 'processing')`);
    res.json({
      code: 200,
      data: {
        withdrawCount: pendingWithdraws ? pendingWithdraws.count : 0,
        appointmentCount: pendingAppointments ? pendingAppointments.count : 0,
        orderCount: pendingOrders ? pendingOrders.count : 0
      }
    });
  } catch (error) {
    console.error('Notification Stats Error:', error);
    res.status(500).json({ code: 500, message: '获取消息统计失败' });
  }
});

// 1) 获取最近聊天患者列表
app.get('/api/admin/im/users', authenticateToken, async (req, res) => {
  try {
    const users = await query(`
      SELECT p.id, p.name, p.phone, 
             (SELECT text FROM im_messages WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) as lastMsg,
             (SELECT DATE_FORMAT(created_at, '%H:%i') FROM im_messages WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) as time,
             CASE WHEN (SELECT COUNT(*) FROM im_messages WHERE patient_id = p.id AND sender = 'patient' AND is_read = 0) > 0 THEN 1 ELSE 0 END as unread
      FROM patients p
      WHERE EXISTS (SELECT 1 FROM im_messages WHERE patient_id = p.id)
      ORDER BY (SELECT created_at FROM im_messages WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) DESC
    `);
    
    // 如果没有用户，那就默认推荐前三个有数据的患者
    if (users.length === 0) {
      const defaultPatients = await query(`SELECT id, name, phone FROM patients LIMIT 3`);
      const emptyUsers = defaultPatients.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        lastMsg: '您好，目前暂无聊天历史记录。',
        time: '刚刚',
        unread: 0
      }));
      return res.json({ code: 200, data: emptyUsers });
    }
    
    res.json({ code: 200, data: users });
  } catch (error) {
    console.error('Admin Get IM Users Error:', error);
    res.status(500).json({ code: 500, message: '获取会话列表失败' });
  }
});

// 2) 获取与特定患者的聊天记录
app.get('/api/admin/im/messages', authenticateToken, async (req, res) => {
  const { patient_id } = req.query;
  if (!patient_id) {
    return res.status(400).json({ code: 400, message: '患者ID不能为空' });
  }
  try {
    const messages = await query(`
      SELECT id, sender, sender_name as senderName, text, is_read as isRead, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as time
      FROM im_messages
      WHERE patient_id = ?
      ORDER BY created_at ASC`,
      [patient_id]
    );

    // 标记已读
    await run(`UPDATE im_messages SET is_read = 1 WHERE patient_id = ? AND sender = 'patient'`, [patient_id]);
    
    res.json({ code: 200, data: messages });
  } catch (error) {
    console.error('Admin Get IM Messages Error:', error);
    res.status(500).json({ code: 500, message: '获取消息历史失败' });
  }
});

// 3) 管理后台发送消息给患者
app.post('/api/admin/im/send', authenticateToken, async (req, res) => {
  const { patient_id, text } = req.body;
  if (!patient_id || !text) {
    return res.status(400).json({ code: 400, message: '患者ID或消息内容不能为空' });
  }
  try {
    const adminUser = req.user;
    const senderName = adminUser ? adminUser.name || '客服助理' : '客服助理';

    await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) VALUES (?, 'doctor', ?, ?, 1)`,
      [patient_id, senderName, text]
    );
    await logAdminAction(req.user.id, 'send_im_message', 'patient', patient_id, { textLength: text.length });

    res.json({ code: 200, message: '发送成功' });
  } catch (error) {
    console.error('Admin Send IM Error:', error);
    res.status(500).json({ code: 500, message: '发送失败' });
  }
});

// 获取系统设置 API
app.get('/api/admin/settings', authenticateToken, async (req, res) => {
  try {
    const rows = await query('SELECT key_name, key_value FROM system_settings');
    const settings = {};
    rows.forEach(row => {
      let val = row.key_value;
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
      settings[row.key_name] = val;
    });
    res.json({ code: 200, data: settings });
  } catch (error) {
    console.error('Get Settings Error:', error);
    res.status(500).json({ code: 500, message: '获取设置失败' });
  }
});

// 保存系统设置 API
app.post('/api/admin/settings', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    await transaction(async (conn) => {
      for (const [key, val] of Object.entries(updates)) {
        let strVal = String(val);
        if (key === 'distribution_settle_days') {
          const days = Number(val);
          if (!Number.isInteger(days) || days < 0 || days > 365) {
            const err = new Error('分销佣金结算天数需为0-365之间的整数');
            err.statusCode = 400;
            throw err;
          }
          strVal = String(days);
        }
        await conn.execute(
          'INSERT INTO system_settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?',
          [key, strVal, strVal]
        );
      }
    });
    await logAdminAction(req.user.id, 'update_settings', 'system', null, { keys: Object.keys(updates) }, req.ip || null);
    res.json({ code: 200, message: '设置保存成功' });
  } catch (error) {
    console.error('Update Settings Error:', error);
    await logAdminAction(req.user.id, 'update_settings', 'system', null, { keys: Object.keys(req.body || {}) }, req.ip || null, 'fail', error.message || '保存设置失败');
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '保存设置失败' });
  }
});

export default app;
