import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { query, get, run, transaction, autoUpdateExpiredAppointments } from '../db.js';
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
      `SELECT u.*, r.name as role_name, r.code as role_code 
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
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

    // Reset failed attempts
    failedAttempts.delete(username);

    // Update last login
    await run(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    // Write audit log
    await logAdminAction(user.id, 'login', 'admin', user.id, { username: user.username });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_code, store_id: user.store_id },
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
          store_id: user.store_id
        }
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ code: 500, message: '系统内部错误，请稍后再试' });
  }
});

app.post('/api/admin/sms-login', async (req, res) => {
  const { phone, smsCode } = req.body;
  if (!phone || !smsCode) {
    return res.status(400).json({ code: 400, message: '手机号和验证码不能为空' });
  }

  try {
    const user = await get(
      `SELECT u.*, r.name as role_name, r.code as role_code 
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.phone = ? LIMIT 1`,
      [phone]
    );

    if (!user) {
      return res.status(400).json({ code: 400, message: '该手机号未绑定管理员账号' });
    }

    if (user.status !== 'online') {
      return res.status(403).json({ code: 403, message: '该账号已被禁用' });
    }

    // Update last login
    await run(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    // Write audit log
    await logAdminAction(user.id, 'login', 'admin', user.id, { username: user.username, method: 'sms' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_code, store_id: user.store_id },
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
          store_id: user.store_id
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
      `SELECT u.id, u.username, u.name, u.phone, u.store_id, r.name as role_name, r.code as role_code 
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    res.json({ code: 200, data: user });
  } catch (error) {
    res.status(500).json({ code: 500, message: '系统错误' });
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
    let revSql = `SELECT SUM(pay_amount) as total FROM orders WHERE status IN ('paid', 'completed') AND ${dateFilterOrder}`;
    let prevRevSql = `SELECT SUM(pay_amount) as total FROM orders WHERE status IN ('paid', 'completed') AND ${prevDateFilterOrder}`;
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
    let completedApptSql = `SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND ${dateFilterAppt}`;
    let prevCompletedApptSql = `SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND ${prevDateFilterAppt}`;
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

    if (depts.length === 0) {
      depts.push(
        { name: '睡眠呼吸科', percent: 40, color: '#3B6BF5' },
        { name: '耳鼻喉科', percent: 30, color: '#5A85F5' },
        { name: '口腔科', percent: 20, color: '#1A9D5C' },
        { name: '心理科', percent: 10, color: '#F5A623' }
      );
    }

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
        WHERE status IN ('paid', 'completed') AND DATE(pay_at) = CURDATE()
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
        WHERE status IN ('paid', 'completed') AND YEARWEEK(pay_at, 1) = YEARWEEK(CURDATE(), 1)
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
        WHERE status IN ('paid', 'completed') 
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
  const { date, tab, search } = req.query;
  const page = req.query.page ? parseInt(req.query.page, 10) : null;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10;

  let whereClause = '';
  const params = [];

  if (date) {
    whereClause += ` AND a.appointment_date = ?`;
    params.push(date);
  }

  if (tab === 'today') {
    if (!date) {
      whereClause += ` AND a.appointment_date = '2026-05-29'`;
    }
  } else if (tab === 'week') {
    whereClause += ` AND a.appointment_date >= '2026-05-25' AND a.appointment_date <= '2026-05-31'`;
  }

  if (search) {
    whereClause += ` AND (p.name LIKE ? OR p.phone LIKE ? OR a.doctor_name LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  if (req.user.role !== 'super_admin' && req.user.store_id) {
    whereClause += ` AND a.store_id = ?`;
    params.push(req.user.store_id);
  }

  try {
    await autoUpdateExpiredAppointments();
    if (page) {
      const countSql = `
        SELECT COUNT(*) as total
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${whereClause}
      `;
      const countRes = await get(countSql, params);
      const total = countRes ? countRes.total : 0;

      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${whereClause}
        ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const list = await query(dataSql, params);
      const maskedList = list.map(item => ({
        ...item,
        patient_phone: maskPhone(item.patient_phone)
      }));

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
        SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE 1=1 ${whereClause}
        ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
      `;
      const list = await query(dataSql, params);
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
  try {
    await autoUpdateExpiredAppointments();
    let sql = `
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age, p.user_id as patient_user_id,
             p.medical_history as patient_medical_history, p.allergy_history as patient_allergy_history
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
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
    const appt = await get(sql, params);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }
    appt.patient_phone = maskPhone(appt.patient_phone);
    const preExam = await get('SELECT * FROM appointment_pre_exams WHERE appointment_id = ?', [appt.id]);
    appt.pre_exam = preExam || null;
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

    if (date || time || doctor_id || store_id) {
      const nextStoreId = Number(store_id || appt.store_id);
      const nextDoctorId = Number(doctor_id || appt.doctor_id);
      const nextDate = date || formatDate(appt.appointment_date);
      const nextTime = time || appt.appointment_time;
      const nextPeriod = period || (parseInt(String(nextTime).split(':')[0], 10) < 12 ? 'morning' : 'afternoon');
      if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== nextStoreId) {
        return res.status(403).json({ code: 403, message: '您无权改约到该门店' });
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

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause += ` AND (p.name LIKE ? OR p.phone LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam);
  }

  if (req.user.role !== 'super_admin' && req.user.store_id) {
    whereClause += ` AND (
      p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
      OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
    )`;
    params.push(req.user.store_id, req.user.store_id);
  }

  try {
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
        SELECT p.*, u.nickname as user_nickname, u.phone as user_phone, 
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as visit_count
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE 1=1 ${whereClause}
        ORDER BY p.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const list = await query(dataSql, params);
      const maskedList = list.map(item => ({
        ...item,
        phone: maskPhone(item.phone),
        user_phone: maskPhone(item.user_phone)
      }));

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
        SELECT p.*, u.nickname as user_nickname, u.phone as user_phone, 
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as visit_count
        FROM patients p
        JOIN users u ON p.user_id = u.id
        WHERE 1=1 ${whereClause}
        ORDER BY p.id DESC
      `;
      const list = await query(dataSql, params);
      const maskedList = list.map(item => ({
        ...item,
        phone: maskPhone(item.phone),
        user_phone: maskPhone(item.user_phone)
      }));
      res.json({ code: 200, data: maskedList });
    }
  } catch (error) {
    console.error('Failed to query patients list:', error);
    res.status(500).json({ code: 500, message: '获取患者列表失败' });
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

    const resultData = await transaction(async (conn) => {
      const [userResult] = await conn.execute(
        `INSERT INTO users (openid, nickname, phone, gender, member_level) VALUES (?, ?, ?, ?, ?)`,
        [openid, name, phone, genderVal, memberLevel]
      );

      const [patientResult] = await conn.execute(
        `INSERT INTO patients (user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, 'self', ?, ?, ?, 0)`,
        [userResult.insertId, name, genderVal, age || null, phone]
      );

      return {
        id: patientResult.insertId,
        name,
        phone,
        gender,
        age,
        level,
        source
      };
    });

    res.json({
      code: 200,
      message: '手动建档成功',
      data: resultData
    });
  } catch (error) {
    console.error('Failed to create patient:', error);
    if (error.message && error.message.includes('UNIQUE')) {
      res.status(400).json({ code: 400, message: '该手机号已在系统中建档' });
    } else {
      res.status(500).json({ code: 500, message: '手动建档失败' });
    }
  }
});


app.get('/api/admin/patients/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的信息' });
  }

  try {
    const patient = await get(
      `SELECT p.*, u.nickname as user_nickname, u.avatar_url as user_avatar, u.phone as user_phone,
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
    appointmentsSql += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC`;

    const appointments = await query(appointmentsSql, appointmentsParams);

    patient.phone = maskPhone(patient.phone);
    patient.user_phone = maskPhone(patient.user_phone);

    res.json({ code: 200, data: { ...patient, appointments } });
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

// Medical Records (病历)
app.get('/api/admin/patients/:id/medical-records', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权访问该患者的病历信息' });
  }

  try {
    let sql = `
       SELECT r.*, d.name as doctor_name, d.title as doctor_title, s.name as store_name
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
    sql += ` ORDER BY r.visit_date DESC`;

    const records = await query(sql, params);
    res.json({ code: 200, data: records });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门诊病历失败' });
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

app.post('/api/admin/appointments/:id/complete-consultation', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { medical_record, treatment, adjustment, follow_up } = req.body;
  if (!medical_record || !medical_record.diagnosis) {
    return res.status(400).json({ code: 400, message: '诊断病历信息不能为空' });
  }

  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(appt.store_id)) {
      return res.status(403).json({ code: 403, message: '您无权完成该门店预约' });
    }
    if (!await verifyPatientAccess(appt.patient_id, req.user)) {
      return res.status(403).json({ code: 403, message: '您无权操作该患者' });
    }

    const result = await transaction(async (conn) => {
      const visitDate = medical_record.visit_date || new Date().toISOString().split('T')[0];
      const doctorId = medical_record.doctor_id || appt.doctor_id;
      const storeId = medical_record.store_id || appt.store_id;

      const [mrResult] = await conn.execute(
        `INSERT INTO medical_records (patient_id, doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appt.patient_id,
          doctorId,
          storeId,
          appt.id,
          visitDate,
          medical_record.diagnosis,
          medical_record.prescription || null,
          medical_record.doctor_advice || null,
          medical_record.note || null
        ]
      );
      const medicalRecordId = mrResult.insertId;

      await conn.execute(
        `UPDATE patients SET medical_history = COALESCE(?, medical_history), allergy_history = COALESCE(?, allergy_history) WHERE id = ?`,
        [medical_record.medical_history || null, medical_record.allergy_history || null, appt.patient_id]
      );

      let treatmentId = treatment && treatment.treatment_id ? treatment.treatment_id : null;
      if (treatment && treatment.create) {
        await conn.execute(`UPDATE treatment_records SET status = 'paused' WHERE patient_id = ? AND status = 'active'`, [appt.patient_id]);
        const [trResult] = await conn.execute(
          `INSERT INTO treatment_records (patient_id, doctor_id, medical_record_id, device_model, initial_advancement, current_advancement, start_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            appt.patient_id,
            doctorId,
            medicalRecordId,
            treatment.device_model,
            treatment.initial_advancement,
            treatment.initial_advancement,
            treatment.start_date || visitDate
          ]
        );
        treatmentId = trResult.insertId;
      }

      if (adjustment && adjustment.create && treatmentId) {
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
    res.status(500).json({ code: 500, message: '结束接诊失败' });
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
      `SELECT * FROM wearing_logs WHERE treatment_id = ? ORDER BY date DESC LIMIT 30`,
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

    res.json({ code: 200, data: { ...tr, logs, adjustments } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取阻鼾器治疗建档信息失败' });
  }
});

app.post('/api/admin/patients/:id/treatment', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctor_id, device_model, initial_advancement, start_date } = req.body;

  if (!await verifyPatientAccess(id, req.user)) {
    return res.status(403).json({ code: 403, message: '您无权为该患者进行治疗建档' });
  }

  try {
    // Deactivate previous active treatments
    await run(`UPDATE treatment_records SET status = 'paused' WHERE patient_id = ? AND status = 'active'`, [id]);

    const result = await run(
      `INSERT INTO treatment_records (patient_id, doctor_id, device_model, initial_advancement, current_advancement, start_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [id, doctor_id, device_model, initial_advancement, initial_advancement, start_date]
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
app.get('/api/admin/doctors', authenticateToken, async (req, res) => {
  try {
    let sql = `SELECT * FROM doctors`;
    const params = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` WHERE id IN (SELECT doctor_id FROM doctor_store_mapping WHERE store_id = ?)`;
      params.push(req.user.store_id);
    }
    sql += ` ORDER BY id ASC`;
    const list = await query(sql, params);
    const formatted = [];
    for (const d of list) {
      let consultSql = `SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ?`;
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
      let rating = 5.0;
      if (reviewRow && reviewRow.avg_rating !== null) {
        rating = Math.round(Number(reviewRow.avg_rating) * 10) / 10;
      }

      formatted.push({
        ...d,
        consult_count: consultCount,
        review_count: reviewCount,
        rating: rating
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
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise, experience_years, experienceYears } = req.body;
  if (!name || !title || !specialty) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（姓名、职称、科室）' });
  }

  const expYears = experience_years !== undefined ? Number(experience_years) : (experienceYears !== undefined ? Number(experienceYears) : 0);

  try {
    const result = await run(
      `INSERT INTO doctors (name, title, specialty, hospital, intro, consult_fee, status, avatar_url, expertise, experience_years)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, '/static/demo/doctor-4.jpg', expertise ? JSON.stringify(expertise) : null, expYears]
    );
    res.json({ code: 200, message: '添加医生成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加医生失败' });
  }
});

app.put('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可执行此操作' });
  }
  const { id } = req.params;
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise, experience_years, experienceYears } = req.body;

  const expYears = experience_years !== undefined ? Number(experience_years) : (experienceYears !== undefined ? Number(experienceYears) : 0);

  try {
    await run(
      `UPDATE doctors 
       SET name = ?, title = ?, specialty = ?, hospital = ?, intro = ?, consult_fee = ?, status = ?, expertise = ?, experience_years = ?
       WHERE id = ?`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, expertise ? JSON.stringify(expertise) : null, expYears, id]
    );
    res.json({ code: 200, message: '编辑医生成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '编辑医生失败' });
  }
});

app.delete('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可执行此操作' });
  }
  const { id } = req.params;
  try {
    const doctor = await get(`SELECT * FROM doctors WHERE id = ?`, [id]);
    await run(`DELETE FROM doctors WHERE id = ?`, [id]);
    
    if (doctor) {
      await logAdminAction(req.user.id, 'delete_doctor', 'doctor', id, { name: doctor.name, title: doctor.title });
    }
    
    res.json({ code: 200, message: '删除医生成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除医生失败' });
  }
});

// Schedules
app.get('/api/admin/schedules', authenticateToken, async (req, res) => {
  const { date, doctor_id } = req.query; // Expecting YYYY-MM-DD, YYYY-MM or week dates
  try {
    let sql = `
      SELECT s.*, d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, st.name as store_name
      FROM doctor_schedules s
      JOIN doctors d ON s.doctor_id = d.id
      JOIN stores st ON s.store_id = st.id
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
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` AND s.store_id = ?`;
      params.push(req.user.store_id);
    }
    const list = await query(sql, params);
    const formattedList = list.map(item => ({
      ...item,
      date: item.date instanceof Date ? 
        `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}-${String(item.date.getDate()).padStart(2, '0')}` : 
        String(item.date).slice(0, 10)
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
    res.json({ code: 200, message: '设置排班成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '设置排班失败' });
  }
});

app.post('/api/admin/schedules/batch', authenticateToken, async (req, res) => {
  const { doctor_id, list } = req.body;
  if (!doctor_id || !Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ code: 400, message: '排班参数不足' });
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

    res.json({ code: 200, message: '批量保存排班成功' });
  } catch (error) {
    console.error('Batch schedule save error:', error);
    res.status(400).json({ code: 400, message: error.message || '批量保存排班失败' });
  }
});

app.post('/api/admin/schedules/copy-last-month', authenticateToken, async (req, res) => {
  const { doctor_id, year, month } = req.body;
  if (!doctor_id || !year || !month) {
    return res.status(400).json({ code: 400, message: '医生和目标月份为必填项' });
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
      
      allBookingCounts = await query(`SELECT store_id, COUNT(*) as count FROM appointments WHERE store_id IN (${placeholders}) GROUP BY store_id`, storeIds);
      
      allRevenueStats = await query(`
        SELECT a.store_id, SUM(d.consult_fee) as total 
        FROM appointments a 
        JOIN doctors d ON a.doctor_id = d.id 
        WHERE a.store_id IN (${placeholders}) AND a.status = 'completed'
        GROUP BY a.store_id
      `, storeIds);
      
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

      const deviceCount = deviceCountsMap[store.id] || 0;
      const defaultDevices = store.id === 1 ? 8 : (store.id === 2 ? 4 : 10);
      store.devices = deviceCount > 0 ? deviceCount : defaultDevices;

      store.monthBookings = bookingCountsMap[store.id] || 0;

      const totalConsultFee = revenueMap[store.id] || 0;
      const revenueAmount = (totalConsultFee * 250) + (store.id * 35000); 
      store.monthRevenue = `¥${(revenueAmount / 10000).toFixed(1)}w`;

      const defaultManager = store.id === 1 ? '陈经理' : (store.id === 2 ? '张经理' : '赵经理');
      store.manager = managersMap[store.id] || defaultManager;
    }
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
});

app.post('/api/admin/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '只有系统管理员可新建门店' });
  }
  const { name, code, address, city, district, phone, open_time, close_time, status, features, hours } = req.body;

  try {
    let mainOpen = open_time || '09:00:00';
    let mainClose = close_time || '18:00:00';
    if (hours && hours.length > 0) {
      mainOpen = hours[0].openTime + ':00';
      mainClose = hours[0].closeTime + ':00';
    }

    const result = await run(
      `INSERT INTO stores (name, code, address, city, district, phone, open_time, close_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code, address, city || '', district || '', phone || '', mainOpen, mainClose, status || 'open']
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

    res.json({ code: 200, message: '添加门店成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加门店失败' });
  }
});

app.put('/api/admin/stores/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(id)) {
    return res.status(403).json({ code: 403, message: '您无权修改其他门店的信息' });
  }
  const { name, address, phone, status, features, hours } = req.body;

  try {
    let mainOpen = '09:00:00';
    let mainClose = '18:00:00';
    if (hours && hours.length > 0) {
      mainOpen = hours[0].openTime + ':00';
      mainClose = hours[0].closeTime + ':00';
    }

    await run(
      `UPDATE stores SET name = ?, address = ?, phone = ?, status = ?, open_time = ?, close_time = ? WHERE id = ?`,
      [name, address, phone, status, mainOpen, mainClose, id]
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
      `SELECT o.*, p.name as patient_name,
              GROUP_CONCAT(oi.product_name SEPARATOR '、') as product_names
       FROM orders o
       LEFT JOIN patients p ON o.patient_id = p.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status IN ('refund_pending', 'refunded')
       GROUP BY o.id
       ORDER BY o.updated_at DESC, o.created_at DESC
       LIMIT 200`
    );
    res.json({
      code: 200,
      data: list.map(order => ({
        id: order.id,
        refundNo: `RF${String(order.order_no || order.id).replace(/\D/g, '').slice(-12)}`,
        orderNo: order.order_no,
        patient: order.patient_name || '患者',
        product: order.product_names || '订单商品',
        amount: order.pay_amount,
        reason: '用户申请退款',
        applyTime: order.updated_at || order.created_at,
        status: order.status === 'refunded' ? 'approved' : 'pending'
      }))
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取退款列表失败' });
  }
});

app.get('/api/admin/orders/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let sql = `
      SELECT o.*, u.nickname as user_name, u.phone as user_phone
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
    order.items = items;
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

    await run(`UPDATE orders SET status = 'shipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    res.json({ code: 200, message: '发货成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败' });
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

    await transaction(async (conn) => {
      await conn.execute(`UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      const commissions = await query(
        `SELECT distributor_id, commission_amount FROM distribution_orders WHERE order_id = ? AND status = 'pending'`,
        [id]
      );
      for (const commission of commissions) {
        await conn.execute(
          `UPDATE distribution_orders SET status = 'settled', settled_at = CURRENT_TIMESTAMP WHERE order_id = ? AND distributor_id = ?`,
          [id, commission.distributor_id]
        );
        await conn.execute(
          `UPDATE distributors SET available_commission = available_commission + ? WHERE id = ?`,
          [commission.commission_amount, commission.distributor_id]
        );
      }
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '订单已完成', ?)`,
        [order.user_id, `您的订单 ${order.order_no} 已完成。`]
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

    await transaction(async (conn) => {
      const status = approve ? 'refunded' : 'paid';
      await conn.execute(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);

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
             (SELECT COUNT(*) FROM distribution_relationships WHERE parent_user_id = d.user_id) as invitees_count
       FROM distributors d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取推广员列表失败' });
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
      `SELECT do.*, d.nickname as promoter_name, o.order_no, p.name as patient_name,
              GROUP_CONCAT(pr.name SEPARATOR '、') as product_names
       FROM distribution_orders do
       JOIN distributors d ON do.distributor_user_id = d.user_id
       LEFT JOIN orders o ON do.order_id = o.id
       LEFT JOIN patients p ON o.patient_id = p.id
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

app.get('/api/admin/distribution/products', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT id, name, category, image_url, price, description, stock, sales_count,
              is_distribution, commission_rate, status, created_at
       FROM products
       ORDER BY is_distribution DESC, id DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取推广商品失败' });
  }
});

app.post('/api/admin/distribution/products', authenticateToken, async (req, res) => {
  const { name, description, price, commission_rate, status, category, image_url, stock } = req.body;
  if (!name || !price) {
    return res.status(400).json({ code: 400, message: '商品名称和价格为必填项' });
  }
  try {
    const result = await run(
      `INSERT INTO products (name, category, image_url, price, description, stock, is_distribution, commission_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        name,
        category || 'service',
        image_url || '/static/products/default.png',
        Number(price),
        description || '',
        Number(stock || 0),
        Number(commission_rate || 0),
        status === 'on' ? 'on' : 'off'
      ]
    );
    await logAdminAction(req.user.id, 'create_distribution_product', 'product', result.id, { name });
    res.json({ code: 200, message: '添加推广商品成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加推广商品失败' });
  }
});

app.put('/api/admin/distribution/products/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const product = await get(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!product) {
    return res.status(404).json({ code: 404, message: '商品不存在' });
  }
  try {
    await run(
      `UPDATE products
       SET name = ?, category = ?, image_url = ?, price = ?, description = ?, stock = ?,
           is_distribution = ?, commission_rate = ?, status = ?
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
        id
      ]
    );
    await logAdminAction(req.user.id, 'update_distribution_product', 'product', id, { status: req.body.status });
    res.json({ code: 200, message: '保存推广商品成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存推广商品失败' });
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
  const { title, cover_url, anchor_name, status, start_time, replay_url, product_ids } = req.body;
  try {
    const result = await run(
      `INSERT INTO live_rooms (title, cover_url, anchor_name, status, start_time, replay_url, product_ids, anchor_avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, cover_url || '/static/demo/store-3.jpg', anchor_name, status || 'upcoming', start_time, replay_url || '', JSON.stringify(product_ids || []), '/static/demo/doctor-1.jpg']
    );
    res.json({ code: 200, message: '添加直播成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加失败' });
  }
});

app.put('/api/admin/content/live-rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, cover_url, anchor_name, status, start_time, replay_url, product_ids } = req.body;
  try {
    await run(
      `UPDATE live_rooms 
       SET title = ?, cover_url = ?, anchor_name = ?, status = ?, start_time = ?, replay_url = ?, product_ids = ?
       WHERE id = ?`,
      [title, cover_url, anchor_name, status, start_time, replay_url || '', JSON.stringify(product_ids || []), id]
    );
    res.json({ code: 200, message: '编辑成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '编辑失败' });
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
      `SELECT p.id, p.title, p.content, p.tags, p.likes_count, p.comments_count,
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

app.post('/api/admin/content/articles', authenticateToken, async (req, res) => {
  const { title, content, tags = [], status = 'pending' } = req.body;
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
      `INSERT INTO community_posts (user_id, user_role, title, content, tags, status)
       VALUES (?, 'admin', ?, ?, ?, ?)`,
      [author.id, title, content, JSON.stringify(tags), status === 'draft' ? 'pending' : status]
    );
    await logAdminAction(req.user.id, 'create_article', 'community_post', result.id, { title, status });
    res.json({ code: 200, message: '保存文章成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存文章失败' });
  }
});

app.put('/api/admin/content/articles/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, is_top } = req.body;
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
       SET status = COALESCE(?, status), is_top = COALESCE(?, is_top)
       WHERE id = ?`,
      [status ?? null, typeof is_top === 'boolean' ? (is_top ? 1 : 0) : null, id]
    );
    await logAdminAction(req.user.id, 'update_article', 'community_post', id, { status, is_top });
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
      `SELECT u.id, u.username, u.name, u.phone, u.status, u.role_id, u.store_id, u.last_login_at, u.created_at,
             r.name as role_name, s.name as store_name
       FROM admin_users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN stores s ON u.store_id = s.id
       ORDER BY u.id ASC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取账号列表失败' });
  }
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
  const { username, name, phone, role_id, store_id, password } = req.body;
  if (!username || !role_id || !password) {
    return res.status(400).json({ code: 400, message: '用户名、角色和密码为必填项' });
  }

  try {
    const passwordHash = hashPassword(password);
    const result = await run(
      `INSERT INTO admin_users (username, password_hash, name, phone, role_id, store_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'online')`,
      [username, passwordHash, name || '', phone || '', role_id, store_id || null]
    );
    res.json({ code: 200, message: '创建账号成功', data: { id: result.id } });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ code: 400, message: '用户名已存在' });
    } else {
      res.status(500).json({ code: 500, message: '创建账号失败' });
    }
  }
});

app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, phone, role_id, store_id, status, password } = req.body;

  try {
    if (password) {
      const passwordHash = hashPassword(password);
      await run(
        `UPDATE admin_users 
         SET name = ?, phone = ?, role_id = ?, store_id = ?, status = ?, password_hash = ? 
         WHERE id = ?`,
        [name || '', phone || '', role_id, store_id || null, status || 'online', passwordHash, id]
      );
    } else {
      await run(
        `UPDATE admin_users 
         SET name = ?, phone = ?, role_id = ?, store_id = ?, status = ?
         WHERE id = ?`,
        [name || '', phone || '', role_id, store_id || null, status || 'online', id]
      );
    }
    res.json({ code: 200, message: '修改账号成功' });
  } catch (error) {
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
  const { name, code, description, status, permissions = [] } = req.body;
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
      return { id: roleId };
    });
    await logAdminAction(req.user.id, 'create_role', 'role', result.id, { name, roleCode });
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
    });
    await logAdminAction(req.user.id, 'update_role', 'role', id, { name: req.body.name, status: req.body.status });
    res.json({ code: 200, message: '保存角色成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '保存角色失败' });
  }
});

app.get('/api/admin/logs', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at,
              u.username, u.name as operator_name, r.name as role_name
       FROM audit_logs l
       LEFT JOIN admin_users u ON l.admin_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       ORDER BY l.created_at DESC
       LIMIT 500`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取操作日志失败' });
  }
});

// Pre-exam vitals routes
app.post('/api/admin/appointments/:id/pre-exam', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { height, weight, systolicBp, diastolicBp, neckCircumference, bmi } = req.body;
  try {
    const existing = await get('SELECT id FROM appointment_pre_exams WHERE appointment_id = ?', [id]);
    if (existing) {
      await run(
        `UPDATE appointment_pre_exams 
         SET height = ?, weight = ?, systolic_bp = ?, diastolic_bp = ?, neck_circumference = ?, bmi = ?
         WHERE appointment_id = ?`,
        [height, weight, systolicBp, diastolicBp, neckCircumference, bmi, id]
      );
    } else {
      await run(
        `INSERT INTO appointment_pre_exams (appointment_id, height, weight, systolic_bp, diastolic_bp, neck_circumference, bmi)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, height, weight, systolicBp, diastolicBp, neckCircumference, bmi]
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
    const data = await get('SELECT * FROM appointment_pre_exams WHERE appointment_id = ?', [id]);
    res.json({ code: 200, data });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取体征信息失败' });
  }
});

// Bind distributor to patient
app.post('/api/admin/patients/:id/bind-promoter', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { promoter_user_id } = req.body;
  try {
    const patient = await get('SELECT user_id FROM patients WHERE id = ?', [id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者不存在' });
    }
    const child_user_id = patient.user_id;
    const existing = await get('SELECT id FROM distribution_relationships WHERE child_user_id = ?', [child_user_id]);
    if (existing) {
      await run('UPDATE distribution_relationships SET parent_user_id = ? WHERE child_user_id = ?', [promoter_user_id, child_user_id]);
    } else {
      await run('INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, 1)', [promoter_user_id, child_user_id]);
    }
    res.json({ code: 200, message: '绑定推广人成功' });
  } catch (error) {
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
      total_amount += product.price * quantity;
      validatedItems.push({ product, quantity, price: product.price });
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

    const allowedStatus = ['completed', 'processing', 'shipping', 'paid'];
    const orderStatus = allowedStatus.includes(status) ? status : 'completed';
    const orderId = await transaction(async (conn) => {
      const [orderResult] = await conn.execute(
        `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [
          order_no,
          user_id,
          type || 'offline',
          total_amount,
          discount,
          coupon_id || null,
          calculatedPayAmount,
          pay_method || 'wechat',
          orderStatus,
          shipping_address ? (typeof shipping_address === 'string' ? shipping_address : JSON.stringify(shipping_address)) : JSON.stringify({ receiver: patient.name, phone: patient.phone, province: '广东省', city: '深圳市', district: '到店自提', detail: '到店就诊收银' })
        ]
      );
      const insertedId = orderResult.insertId;

      for (const item of validatedItems) {
        await conn.execute(
          `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [insertedId, item.product.id, item.product.name, item.product.image_url || '', item.price, item.quantity]
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
          const commissionBase = validatedItems.reduce((sum, item) => {
            const rate = Number(item.product.commission_rate || 0);
            return sum + Math.round(item.price * item.quantity * rate / 100);
          }, 0);

          let commission = commissionBase;
          if (commissionBase <= 0) {
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

    await logAdminAction(req.user.id, 'create_cashier_order', 'order', orderId, { orderNo: order_no, amount: calculatedPayAmount });
    res.json({ code: 200, message: '收费收银成功', data: { order_no, order_id: orderId, pay_amount: calculatedPayAmount } });
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
    const pendingOrders = await get(`SELECT COUNT(*) as count FROM orders WHERE status = 'paid'`);
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
        const strVal = String(val);
        await conn.execute(
          'INSERT INTO system_settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?',
          [key, strVal, strVal]
        );
      }
    });
    res.json({ code: 200, message: '设置保存成功' });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ code: 500, message: '保存设置失败' });
  }
});

export default app;
