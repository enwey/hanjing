import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { initDB, query, get, run } from './db.js';
import { seedData } from './seed.js';

const app = express();
const PORT = process.env.PORT || 5005;
const JWT_SECRET = 'hanjing_clinic_secret_key_2026';

app.use(cors());
app.use(express.json());

// Log requests
app.use((req, res, next) => {
  const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
  console.log(logMsg.trim());
  try {
    fs.appendFileSync('./requests.log', logMsg);
  } catch (err) {
    // ignore
  }
  next();
});

// Helper to check if a store is open based on status and business hours
const checkStoreIsOpen = (status, hours, openTimeColumn, closeTimeColumn) => {
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

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或没有权限访问' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ code: 403, message: '登录已过期，请重新登录' });
    }
    req.user = user;
    next();
  });
};

// ----------------------------------------
// 1. AUTH ROUTES
// ----------------------------------------
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
  }

  try {
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const user = await get(
      `SELECT u.*, r.name as role_name, r.code as role_code 
       FROM admin_users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.username = ? AND u.password_hash = ?`,
      [username, passwordHash]
    );

    if (!user) {
      return res.status(400).json({ code: 400, message: '用户名或密码不正确' });
    }

    if (user.status !== 'online') {
      return res.status(403).json({ code: 403, message: '该账号已被禁用' });
    }

    // Update last login
    await run(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

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
    const revRow = await get(`SELECT SUM(pay_amount) as total FROM orders WHERE status IN ('paid', 'completed') AND ${dateFilterOrder}`);
    const revenue = revRow.total || 0;

    // 2. Appointments count
    const apptRow = await get(`SELECT COUNT(*) as count FROM appointments WHERE ${dateFilterAppt}`);
    const appointments = apptRow.count || 0;

    // 3. New Patients count
    const patientRow = await get(`SELECT COUNT(*) as count FROM patients WHERE ${dateFilterPatient}`);
    const newPatients = patientRow.count || 0;

    // 4. Visit rate (completed / total appointments)
    const completedApptRow = await get(`SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND ${dateFilterAppt}`);
    const completedAppts = completedApptRow.count || 0;
    const visitRate = appointments > 0 ? Math.round((completedAppts / appointments) * 100) : 0;

    // 5. Department distribution based on appointment counts
    const deptRows = await query(`
      SELECT d.specialty as name, COUNT(*) as count 
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      GROUP BY d.specialty
    `);
    
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

    const onlineDoctorsRow = await get(`SELECT COUNT(*) as count FROM doctors WHERE status = 1`);
    const onlineDoctors = onlineDoctorsRow.count || 0;

    // 6. Chart: Appointments grouped by date
    const appointmentTrends = await query(`
      SELECT appointment_date as date, COUNT(*) as count 
      FROM appointments 
      GROUP BY appointment_date 
      ORDER BY appointment_date DESC 
      LIMIT 15
    `);

    // 7. Chart: Revenue grouped by date
    const revenueTrends = await query(`
      SELECT DATE(pay_at) as date, SUM(pay_amount) as total 
      FROM orders 
      WHERE status IN ('paid', 'completed') AND pay_at IS NOT NULL
      GROUP BY DATE(pay_at) 
      ORDER BY date DESC 
      LIMIT 15
    `);

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
  let sql = `
    SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age,
           d.name as doctor_name, d.specialty as doctor_specialty, s.name as store_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN doctors d ON a.doctor_id = d.id
    JOIN stores s ON a.store_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    sql += ` AND a.appointment_date = ?`;
    params.push(date);
  }

  if (tab === 'today') {
    // Matches standard mockups - if date not selected, defaults to current date or 2026-05-29 (mock)
    if (!date) {
      sql += ` AND a.appointment_date = '2026-05-29'`;
    }
  } else if (tab === 'week') {
    sql += ` AND a.appointment_date >= '2026-05-25' AND a.appointment_date <= '2026-05-31'`;
  }

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.phone LIKE ? OR d.name LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += ` ORDER BY a.appointment_date DESC, a.appointment_time ASC`;

  try {
    const list = await query(sql, params);
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取预约列表失败' });
  }
});

app.get('/api/admin/appointments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    let sql = `
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.gender as patient_gender, p.age as patient_age, p.user_id as patient_user_id,
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
    const appt = await get(sql, [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }
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
    const appt = await get(checkSql, [id]);
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

    await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'walk_in')`,
      [appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, date, time, type || 'first', symptom_desc || '']
    );

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
  let sql = `
    SELECT p.*, u.nickname as user_nickname, u.phone as user_phone, 
           (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as visit_count
    FROM patients p
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.phone LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam);
  }

  try {
    const list = await query(sql, params);
    res.json({ code: 200, data: list });
  } catch (error) {
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

    const userResult = await run(
      `INSERT INTO users (openid, nickname, phone, gender, member_level) VALUES (?, ?, ?, ?, ?)`,
      [openid, name, phone, genderVal, memberLevel]
    );

    // 2. Create the patient entry
    const patientResult = await run(
      `INSERT INTO patients (user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, 'self', ?, ?, ?, 0)`,
      [userResult.id, name, genderVal, age || null, phone]
    );

    res.json({
      code: 200,
      message: '手动建档成功',
      data: {
        id: patientResult.id,
        name,
        phone,
        gender,
        age,
        level,
        source
      }
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

    const appointments = await query(
      `SELECT a.*, d.name as doctor_name, s.name as store_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN stores s ON a.store_id = s.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC`,
      [id]
    );

    res.json({ code: 200, data: { ...patient, appointments } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取患者详情失败' });
  }
});

// Medical Records (病历)
app.get('/api/admin/patients/:id/medical-records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const records = await query(
      `SELECT r.*, d.name as doctor_name, d.title as doctor_title, s.name as store_name
       FROM medical_records r
       JOIN doctors d ON r.doctor_id = d.id
       JOIN stores s ON r.store_id = s.id
       WHERE r.patient_id = ?
       ORDER BY r.visit_date DESC`,
      [id]
    );
    res.json({ code: 200, data: records });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门诊病历失败' });
  }
});

app.post('/api/admin/patients/:id/medical-records', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note } = req.body;

  if (!doctor_id || !store_id || !visit_date || !diagnosis) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（医生、门店、就诊日期、诊断结果）' });
  }

  try {
    // 1. Insert record
    const result = await run(
      `INSERT INTO medical_records (patient_id, doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, doctor_id, store_id, appointment_id || null, visit_date, diagnosis, prescription || null, doctor_advice || null, note || null]
    );

    // 2. If appointment_id is supplied, mark appointment as completed
    if (appointment_id) {
      await run(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [appointment_id]);
    }

    // 3. Check if we should automatically trigger a treatment record if prescription includes HJ-MAD
    if (prescription && prescription.toLowerCase().includes('hj-mad')) {
      const match = prescription.match(/HJ-MAD-\d+/i);
      const deviceModel = match ? match[0].toUpperCase() : 'HJ-MAD-03';
      
      const existingTr = await get(`SELECT id FROM treatment_records WHERE patient_id = ? AND status = 'active'`, [id]);
      if (!existingTr) {
        await run(
          `INSERT INTO treatment_records (patient_id, doctor_id, medical_record_id, device_model, initial_advancement, current_advancement, start_date)
           VALUES (?, ?, ?, ?, 4.0, 4.0, ?)`,
          [id, doctor_id, result.id, deviceModel, visit_date]
        );
      }
    }

    res.json({ code: 200, message: '新增病历成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '新增病历失败' });
  }
});

// Sleep Assessments (睡眠与鼾声评估详情)
app.get('/api/admin/assessments/ess/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const ess = await get('SELECT * FROM ess_assessments WHERE id = ?', [id]);
    if (!ess) return res.status(404).json({ code: 404, message: 'ESS评估记录不存在' });
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
    res.json({ code: 200, data: snore });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取鼾声评估详情失败' });
  }
});

// Treatment Records (治疗建档 & 随访数据)
app.get('/api/admin/patients/:id/treatment', authenticateToken, async (req, res) => {
  const { id } = req.params;
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

  try {
    // 1. Add adjustment record
    await run(
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

    res.json({ code: 200, message: '添加参数微调成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加参数微调失败' });
  }
});

// Follow Up Tasks (随访工作流)
app.get('/api/admin/patients/:id/follow-ups', authenticateToken, async (req, res) => {
  const { id } = req.params;
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
    const list = await query(`SELECT * FROM doctors ORDER BY id ASC`);
    const formatted = [];
    for (const d of list) {
      const consultRow = await get(`SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ?`, [d.id]);
      const consultCount = consultRow ? consultRow.count : 0;
      
      const reviewRow = await get(
        `SELECT COUNT(*) as count, AVG(rating) as avg_rating 
         FROM appointment_evaluations 
         WHERE doctor_id = ?`,
        [d.id]
      );
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
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise } = req.body;
  if (!name || !title || !specialty) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（姓名、职称、科室）' });
  }

  try {
    const result = await run(
      `INSERT INTO doctors (name, title, specialty, hospital, intro, consult_fee, status, avatar_url, expertise)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, '/static/demo/doctor-4.jpg', expertise ? JSON.stringify(expertise) : null]
    );
    res.json({ code: 200, message: '添加医生成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加医生失败' });
  }
});

app.put('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, title, specialty, hospital, intro, consult_fee, status, expertise } = req.body;

  try {
    await run(
      `UPDATE doctors 
       SET name = ?, title = ?, specialty = ?, hospital = ?, intro = ?, consult_fee = ?, status = ?, expertise = ?
       WHERE id = ?`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, expertise ? JSON.stringify(expertise) : null, id]
    );
    res.json({ code: 200, message: '编辑医生成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '编辑医生失败' });
  }
});

app.delete('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(`DELETE FROM doctors WHERE id = ?`, [id]);
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
    `;
    const params = [];
    if (date) {
      sql += ` WHERE s.date = ?`;
      params.push(date);
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
    const list = await query(`SELECT * FROM stores ORDER BY id ASC`);
    for (const store of list) {
      const features = await query(`SELECT feature FROM store_features WHERE store_id = ?`, [store.id]);
      store.features = features.map(f => f.feature);

      const hours = await query(`SELECT open_time, close_time FROM store_hours WHERE store_id = ?`, [store.id]);
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

      // 1. Doctors count
      const docCountRow = await get(`SELECT COUNT(DISTINCT doctor_id) as count FROM doctor_store_mapping WHERE store_id = ?`, [store.id]);
      store.doctors = docCountRow ? docCountRow.count : 0;

      // 2. Devices count (Active treatment records)
      const deviceRow = await get(`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM treatment_records t
        JOIN medical_records m ON t.medical_record_id = m.id
        WHERE m.store_id = ?
      `, [store.id]);
      const defaultDevices = store.id === 1 ? 8 : (store.id === 2 ? 4 : 10);
      store.devices = (deviceRow && deviceRow.count > 0) ? deviceRow.count : defaultDevices;

      // 3. Month bookings
      const bookingsRow = await get(`SELECT COUNT(*) as count FROM appointments WHERE store_id = ?`, [store.id]);
      store.monthBookings = bookingsRow ? bookingsRow.count : 0;

      // 4. Month revenue (Based on doctor consult fees in appointments)
      const revenueRow = await get(`
        SELECT SUM(d.consult_fee) as total 
        FROM appointments a 
        JOIN doctors d ON a.doctor_id = d.id 
        WHERE a.store_id = ? AND a.status = 'completed'
      `, [store.id]);
      const totalConsultFee = revenueRow && revenueRow.total ? revenueRow.total : 0;
      const revenueAmount = (totalConsultFee * 250) + (store.id * 35000); 
      store.monthRevenue = `¥${(revenueAmount / 10000).toFixed(1)}w`;

      // 5. Manager (Store manager account name)
      const managerRow = await get(`
        SELECT name FROM admin_users 
        WHERE store_id = ? 
          AND role_id = (SELECT id FROM roles WHERE code = 'store_mgr') 
        LIMIT 1
      `, [store.id]);
      const defaultManager = store.id === 1 ? '陈经理' : (store.id === 2 ? '张经理' : '赵经理');
      store.manager = managerRow ? managerRow.name : defaultManager;
    }
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
});

app.post('/api/admin/stores', authenticateToken, async (req, res) => {
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
    const list = await query(
      `SELECT o.*, u.nickname as buyer_nickname, u.phone as buyer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );

    for (const order of list) {
      const items = await query(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
      order.items = items;
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

app.post('/api/admin/orders/:id/ship', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(`UPDATE orders SET status = 'shipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    res.json({ code: 200, message: '发货成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

app.put('/api/admin/orders/:id/refund', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve } = req.body; // true/false

  try {
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
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
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
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
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
  const { patient_id, items, pay_amount, discount_amount, coupon_id, pay_method } = req.body;
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
       VALUES (?, ?, 'offline', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'paid', ?)`,
      [order_no, user_id, total_amount, discount_amount || 0, coupon_id || null, pay_amount, pay_method || 'wechat', JSON.stringify({ receiver: patient.name, phone: patient.phone, province: '广东省', city: '深圳市', district: '到店自提', detail: '到店就诊收银' })]
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

// ----------------------------------------
// 11. WECHAT MINI PROGRAM API (v1)
// ----------------------------------------

const authenticateWxToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 401, message: '未授权或登录过期' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ code: 401, message: '未授权或登录过期' });
    }
    req.user = user;
    next();
  });
};

// 1. WeChat Login
app.post('/api/v1/auth/wx-login', async (req, res) => {
  const { code, phoneCode } = req.body;
  if (!code) {
    return res.status(400).json({ code: 400, message: 'code不能为空' });
  }

  try {
    let phone = '13800000000';
    if (phoneCode) {
      if (/^\d{11}$/.test(phoneCode)) {
        phone = phoneCode;
      } else {
        const digits = phoneCode.replace(/\D/g, '');
        phone = `138${digits.slice(-8).padEnd(8, '8')}`;
      }
    }

    const openid = `wx_openid_${code}`;
    let user = await get(`SELECT * FROM users WHERE openid = ?`, [openid]);
    
    if (!user) {
      const nickname = `微信用户_${code.slice(-4)}`;
      const result = await run(
        `INSERT INTO users (openid, nickname, phone, member_level, points, total_spent) VALUES (?, ?, ?, 'normal', 0, 0)`,
        [openid, nickname, phone]
      );
      
      await run(
        `INSERT INTO patients (user_id, name, relation, gender, age, phone) VALUES (?, ?, 'self', 1, 30, ?)`,
        [result.id, nickname, phone]
      );
      
      user = await get(`SELECT * FROM users WHERE id = ?`, [result.id]);
    } else {
      if (phoneCode && (!user.phone || user.phone === '13800000000')) {
        await run(`UPDATE users SET phone = ? WHERE id = ?`, [phone, user.id]);
        await run(`UPDATE patients SET phone = ? WHERE user_id = ? AND relation = 'self'`, [phone, user.id]);
        user.phone = phone;
      }
    }

    const token = jwt.sign(
      { id: user.id, openid: user.openid },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        access_token: token,
        refresh_token: `refresh_${crypto.randomBytes(8).toString('hex')}`,
        user: {
          id: user.id.toString(),
          nickname: user.nickname,
          avatar: user.avatar_url || '/static/demo/avatar.jpg',
          phone: user.phone || '138****8888',
          memberLevel: user.member_level,
          isDistributor: false
        },
        expires_in: 2592000
      }
    });
  } catch (error) {
    console.error('wx-login error:', error);
    res.status(500).json({ code: 500, message: '登录失败' });
  }
});

// 2. User Profile (GET)
app.get('/api/v1/user/profile', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户未找到' });
    }
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: patient ? patient.id.toString() : user.id.toString(),
        nickname: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        gender: patient ? patient.gender : 1,
        age: patient ? patient.age : 30,
        phone: user.phone || (patient ? patient.phone : '138****8888'),
        birthday: user.birthday || '1995-01-01'
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取个人资料失败' });
  }
});

// 3. User Profile (PUT)
app.put('/api/v1/user/profile', authenticateWxToken, async (req, res) => {
  const { nickname, phone, gender, age, birthday } = req.body;
  try {
    await run(
      `UPDATE users SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone), birthday = COALESCE(?, birthday) WHERE id = ?`,
      [nickname, phone, birthday, req.user.id]
    );
    await run(
      `UPDATE patients SET name = COALESCE(?, name), gender = COALESCE(?, gender), age = COALESCE(?, age), phone = COALESCE(?, phone) 
       WHERE user_id = ? AND relation = 'self'`,
      [nickname, gender, age, phone, req.user.id]
    );

    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: patient ? patient.id.toString() : user.id.toString(),
        nickname: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        gender: patient ? patient.gender : 1,
        age: patient ? patient.age : 30,
        phone: user.phone,
        birthday: user.birthday
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '更新资料失败' });
  }
});

// 4. Member Info (GET)
app.get('/api/v1/user/member-info', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    res.json({
      code: 0,
      message: 'success',
      data: {
        memberLevel: user.member_level,
        points: user.points,
        totalSpent: user.total_spent
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取会员信息失败' });
  }
});

// 5. Family Members (GET)
app.get('/api/v1/user/family-members', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(`SELECT * FROM patients WHERE user_id = ?`, [req.user.id]);
    const formatted = list.map(p => ({
      id: p.id.toString(),
      name: p.name,
      relation: p.relation,
      gender: p.gender,
      age: p.age,
      phone: p.phone,
      hasSnore: p.has_snore === 1
    }));
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取家庭成员失败' });
  }
});

// 6. Family Members (POST)
app.post('/api/v1/user/family-members', authenticateWxToken, async (req, res) => {
  const { name, relation, gender, age, phone } = req.body;
  if (!name) {
    return res.status(400).json({ code: 400, message: '姓名不能为空' });
  }

  try {
    const genderVal = gender === '男' || gender === 1 ? 1 : gender === '女' || gender === 2 ? 2 : 0;
    const result = await run(
      `INSERT INTO patients (user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [req.user.id, name, relation || 'other', genderVal, age || null, phone || null]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id.toString(),
        name,
        relation,
        gender: genderVal,
        age,
        phone,
        hasSnore: false
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加家庭成员失败' });
  }
});

// 7. Family Member (DELETE)
app.delete('/api/v1/user/family-members/:id', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await get(`SELECT * FROM patients WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '成员不存在' });
    }
    if (patient.relation === 'self') {
      return res.status(400).json({ code: 400, message: '不能删除本人建档' });
    }
    await run(`DELETE FROM patients WHERE id = ?`, [id]);
    res.json({ code: 0, message: 'success', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

// 8. Stores (GET)
app.get('/api/v1/stores', async (req, res) => {
  try {
    const list = await query(`SELECT * FROM stores ORDER BY id ASC`);
    const formatted = [];
    for (const store of list) {
      const features = await query(`SELECT feature FROM store_features WHERE store_id = ?`, [store.id]);
      
      const docCountRow = await get(`SELECT COUNT(*) as count FROM doctor_store_mapping WHERE store_id = ?`, [store.id]);
      const doctorCount = docCountRow ? docCountRow.count : 0;

      const hours = await query(`SELECT open_time, close_time FROM store_hours WHERE store_id = ?`, [store.id]);
      let businessHours = '';
      if (hours.length > 0) {
        businessHours = hours.map(h => {
          const open = h.open_time.slice(0, 5);
          const close = h.close_time.slice(0, 5);
          return `${open}-${close}`;
        }).join(' ');
      } else {
        const formatTime = (t) => {
          if (!t) return '';
          const parts = t.split(':');
          return `${parts[0]}:${parts[1]}`;
        };
        businessHours = `${formatTime(store.open_time)}-${formatTime(store.close_time)}`;
      }

      const isOpen = checkStoreIsOpen(store.status, hours, store.open_time, store.close_time);

      formatted.push({
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        city: store.city,
        district: store.district,
        latitude: store.latitude,
        longitude: store.longitude,
        openTime: store.open_time,
        closeTime: store.close_time,
        status: store.status,
        isOpen,
        hasParking: store.has_parking === 1,
        features: features.map(f => f.feature),
        tags: features.map(f => f.feature),
        doctorCount,
        businessHours
      });
    }
    res.json({ code: 0, message: 'success', data: formatted });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
});

// 9. Doctors (GET)
app.get('/api/v1/doctors', async (req, res) => {
  const { storeId } = req.query;
  try {
    let list;
    if (storeId) {
      list = await query(
        `SELECT d.* FROM doctors d 
         JOIN doctor_store_mapping m ON d.id = m.doctor_id 
         WHERE m.store_id = ? AND d.status = 1`,
        [storeId]
      );
    } else {
      list = await query(`SELECT * FROM doctors WHERE status = 1`);
    }

    const formatted = [];
    for (const d of list) {
      const storesMapping = await query(`SELECT store_id FROM doctor_store_mapping WHERE doctor_id = ?`, [d.id]);
      
      let expertise = null;
      if (d.expertise) {
        try {
          const parsed = typeof d.expertise === 'string' ? JSON.parse(d.expertise) : d.expertise;
          if (Array.isArray(parsed) && parsed.length > 0) {
            expertise = parsed;
          }
        } catch (e) {
          console.error('Failed to parse expertise JSON:', e);
        }
      }

      if (!expertise || expertise.length === 0) {
        if (d.specialty === '睡眠呼吸科' || d.specialty === '睡眠呼吸') {
          expertise = ['睡眠呼吸暂停综合症', '鼾症非手术治疗', '阻鼾器适配', '下颌前移治疗'];
        } else if (d.specialty === '耳鼻喉科') {
          expertise = ['鼻内镜诊断', '上气道评估', '过敏性鼻炎与鼾症', '多导睡眠监测'];
        } else if (d.specialty === '心理科' || d.specialty === '口腔正畸') {
          expertise = ['正畸辅导', '睡眠行为干预', '情绪焦虑管理', '依从性辅导'];
        } else {
          expertise = ['阻鼾器适配', '睡眠健康辅导'];
        }
      }

      // Calculate real consult count (actual appointments in the database)
      const consultRow = await get(`SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ?`, [d.id]);
      const consultCount = consultRow ? consultRow.count : 0;

      // Calculate real review count and average rating from actual evaluations
      const reviewRow = await get(
        `SELECT COUNT(*) as count, AVG(rating) as avg_rating 
         FROM appointment_evaluations 
         WHERE doctor_id = ?`,
        [d.id]
      );
      const reviewCount = reviewRow ? reviewRow.count : 0;
      let rating = 5.0;
      if (reviewRow && reviewRow.avg_rating !== null) {
        rating = Math.round(Number(reviewRow.avg_rating) * 10) / 10;
      }

      formatted.push({
        id: d.id,
        name: d.name,
        avatar: d.avatar_url || '/static/demo/doctor-1.jpg',
        avatarUrl: d.avatar_url || '/static/demo/doctor-1.jpg',
        title: d.title,
        specialty: d.specialty,
        hospital: d.hospital || '',
        intro: d.intro || '',
        experience: d.experience_years,
        experienceYears: d.experience_years,
        expertise,
        rating,
        reviewCount,
        consultCount,
        consultFee: d.consult_fee,
        storeIds: storesMapping.map(m => m.store_id)
      });
    }
    res.json({ code: 0, message: 'success', data: formatted });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取医生列表失败' });
  }
});

// 10. Schedule Dates (GET)
app.get('/api/v1/schedules/dates', async (req, res) => {
  const { doctorId, storeId } = req.query;
  if (!doctorId || !storeId) {
    return res.status(400).json({ code: 400, message: 'doctorId和storeId不能为空' });
  }

  try {
    const list = await query(
      `SELECT DISTINCT date FROM doctor_schedules 
       WHERE doctor_id = ? AND store_id = ? AND date >= CURRENT_DATE 
       ORDER BY date ASC`,
      [doctorId, storeId]
    );
    res.json({
      code: 0,
      message: 'success',
      data: list.map(item => item.date)
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班日期失败' });
  }
});

// 11. Schedules (GET)
app.get('/api/v1/schedules', async (req, res) => {
  const { doctorId, storeId, startDate, endDate } = req.query;
  if (!doctorId || !storeId) {
    return res.status(400).json({ code: 400, message: 'doctorId和storeId不能为空' });
  }

  try {
    let list;
    if (startDate && endDate) {
      list = await query(
        `SELECT * FROM doctor_schedules 
         WHERE doctor_id = ? AND store_id = ? AND date >= ? AND date <= ? 
         ORDER BY date ASC, start_time ASC`,
        [doctorId, storeId, startDate, endDate]
      );
    } else {
      list = await query(
        `SELECT * FROM doctor_schedules 
         WHERE doctor_id = ? AND store_id = ? AND date >= CURRENT_DATE 
         ORDER BY date ASC, start_time ASC`,
        [doctorId, storeId]
      );
    }

    const formatted = list.map(row => ({
      id: row.id,
      doctorId: Number(row.doctor_id),
      storeId: Number(row.store_id),
      date: row.date,
      period: row.period,
      startTime: row.start_time,
      endTime: row.end_time,
      totalSlots: row.total_slots,
      bookedSlots: row.booked_slots,
      status: row.status
    }));

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班信息失败' });
  }
});

// 12. Time Slots (GET)
app.get('/api/v1/schedules/:id/slots', async (req, res) => {
  const { id } = req.params;
  try {
    const t = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [id]);
    if (!t) {
      return res.status(404).json({ code: 1004, message: '排班不存在' });
    }

    const slots = [];
    const o = parseInt(t.start_time.split(':')[0]);
    const endHour = parseInt(t.end_time.split(':')[0]);
    const durationMins = 60 * (endHour - o);
    const r = t.total_slots;
    const slotDuration = Math.floor(durationMins / r);
    
    let bookedCount = 0;
    for (let n = 0; n < r; n++) {
      const i = n * slotDuration;
      const nextIdx = (n + 1) * slotDuration;
      const startH = Math.floor(i / 60) + o;
      const startM = i % 60;
      const endH = Math.floor(nextIdx / 60) + o;
      const endM = nextIdx % 60;
      const isBooked = bookedCount < t.booked_slots;
      if (isBooked) bookedCount++;

      slots.push({
        id: `slot-${t.id}-${n}`,
        scheduleId: t.id,
        startTime: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
        endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
        status: isBooked ? 'booked' : 'available',
        label: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}-${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: slots
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班分时段失败' });
  }
});

// 13. Create Appointment (POST)
app.post('/api/v1/appointments', authenticateWxToken, async (req, res) => {
  const { doctorId, storeId, scheduleId, appointmentDate, appointmentTime, patientId, type, symptomDesc } = req.body;
  if (!doctorId || !storeId || !scheduleId || !appointmentDate || !appointmentTime || !patientId) {
    return res.status(400).json({ code: 400, message: '预约关键信息缺失' });
  }

  try {
    const apptNo = `AP2026${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    const schedule = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [scheduleId]);
    if (!schedule) {
      return res.status(400).json({ code: 400, message: '排班时段不存在' });
    }
    if (schedule.booked_slots >= schedule.total_slots) {
      return res.status(400).json({ code: 400, message: '该预约时段已约满' });
    }

    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'mini_app')`,
      [
        apptNo,
        req.user.id,
        patientId,
        storeId,
        doctorId,
        scheduleId,
        appointmentDate,
        appointmentTime,
        type || 'first',
        symptomDesc || ''
      ]
    );

    await run(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [scheduleId]);

    const o = {
      id: result.id,
      appointmentNo: apptNo,
      userId: req.user.id.toString(),
      patientId: Number(patientId),
      doctorId: Number(doctorId),
      storeId: Number(storeId),
      scheduleId: Number(scheduleId),
      appointmentDate,
      appointmentTime,
      type,
      symptomDesc,
      status: 'confirmed',
      source: 'mini_app',
      createdAt: new Date().toISOString()
    };

    res.json({
      code: 0,
      message: 'success',
      data: o
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ code: 500, message: '预约创建失败' });
  }
});

// 14. List Appointments (GET)
app.get('/api/v1/appointments', authenticateWxToken, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = `SELECT a.*, p.name as patient_name, d.name as doctor_name, d.title as doctor_title, d.avatar_url as doctor_avatar, s.name as store_name
               FROM appointments a
               JOIN patients p ON a.patient_id = p.id
               JOIN doctors d ON a.doctor_id = d.id
               JOIN stores s ON a.store_id = s.id
               WHERE a.user_id = ?`;
    const params = [req.user.id];

    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;

    const list = await query(sql, params);
    const formatted = list.map(row => ({
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: row.appointment_date,
      appointmentTime: row.appointment_time,
      type: row.type,
      status: row.status,
      symptomDesc: row.symptom_desc,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      doctorTitle: row.doctor_title,
      doctorAvatar: row.doctor_avatar,
      storeName: row.store_name
    }));

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取预约列表失败' });
  }
});

// 15. Appointment Detail (GET)
app.get('/api/v1/appointments/:id', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await get(
      `SELECT a.*, p.name as patient_name, d.name as doctor_name, d.title as doctor_title, d.avatar_url as doctor_avatar, s.name as store_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       JOIN stores s ON a.store_id = s.id
       WHERE a.id = ? AND a.user_id = ?`,
      [id, req.user.id]
    );

    if (!row) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }

    const appt = {
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: row.appointment_date,
      appointmentTime: row.appointment_time,
      type: row.type,
      status: row.status,
      symptomDesc: row.symptom_desc,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      doctorTitle: row.doctor_title,
      doctorAvatar: row.doctor_avatar,
      storeName: row.store_name
    };

    res.json({
      code: 0,
      message: 'success',
      data: {
        appointment: appt,
        doctor: {
          id: row.doctor_id,
          name: row.doctor_name,
          avatarUrl: row.doctor_avatar,
          title: row.doctor_title
        },
        store: {
          id: row.store_id,
          name: row.store_name
        }
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取预约详情失败' });
  }
});

// 16. Cancel Appointment (POST)
app.post('/api/v1/appointments/:id/cancel', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status === 'cancelled') {
      return res.status(400).json({ code: 400, message: '预约已取消' });
    }

    await run(
      `UPDATE appointments SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason || '', id]
    );

    await run(`UPDATE doctor_schedules SET booked_slots = GREATEST(0, booked_slots - 1) WHERE id = ?`, [appt.schedule_id]);

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    res.json({
      code: 0,
      message: 'success',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '取消预约失败' });
  }
});

// 17. Reschedule Appointment (POST)
app.post('/api/v1/appointments/:id/reschedule', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const { scheduleId, appointmentDate, appointmentTime } = req.body;

  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }

    const newSchedule = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [scheduleId]);
    if (!newSchedule) {
      return res.status(400).json({ code: 400, message: '目标排班时段不存在' });
    }
    if (newSchedule.booked_slots >= newSchedule.total_slots) {
      return res.status(400).json({ code: 400, message: '目标预约时段已约满' });
    }

    await run(`UPDATE doctor_schedules SET booked_slots = GREATEST(0, booked_slots - 1) WHERE id = ?`, [appt.schedule_id]);
    await run(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [scheduleId]);

    await run(
      `UPDATE appointments 
       SET schedule_id = ?, appointment_date = ?, appointment_time = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [scheduleId, appointmentDate, appointmentTime, id]
    );

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    res.json({
      code: 0,
      message: 'success',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '改约失败' });
  }
});

// 18. Products (GET)
app.get('/api/v1/products', async (req, res) => {
  try {
    const list = await query(`SELECT * FROM products WHERE status = 'on'`);
    const formatted = list.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.image_url,
      galleryUrls: typeof p.gallery_urls === 'string' ? JSON.parse(p.gallery_urls) : p.gallery_urls,
      price: p.price,
      originalPrice: p.original_price,
      description: p.description,
      stock: p.stock,
      salesCount: p.sales_count
    }));
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品列表失败' });
  }
});

// 19. Product Detail (GET)
app.get('/api/v1/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const p = await get(`SELECT * FROM products WHERE id = ?`, [id]);
    if (!p) {
      return res.status(404).json({ code: 404, message: '商品不存在' });
    }
    const formatted = {
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.image_url,
      galleryUrls: typeof p.gallery_urls === 'string' ? JSON.parse(p.gallery_urls) : p.gallery_urls,
      price: p.price,
      originalPrice: p.original_price,
      description: p.description,
      stock: p.stock,
      salesCount: p.sales_count
    };
    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品详情失败' });
  }
});

// 20. Medical Records (GET)
app.get('/api/v1/user/medical-records', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT mr.*, p.name as patient_name, d.name as doctor_name, s.name as store_name
       FROM medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN stores s ON mr.store_id = s.id
       WHERE p.user_id = ?
       ORDER BY mr.visit_date DESC`,
      [req.user.id]
    );

    const formatted = list.map(mr => ({
      id: mr.id,
      patientId: mr.patient_id,
      patientName: mr.patient_name,
      doctorId: mr.doctor_id,
      doctorName: mr.doctor_name,
      storeId: mr.store_id,
      storeName: mr.store_name,
      visitDate: mr.visit_date,
      diagnosis: mr.diagnosis,
      prescription: mr.prescription,
      doctorAdvice: mr.doctor_advice,
      note: mr.note
    }));

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取病历记录失败' });
  }
});

// 21. Active Treatment Record (GET)
app.get('/api/v1/treatment/record', authenticateWxToken, async (req, res) => {
  try {
    const patient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者记录未找到' });
    }
    const tr = await get(
      `SELECT tr.*, mr.diagnosis, mr.doctor_advice 
       FROM treatment_records tr
       LEFT JOIN medical_records mr ON tr.medical_record_id = mr.id
       WHERE tr.patient_id = ? AND tr.status = 'active'
       LIMIT 1`,
      [patient.id]
    );

    if (!tr) {
      return res.status(404).json({ code: 404, message: '当前无活跃治疗记录' });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: tr.id.toString(),
        patientId: tr.patient_id.toString(),
        appointmentId: tr.medical_record_id ? tr.medical_record_id.toString() : '',
        doctorId: tr.doctor_id.toString(),
        diagnosis: tr.diagnosis || '轻度阻塞性睡眠呼吸暂停（OSAS）',
        treatmentPlan: `下颌前移式阻鼾器治疗，初始前移量${tr.initial_advancement}mm，当前前移量${tr.current_advancement}mm`,
        deviceModel: tr.device_model,
        adjustmentValue: Number(tr.current_advancement),
        nextAdjustDate: tr.next_adjust_date || '',
        doctorAdvice: tr.doctor_advice || '建议每晚佩戴，如有不适请及时就诊。',
        followupDate: tr.next_adjust_date || '',
        createdAt: tr.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取治疗记录失败' });
  }
});

// 21b. WeChat Client Distribution (分销管理)
app.get('/api/v1/distribution/info', authenticateWxToken, async (req, res) => {
  try {
    const dist = await get(`SELECT * FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.json({
        code: 0,
        data: {
          teamCount: 0,
          teamLevel2Count: 0,
          totalSales: 0,
          availableCommission: 0,
          totalCommission: 0,
          withdrawnAmount: 0,
          level: 'silver',
          inviteCode: ''
        }
      });
    }
    const lv1 = await get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 1`, [req.user.id]);
    const lv2 = await get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 2`, [req.user.id]);
    
    res.json({
      code: 0,
      data: {
        teamCount: lv1.count || 0,
        teamLevel2Count: lv2.count || 0,
        totalSales: dist.total_commission * 10,
        availableCommission: dist.available_commission,
        totalCommission: dist.total_commission,
        withdrawnAmount: dist.withdrawn_amount,
        level: dist.level,
        inviteCode: dist.invite_code,
        inviteQrCode: dist.invite_qr_url || '/static/demo/qrcode.png'
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取分销信息失败' });
  }
});

app.get('/api/v1/distribution/team', authenticateWxToken, async (req, res) => {
  try {
    const parentUserId = req.user.id;
    const relationships = await query(
      `SELECT r.child_user_id, u.nickname, u.avatar_url, u.created_at as joined_at, d.level, d.id as distributor_id
       FROM distribution_relationships r
       JOIN users u ON r.child_user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       WHERE r.parent_user_id = ?`,
      [parentUserId]
    );

    const list = [];
    for (const rel of relationships) {
      let orderCount = 0;
      let totalSales = 0;
      if (rel.distributor_id) {
        const stats = await get(
          `SELECT COUNT(*) as count, SUM(order_amount) as sales 
           FROM distribution_orders 
           WHERE distributor_id = ?`,
          [rel.distributor_id]
        );
        orderCount = stats.count || 0;
        totalSales = stats.sales || 0;
      }

      // Find patients promoted under this team member
      const promotedPatients = await query(
        `SELECT child_user_id FROM distribution_relationships WHERE parent_user_id = ?`,
        [rel.child_user_id]
      );

      let status = null;
      let statusText = '';
      let statusClass = '';

      if (promotedPatients.length > 0) {
        const patientIds = promotedPatients.map(p => p.child_user_id);
        const placeholders = patientIds.map(() => '?').join(',');

        // 1. Check if any patient has paid order
        const paidOrder = await get(
          `SELECT 1 FROM orders WHERE user_id IN (${placeholders}) AND pay_at IS NOT NULL LIMIT 1`,
          patientIds
        );
        if (paidOrder) {
          status = 'paid';
          statusText = '已成交';
          statusClass = 'paid';
        } else {
          // 2. Check if any patient has completed appointment (到店诊断完成)
          const completedApt = await get(
            `SELECT 1 FROM appointments WHERE user_id IN (${placeholders}) AND status = 'completed' LIMIT 1`,
            patientIds
          );
          if (completedApt) {
            status = 'unpaid';
            statusText = '未成交';
            statusClass = 'unpaid';
          } else {
            // 3. Check if any patient has any appointment (已预约)
            const anyApt = await get(
              `SELECT 1 FROM appointments WHERE user_id IN (${placeholders}) LIMIT 1`,
              patientIds
            );
            if (anyApt) {
              status = 'booked';
              statusText = '已预约';
              statusClass = 'booked';
            }
          }
        }
      } else {
        status = null;
        statusText = '';
        statusClass = '';
      }

      list.push({
        id: rel.child_user_id.toString(),
        nickname: rel.nickname,
        avatar: rel.avatar_url || '',
        level: rel.level || 'silver',
        orderCount: orderCount,
        totalSales: totalSales,
        joinedAt: rel.joined_at ? rel.joined_at.split('T')[0] : '',
        status: status,
        statusText: statusText,
        statusClass: statusClass
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length
      }
    });
  } catch (error) {
    console.error('get team members error:', error);
    res.status(500).json({ code: 500, message: '获取团队成员失败' });
  }
});

app.get('/api/v1/distribution/orders', authenticateWxToken, async (req, res) => {
  try {
    const dist = await get(`SELECT id FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.json({ code: 0, data: { list: [] } });
    }
    const list = await query(
      `SELECT o.order_no, do.buyer_name, do.order_amount, do.commission_amount, do.status, do.created_at
       FROM distribution_orders do
       JOIN orders o ON do.order_id = o.id
       WHERE do.distributor_id = ?
       ORDER BY do.created_at DESC`,
      [dist.id]
    );
    res.json({
      code: 0,
      data: {
        list: list.map(item => ({
          orderNo: item.order_no,
          buyerName: item.buyer_name,
          orderAmount: item.order_amount,
          commission: item.commission_amount,
          status: item.status,
          createdAt: item.created_at
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取推广订单失败' });
  }
});

app.get('/api/v1/distribution/products', async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM products WHERE is_distribution = 1 AND status = 'on'`
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(p => ({
          id: p.id.toString(),
          name: p.name,
          image: p.image_url,
          price: p.price,
          originalPrice: p.original_price,
          commissionRate: p.commission_rate,
          commission: Math.round(p.price * (p.commission_rate / 100)),
          sales: p.sales_count
        })),
        total: list.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取分销产品失败' });
  }
});

app.get('/api/v1/distribution/rules', async (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      rules: `
## 鼾静健康·推广员计划

### 一、推广员等级
| 等级 | 升级条件 | 佣金比例 |
|------|---------|---------|
| 白银推广员 | 注册即可 | 8% |
| 黄金推广员 | 累计佣金≥3,000元 | 12% |
| 钻石推广员 | 累计佣金≥10,000元 | 15% |

### 二、佣金规则
1. 一级佣金：您直接推广成交的订单，按对应等级比例获得佣金
2. 二级佣金：您的推广员推广成交的订单，您可获得一级佣金的20%作为二级奖励
3. 佣金结算：用户确认收货7天后自动结算，可提现至微信零钱或银行卡

### 三、推广方式
1. 分享小程序商品页给微信好友/微信群
2. 生成专属推广海报，引导扫码购买
3. 通过朋友圈分享治疗案例（需脱敏处理）

### 四、注意事项
- 禁止虚假宣传、夸大疗效
- 禁止诱导用户进行不必要的消费
- 违规推广将冻结佣金并取消推广资格
`
    }
  });
});

app.post('/api/v1/distribution/withdraw', authenticateWxToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ code: 400, message: '提现金额无效' });
  }
  try {
    const dist = await get(`SELECT * FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.status(400).json({ code: 400, message: '您不是推广员' });
    }
    if (dist.available_commission < amount) {
      return res.status(400).json({ code: 400, message: '余额不足' });
    }
    
    await run(
      `INSERT INTO withdraw_records (user_id, amount, fee, actual_amount, status, account_info)
       VALUES (?, ?, 0, ?, 'pending', '微信零钱')`,
      [req.user.id, amount, amount]
    );

    await run(
      `UPDATE distributors SET available_commission = available_commission - ? WHERE user_id = ?`,
      [amount, req.user.id]
    );

    res.json({ code: 0, message: '申请提现成功，等待管理员审批' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '申请失败' });
  }
});

app.get('/api/v1/distribution/withdraw-records', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM withdraw_records WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(item => ({
          id: item.id.toString(),
          amount: item.amount,
          status: item.status,
          createdAt: item.created_at,
          completedAt: item.completed_at
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取提现记录失败' });
  }
});

// 22. WeChat Home Stats (GET)
app.get('/api/v1/home/stats', async (req, res) => {
  try {
    const patientCountRow = await get(`SELECT COUNT(*) as count FROM patients`);
    const storeCountRow = await get(`SELECT COUNT(*) as count FROM stores WHERE status = 'open'`);
    // Calculate satisfaction rate dynamically from average rating in evaluations table
    const avgRatingRow = await get(`SELECT AVG(rating) as avg FROM appointment_evaluations`);
    let satisfaction = 98;
    if (avgRatingRow && avgRatingRow.avg !== null) {
      satisfaction = Math.round((Number(avgRatingRow.avg) / 5) * 100);
    } else {
      const docAvgRow = await get(`SELECT AVG(rating) as avg FROM doctors WHERE status = 1`);
      satisfaction = docAvgRow && docAvgRow.avg ? Math.round((Number(docAvgRow.avg) / 5) * 100) : 98;
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: {
        totalPatients: patientCountRow.count || 0,
        satisfactionRate: satisfaction,
        storeCount: storeCountRow.count || 0
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取首页统计数据失败' });
  }
});

// ----------------------------------------
// BOOTSTRAP DATABASE & SERVER
// ----------------------------------------
const startServer = async () => {
  try {
    // 1. Initialize Tables
    await initDB();
    // 2. Load Seed Data
    await seedData();

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  Hanjing Clinic Backend is running!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
