import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { initDB, query, get, run } from './db.js';
import { seedData } from './seed.js';

const app = express();
const PORT = process.env.PORT || 5005;
const JWT_SECRET = 'hanjing_clinic_secret_key_2026';

app.use(cors());
app.use(express.json());

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

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
  try {
    // 1. Total revenue (paid / completed orders)
    const revRow = await get(`SELECT SUM(pay_amount) as total FROM orders WHERE status IN ('paid', 'completed')`);
    const totalRevenue = revRow.total || 0;

    // 2. Total appointments
    const apptRow = await get(`SELECT COUNT(*) as count FROM appointments`);
    const totalAppointments = apptRow.count || 0;

    // 3. Total patients
    const patientRow = await get(`SELECT COUNT(*) as count FROM patients`);
    const totalPatients = patientRow.count || 0;

    // 4. Online doctors
    const doctorRow = await get(`SELECT COUNT(*) as count FROM doctors WHERE status = 1`);
    const onlineDoctors = doctorRow.count || 0;

    // 5. Chart: Appointments grouped by date
    const appointmentTrends = await query(`
      SELECT appointment_date as date, COUNT(*) as count 
      FROM appointments 
      GROUP BY appointment_date 
      ORDER BY appointment_date DESC 
      LIMIT 15
    `);

    // 6. Chart: Revenue grouped by date
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
        totalRevenue,
        totalAppointments,
        totalPatients,
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

app.put('/api/admin/appointments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason } = req.body;

  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }

    if (cancel_reason) {
      await run(
        `UPDATE appointments SET status = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, cancel_reason, id]
      );
    } else {
      await run(
        `UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, id]
      );
    }

    res.json({ code: 200, message: '更新预约状态成功' });
  } catch (error) {
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
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取医生列表失败' });
  }
});

app.post('/api/admin/doctors', authenticateToken, async (req, res) => {
  const { name, title, specialty, hospital, intro, consult_fee, status } = req.body;
  if (!name || !title || !specialty) {
    return res.status(400).json({ code: 400, message: '必填信息缺失（姓名、职称、科室）' });
  }

  try {
    const result = await run(
      `INSERT INTO doctors (name, title, specialty, hospital, intro, consult_fee, status, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, '/static/demo/doctor-4.jpg']
    );
    res.json({ code: 200, message: '添加医生成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加医生失败' });
  }
});

app.put('/api/admin/doctors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, title, specialty, hospital, intro, consult_fee, status } = req.body;

  try {
    await run(
      `UPDATE doctors 
       SET name = ?, title = ?, specialty = ?, hospital = ?, intro = ?, consult_fee = ?, status = ?
       WHERE id = ?`,
      [name, title, specialty, hospital || '', intro || '', consult_fee || 0, status !== undefined ? status : 1, id]
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
    }
    res.json({ code: 200, data: list });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
});

app.post('/api/admin/stores', authenticateToken, async (req, res) => {
  const { name, code, address, city, district, phone, open_time, close_time, status, features } = req.body;

  try {
    const result = await run(
      `INSERT INTO stores (name, code, address, city, district, phone, open_time, close_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code, address, city || '', district || '', phone || '', open_time || '09:00:00', close_time || '18:00:00', status || 'open']
    );

    if (features && Array.isArray(features)) {
      for (const feature of features) {
        await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [result.id, feature]);
      }
    }

    res.json({ code: 200, message: '添加门店成功', data: { id: result.id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '添加门店失败' });
  }
});

app.put('/api/admin/stores/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, status, features } = req.body;

  try {
    await run(
      `UPDATE stores SET name = ?, address = ?, phone = ?, status = ? WHERE id = ?`,
      [name, address, phone, status, id]
    );

    if (features && Array.isArray(features)) {
      await run(`DELETE FROM store_features WHERE store_id = ?`, [id]);
      for (const feature of features) {
        await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [id, feature]);
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
