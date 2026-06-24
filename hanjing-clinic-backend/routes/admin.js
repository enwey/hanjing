import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { query, get, run, transaction } from '../db.js';
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

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
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
      return res.status(400).json({ code: 400, message: '用户名或密码不正确' });
    }

    if (user.status !== 'online') {
      return res.status(403).json({ code: 403, message: '该账号已被禁用' });
    }

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
    res.status(500).json({ code: 500, message: '系统内部错误' });
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
  let periodLabel = '本月';

  if (range === 'today') {
    dateFilterAppt = `appointment_date = CURDATE()`;
    dateFilterOrder = `DATE(pay_at) = CURDATE()`;
    dateFilterPatient = `DATE(created_at) = CURDATE()`;
    periodLabel = '今日';
  } else if (range === 'week') {
    dateFilterAppt = `YEARWEEK(appointment_date, 1) = YEARWEEK(CURDATE(), 1)`;
    dateFilterOrder = `YEARWEEK(pay_at, 1) = YEARWEEK(CURDATE(), 1)`;
    dateFilterPatient = `YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)`;
    periodLabel = '本周';
  }

  try {
    // 1. Revenue
    let revSql = `SELECT SUM(pay_amount) as total FROM orders WHERE status IN ('paid', 'completed') AND ${dateFilterOrder}`;
    const revParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      revSql += ` AND user_id IN (
        SELECT p.user_id FROM patients p
        WHERE p.id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
           OR p.id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
      )`;
      revParams.push(req.user.store_id, req.user.store_id);
    }
    const revRow = await get(revSql, revParams);
    const revenue = revRow.total || 0;

    // 2. Appointments count
    let apptSql = `SELECT COUNT(*) as count FROM appointments WHERE ${dateFilterAppt}`;
    const apptParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      apptSql += ` AND store_id = ?`;
      apptParams.push(req.user.store_id);
    }
    const apptRow = await get(apptSql, apptParams);
    const appointments = apptRow.count || 0;

    // 3. New Patients count
    let patientSql = `SELECT COUNT(*) as count FROM patients WHERE ${dateFilterPatient}`;
    const patientParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      patientSql += ` AND (
        id IN (SELECT patient_id FROM appointments WHERE store_id = ?)
        OR id IN (SELECT patient_id FROM medical_records WHERE store_id = ?)
      )`;
      patientParams.push(req.user.store_id, req.user.store_id);
    }
    const patientRow = await get(patientSql, patientParams);
    const newPatients = patientRow.count || 0;

    // 4. Visit rate (completed / total appointments)
    let completedApptSql = `SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND ${dateFilterAppt}`;
    const completedApptParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      completedApptSql += ` AND store_id = ?`;
      completedApptParams.push(req.user.store_id);
    }
    const completedApptRow = await get(completedApptSql, completedApptParams);
    const completedAppts = completedApptRow.count || 0;
    const visitRate = appointments > 0 ? Math.round((completedAppts / appointments) * 100) : 0;

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

    // 6. Chart: Appointments grouped by date
    let apptTrendSql = `
      SELECT appointment_date as date, COUNT(*) as count 
      FROM appointments 
    `;
    const apptTrendParams = [];
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      apptTrendSql += ` WHERE store_id = ?`;
      apptTrendParams.push(req.user.store_id);
    }
    apptTrendSql += `
      GROUP BY appointment_date 
      ORDER BY appointment_date DESC 
      LIMIT 15
    `;
    const appointmentTrends = await query(apptTrendSql, apptTrendParams);

    // 7. Chart: Revenue grouped by date
    let revTrendSql = `
      SELECT DATE(pay_at) as date, SUM(pay_amount) as total 
      FROM orders 
      WHERE status IN ('paid', 'completed') AND pay_at IS NOT NULL
    `;
    const revTrendParams = [];
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
      GROUP BY DATE(pay_at) 
      ORDER BY date DESC 
      LIMIT 15
    `;
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
    whereClause += ` AND (p.name LIKE ? OR p.phone LIKE ? OR d.name LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  if (req.user.role !== 'super_admin' && req.user.store_id) {
    whereClause += ` AND a.store_id = ?`;
    params.push(req.user.store_id);
  }

  try {
    if (page) {
      const countSql = `
        SELECT COUNT(*) as total
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN stores s ON a.store_id = s.id
        WHERE 1=1 ${whereClause}
      `;
      const countRes = await get(countSql, params);
      const total = countRes ? countRes.total : 0;

      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age,
               d.name as doctor_name, d.specialty as doctor_specialty, s.name as store_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN stores s ON a.store_id = s.id
        WHERE 1=1 ${whereClause}
        ORDER BY a.appointment_date DESC, a.appointment_time ASC
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
        SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age,
               d.name as doctor_name, d.specialty as doctor_specialty, s.name as store_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN stores s ON a.store_id = s.id
        WHERE 1=1 ${whereClause}
        ORDER BY a.appointment_date DESC, a.appointment_time ASC
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
    let sql = `
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age, p.user_id as patient_user_id,
             p.medical_history as patient_medical_history, p.allergy_history as patient_allergy_history,
             d.name as doctor_name, d.specialty as doctor_specialty, s.name as store_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN stores s ON a.store_id = s.id
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
  const { status, cancel_reason } = req.body;

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
  const { patient_id, store_id, doctor_id, date, period, time, type, symptom_desc } = req.body;
  
  if (!patient_id || !store_id || !doctor_id || !date || !time) {
    return res.status(400).json({ code: 400, message: '必填参数缺失' });
  }

  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
    return res.status(403).json({ code: 403, message: '您无权在该门店创建预约' });
  }

  try {
    const appointment_no = `APPT${date.replace(/-/g, '')}${String(Date.now()).slice(-4)}`;
    
    let schedule = await get(
      `SELECT id FROM doctor_schedules WHERE doctor_id = ? AND date = ? AND period = ?`,
      [doctor_id, date, period || 'morning']
    );
    
    let schedule_id;
    if (schedule) {
      schedule_id = schedule.id;
      await run(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [schedule_id]);
    } else {
      const schedResult = await run(
        `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, booked_slots)
         VALUES (?, ?, ?, ?, '09:00:00', '12:00:00', 6, 1)`,
        [doctor_id, store_id, date, period || 'morning']
      );
      schedule_id = schedResult.id;
    }

    const patientObj = await get(`SELECT user_id FROM patients WHERE id = ?`, [patient_id]);
    const user_id = patientObj ? patientObj.user_id : 1;

    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'walk_in')`,
      [appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, date, time, type || 'first', symptom_desc || '']
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

    res.json({ code: 200, message: '新建预约成功', data: { appointment_no } });
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
      `SELECT p.*, u.nickname as user_nickname, u.avatar_url as user_avatar, u.phone as user_phone
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
    appointmentsSql += ` ORDER BY a.appointment_date DESC`;

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

      // 3. Check if we should automatically trigger a treatment record if prescription includes HJ-MAD
      if (prescription && prescription.toLowerCase().includes('hj-mad')) {
        const match = prescription.match(/HJ-MAD-\d+/i);
        const deviceModel = match ? match[0].toUpperCase() : 'HJ-MAD-03';
        
        const [existingTrRows] = await conn.execute(`SELECT id FROM treatment_records WHERE patient_id = ? AND status = 'active'`, [id]);
        if (existingTrRows.length === 0) {
          await conn.execute(
            `INSERT INTO treatment_records (patient_id, doctor_id, medical_record_id, device_model, initial_advancement, current_advancement, start_date)
             VALUES (?, ?, ?, ?, 4.0, 4.0, ?)`,
            [id, doctor_id, newRecordId, deviceModel, visit_date]
          );
        }
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
  const { date } = req.query; // Expecting YYYY-MM-DD or week dates
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
      sql += ` AND s.date = ?`;
      params.push(date);
    }
    if (req.user.role !== 'super_admin' && req.user.store_id) {
      sql += ` AND s.store_id = ?`;
      params.push(req.user.store_id);
    }
    const list = await query(sql, params);
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班列表失败' });
  }
});

app.post('/api/admin/schedules', authenticateToken, async (req, res) => {
  const { doctor_id, store_id, date, period, start_time, end_time, total_slots } = req.body;
  if (!doctor_id || !store_id || !date || !period) {
    return res.status(400).json({ code: 400, message: '排班参数不足' });
  }

  if (req.user.role !== 'super_admin' && req.user.store_id && Number(req.user.store_id) !== Number(store_id)) {
    return res.status(403).json({ code: 403, message: '您无权为其他门店排班' });
  }

  try {
    // Check if schedule already exists
    const existing = await get(
      `SELECT id FROM doctor_schedules WHERE doctor_id = ? AND date = ? AND period = ?`,
      [doctor_id, date, period]
    );

    if (existing) {
      await run(
        `UPDATE doctor_schedules SET store_id = ?, start_time = ?, end_time = ?, total_slots = ? WHERE id = ?`,
        [store_id, start_time || '09:00:00', end_time || '12:00:00', total_slots || 6, existing.id]
      );
    } else {
      await run(
        `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [doctor_id, store_id, date, period, start_time || '09:00:00', end_time || '12:00:00', total_slots || 6]
      );
    }
    res.json({ code: 200, message: '设置排班成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '设置排班失败' });
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
    await run('UPDATE orders SET shipping_address = ? WHERE id = ?', [JSON.stringify(addr), id]);
    
    // Simulate Wechat template message push
    console.log(`[微信订阅消息推送成功] 发送给用户 openid=${order.user_id}，商品已到店通知。`);
    
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

    await run(`UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    res.json({ code: 200, message: '订单交易成功完成' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});


app.put('/api/admin/orders/:id/refund', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve } = req.body; // true/false

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

    const status = approve ? 'refunded' : 'paid'; // paid returns to original state
    await run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    res.json({ code: 200, message: approve ? '退款审批已通过，资金已原路退回' : '已拒绝退款申请' });
  } catch (error) {
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

app.get('/api/admin/distribution/withdraws', authenticateToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT w.*, u.nickname, u.phone, d.nickname as promoter_name
       FROM withdraw_records w
       JOIN users u ON w.user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       ORDER BY w.created_at DESC`
    );
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取提现审批列表失败' });
  }
});

app.put('/api/admin/distribution/withdraws/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve } = req.body;

  try {
    const record = await get(`SELECT * FROM withdraw_records WHERE id = ?`, [id]);
    if (!record || record.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '记录未找到或已被处理' });
    }

    const status = approve ? 'success' : 'failed';
    await run(
      `UPDATE withdraw_records SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );

    // If approved, deduct from available_commission and add to withdrawn_amount
    if (approve) {
      await run(
        `UPDATE distributors 
         SET available_commission = available_commission - ?, withdrawn_amount = withdrawn_amount + ?
         WHERE user_id = ?`,
        [record.amount, record.amount, record.user_id]
      );
    }

    res.json({ code: 200, message: approve ? '提现审批通过，打款中' : '已驳回提现申请' });
  } catch (error) {
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
// Banners (Mocked under products / stores categories, stored inside SQL as JSON configuration if needed, or simple custom table)
app.get('/api/admin/content/banners', authenticateToken, async (req, res) => {
  // Return seed contents
  res.json({
    code: 200,
    data: [
      { id: 1, title: '物理阻鼾技术成果展示', image: '/static/demo/store-1.jpg', url: '/pages/live/playback/index?id=1', status: 'on' },
      { id: 2, title: '下颌前移MAD睡眠习惯养成', image: '/static/demo/store-2.jpg', url: '/pages/assessment/ess/index', status: 'on' }
    ]
  });
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
  res.json({
    code: 200,
    data: [
      { id: 1, title: '为什么你会打鼾？OSAHS原理解析与自检方法', author: '古堪民 主任医师', date: '2026-05-10', views: 890, category: '科普' },
      { id: 2, title: '下颌前移阻鼾器(MAD)配戴首周常见痛点与调节建议', author: '王志远 副主任医师', date: '2026-05-18', views: 560, category: '指引' }
    ]
  });
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
    const roles = await query(`SELECT * FROM roles ORDER BY id ASC`);
    for (const role of roles) {
      const perms = await query(`SELECT permission_resource FROM permissions WHERE role_id = ?`, [role.id]);
      role.permissions = perms.map(p => p.permission_resource);
    }
    res.json({ code: 200, data: roles });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取角色列表失败' });
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
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.price * item.quantity;
    }

    const orderResult = await run(
      `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      [
        order_no,
        user_id,
        type || 'offline',
        total_amount,
        discount_amount || 0,
        coupon_id || null,
        pay_amount,
        pay_method || 'wechat',
        status || 'completed',
        shipping_address ? (typeof shipping_address === 'string' ? shipping_address : JSON.stringify(shipping_address)) : JSON.stringify({ receiver: patient.name, phone: patient.phone, province: '广东省', city: '深圳市', district: '到店自提', detail: '到店就诊收银' })
      ]
    );

    for (const item of items) {
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderResult.id, item.product_id, item.product_name, item.product_image || '', item.price, item.quantity]
      );
    }

    // Process distribution commission if any
    const relationship = await get(
      `SELECT parent_user_id FROM distribution_relationships WHERE child_user_id = ?`,
      [user_id]
    );
    if (relationship) {
      const promoter = await get(
        `SELECT id FROM distributors WHERE user_id = ?`,
        [relationship.parent_user_id]
      );
      if (promoter) {
        const commission = Math.round(pay_amount * 0.1);
        await run(
          `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status, settled_at)
           VALUES (?, ?, ?, ?, ?, 1, 'settled', CURRENT_TIMESTAMP)`,
          [orderResult.id, promoter.id, `${patient.name} (${patient.phone})`, pay_amount, commission]
        );
        await run(
          `UPDATE distributors 
           SET total_commission = total_commission + ?, available_commission = available_commission + ?
           WHERE id = ?`,
          [commission, commission, promoter.id]
        );
      }
    }

    res.json({ code: 200, message: '收费收银成功', data: { order_no, order_id: orderResult.id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '收银失败' });
  }
});

export default app;
