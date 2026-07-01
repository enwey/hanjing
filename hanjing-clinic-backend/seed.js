import { run, query } from './db.js';
import crypto from 'crypto';
import { generateUniquePatientNo } from './patientNo.js';

const nextPatientNo = () => generateUniquePatientNo(async (candidate) => {
  const rows = await query(`SELECT id FROM patients WHERE patient_no = ? LIMIT 1`, [candidate]);
  return rows.length > 0;
});

export const seedData = async () => {
  const adminCount = await query('SELECT count(*) as count FROM admin_users');
  if (adminCount[0].count > 0) {
    console.log('Database already has data. Skipping seeding.');
    try {
      const existingDist = await query("SELECT * FROM distributors WHERE invite_code = 'LIMING666'");
      if (existingDist.length === 0) {
        console.log('Injecting new distribution seed data (empty status test)...');
        await injectNewDistributionSeeds();
      }
    } catch (e) {
      console.error('Failed to inject new distribution seeds:', e);
    }
    try {
      await injectImSeeds();
    } catch (e) {
      console.error('Failed to inject IM seeds:', e);
    }
    return;
  }

  console.log('Seeding mock data into database...');

  // 1. Roles
  const { id: superAdminRoleId } = await run(
    `INSERT INTO roles (name, code) VALUES (?, ?)`,
    ['超级管理员', 'super_admin']
  );
  const { id: storeMgrRoleId } = await run(
    `INSERT INTO roles (name, code) VALUES (?, ?)`,
    ['门店店长', 'store_mgr']
  );
  const { id: doctorRoleId } = await run(
    `INSERT INTO roles (name, code) VALUES (?, ?)`,
    ['就诊医生', 'doctor']
  );

  // 2. Permissions
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [superAdminRoleId, '*']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [storeMgrRoleId, 'appointment:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [storeMgrRoleId, 'appointment:edit']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [storeMgrRoleId, 'patient:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [storeMgrRoleId, 'store:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'appointment:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'appointment:edit']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'patient:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'patient:phone:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'medical_record:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'medical_record:add']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'medical_record:edit']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'schedule:view']);
  await run(`INSERT INTO permissions (role_id, permission_resource) VALUES (?, ?)`, [doctorRoleId, 'schedule:edit']);

  // 3. Stores
  const store1 = await run(
    `INSERT INTO stores (name, code, address, city, district, latitude, longitude, phone, open_time, close_time, status, has_parking) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['鼾静健康 · 龙岗总店', 'SZ-LG', '深圳市龙岗区吉华路达成工业区3号', '深圳', '龙岗区', 22.7214, 114.2568, '0755-89622999', '08:30:00', '18:00:00', 'open', 1]
  );
  const store2 = await run(
    `INSERT INTO stores (name, code, address, city, district, latitude, longitude, phone, open_time, close_time, status, has_parking) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['鼾静健康 · 南山分院', 'SZ-NS', '深圳市南山区科技园南区数字大厦2楼', '深圳', '南山区', 22.5401, 113.9345, '0755-86282888', '09:00:00', '17:30:00', 'open', 1]
  );
  const store3 = await run(
    `INSERT INTO stores (name, code, address, city, district, latitude, longitude, phone, open_time, close_time, status, has_parking) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['鼾静健康 · 福田门诊部', 'SZ-FT', '深圳市福田区深南大道财富大厦A座3楼', '深圳', '福田区', 22.5367, 114.0556, '0755-83511188', '08:30:00', '20:00:00', 'open', 0]
  );
  const store4 = await run(
    `INSERT INTO stores (name, code, address, city, district, latitude, longitude, phone, open_time, close_time, status, has_parking) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['鼾静健康 · 广州天河店', 'GZ-TH', '广州市天河区天河路385号太古汇2座', '广州', '天河区', 23.1342, 113.3352, '020-38688888', '09:00:00', '18:00:00', 'closed', 1]
  );

  // Store Features
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store1.id, '智能排队']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store1.id, '特设VIP室']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store1.id, '睡眠呼吸监测']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store2.id, '夜间监测套房']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store2.id, '免费停车']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store2.id, '地铁直达']);
  await run(`INSERT INTO store_features (store_id, feature) VALUES (?, ?)`, [store3.id, '热门']);

  // Store Hours (Default single range)
  await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [store1.id, '08:30', '18:00']);
  await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [store2.id, '09:00', '17:30']);
  await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [store3.id, '08:30', '20:00']);
  await run(`INSERT INTO store_hours (store_id, open_time, close_time) VALUES (?, ?, ?)`, [store4.id, '09:00', '18:00']);

  // 4. Admin Users
  const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
  await run(
    `INSERT INTO admin_users (username, password_hash, name, phone, role_id, store_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['admin', passwordHash, '系统管理员', '13888888888', superAdminRoleId, null, 'online']
  );
  await run(
    `INSERT INTO admin_users (username, password_hash, name, phone, role_id, store_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['lg_mgr', passwordHash, '龙岗店长', '13999999999', storeMgrRoleId, store1.id, 'online']
  );

  // 5. Doctors
  const doc1 = await run(
    `INSERT INTO doctors (name, avatar_url, title, specialty, hospital, intro, experience_years, rating, consult_fee, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '古堪民',
      '/static/demo/doctor-1.jpg',
      '主任医师',
      '睡眠呼吸科',
      '深圳市第一人民医院',
      '从事睡眠呼吸障碍诊疗工作20余年，擅长成人及儿童鼾症、睡眠呼吸暂停综合征的无创气道正压治疗及阻鼾器微调治疗。主持多项睡眠障碍课题研究，在国内外期刊发表论文30余篇。',
      25,
      4.9,
      10000, // 100元
      1
    ]
  );
  const doc2 = await run(
    `INSERT INTO doctors (name, avatar_url, title, specialty, hospital, intro, experience_years, rating, consult_fee, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '王志远',
      '/static/demo/doctor-2.jpg',
      '副主任医师',
      '耳鼻喉科',
      '深圳市第二人民医院',
      '深耕耳鼻喉科及睡眠障碍研究，在鼾症物理治疗及患者习惯养成随访方面拥有丰富经验。特别在下颌前移矫治器(MAD)的适应症筛选与疗效评估方面见解独到。',
      18,
      4.8,
      8000, // 80元
      1
    ]
  );
  const doc3 = await run(
    `INSERT INTO doctors (name, avatar_url, title, specialty, hospital, intro, experience_years, rating, consult_fee, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '刘婉清',
      '/static/demo/doctor-3.jpg',
      '主治医师',
      '心理科',
      '北京大学深圳医院',
      '结合睡眠行为学与心理干预，提供定制化的OSAS物理器械治疗前心理适应辅导。擅长认知行为疗法治疗失眠症(CBT-I)及睡眠呼吸暂停综合征患者的长期依从性管理。',
      12,
      4.9,
      5000, // 50元
      1
    ]
  );

  // Doctor Store Mapping
  // doc1 (古堪民)执业于: 龙岗总店, 南山分院, 福田门诊部
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc1.id, store1.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc1.id, store2.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc1.id, store3.id]);

  // doc2 (王志远)执业于: 龙岗总店, 南山分院, 福田门诊部, 广州天河店
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc2.id, store1.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc2.id, store2.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc2.id, store3.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc2.id, store4.id]);

  // doc3 (刘婉清)执业于: 龙岗总店, 福田门诊部, 广州天河店
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc3.id, store1.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc3.id, store3.id]);
  await run(`INSERT INTO doctor_store_mapping (doctor_id, store_id) VALUES (?, ?)`, [doc3.id, store4.id]);

  // 6. Users & Patients
  const user1 = await run(
    `INSERT INTO users (openid, nickname, phone, avatar_url, member_level, points, total_spent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['openid_user_1', '微信用户-张华', '13800138001', '/static/demo/avatar.jpg', 'gold', 1500, 298000]
  );
  const user2 = await run(
    `INSERT INTO users (openid, nickname, phone, avatar_url, member_level, points, total_spent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['openid_user_2', '微信用户-李明', '13900139002', null, 'normal', 0, 0]
  );
  const user3 = await run(
    `INSERT INTO users (openid, nickname, phone, avatar_url, member_level, points, total_spent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['openid_user_3', '微信用户-王芳', '13700137003', null, 'silver', 490, 4900]
  );

  const patient1 = await run(
    `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [await nextPatientNo(), user1.id, '张华', 'self', 1, 45, '13800138001', 1]
  );
  const patient2 = await run(
    `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [await nextPatientNo(), user1.id, '张小华', 'child', 1, 10, '13800138001', 0]
  );
  const patient3 = await run(
    `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [await nextPatientNo(), user2.id, '李明', 'self', 1, 38, '13900139002', 1]
  );
  const patient4 = await run(
    `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [await nextPatientNo(), user3.id, '王芳', 'self', 2, 52, '13700137003', 1]
  );

  // 7. Doctor Schedules (May 29, 2026 matches default filter)
  const schedDates = ['2026-05-29', '2026-05-30', '2026-05-31', '2026-06-11', '2026-06-12', '2026-06-13'];
  const schedIds = [];
  for (const date of schedDates) {
    const s1 = await run(
      `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, booked_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc1.id, store1.id, date, 'morning', '09:00:00', '12:00:00', 6, 2]
    );
    const s2 = await run(
      `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, booked_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc1.id, store1.id, date, 'afternoon', '14:00:00', '18:00:00', 6, 1]
    );
    const s3 = await run(
      `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, booked_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc2.id, store1.id, date, 'morning', '09:00:00', '12:00:00', 6, 3]
    );
    const s4 = await run(
      `INSERT INTO doctor_schedules (doctor_id, store_id, date, period, start_time, end_time, total_slots, booked_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc3.id, store3.id, date, 'afternoon', '14:00:00', '18:00:00', 6, 0]
    );
    schedIds.push(s1.id, s2.id, s3.id, s4.id);
  }

  // 8. Assessments (ESS and Snore)
  const ess1 = await run(
    `INSERT INTO ess_assessments (user_id, total_score, risk_level, answers) VALUES (?, ?, ?, ?)`,
    [
      user1.id,
      14,
      '中度嗜睡',
      JSON.stringify([
        { question_id: 1, score: 2 },
        { question_id: 2, score: 3 },
        { question_id: 3, score: 1 },
        { question_id: 4, score: 2 },
        { question_id: 5, score: 2 },
        { question_id: 6, score: 3 },
        { question_id: 7, score: 1 },
        { question_id: 8, score: 0 }
      ])
    ]
  );

  const snore1 = await run(
    `INSERT INTO snore_assessments (user_id, file_url, duration, avg_decibel, peak_decibel, snore_rate, apnea_events, risk_level) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user1.id, '/static/demo/snore-demo.mp4', 1800, 58, 85, 35, 12, 'medium']
  );

  // 9. Appointments (Matches UI mockups for date 2026-05-29)
  const appt1 = await run(
    `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, ess_assessment_id, snore_assessment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'APPT202605290001',
      user1.id,
      patient1.id,
      store1.id,
      doc1.id,
      1, // First schedule created above
      '2026-05-29',
      '09:00 - 09:30',
      'first',
      'completed',
      '经常打鼾，夜间容易憋醒，白天嗜睡严重，头昏脑涨。',
      ess1.id,
      snore1.id
    ]
  );

  const appt2 = await run(
    `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'APPT202605290002',
      user2.id,
      patient3.id,
      store1.id,
      doc2.id,
      3, // Third schedule
      '2026-05-29',
      '10:30 - 11:00',
      'first',
      'confirmed',
      '鼾声特别响，爱人反映有呼吸暂停现象，睡醒口干。'
    ]
  );

  const appt3 = await run(
    `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'APPT202605300001',
      user1.id,
      patient1.id,
      store1.id,
      doc1.id,
      2,
      '2026-05-30',
      '14:30 - 15:00',
      'followup',
      'pending',
      '配戴HJ-MAD-03阻鼾器四周，预约复诊微调参数。'
    ]
  );

  // 10. Medical Records
  const mr1 = await run(
    `INSERT INTO medical_records (patient_id, doctor_id, store_id, appointment_id, visit_date, diagnosis, prescription, doctor_advice, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient1.id,
      doc1.id,
      store1.id,
      appt1.id,
      '2026-05-29',
      '中度阻塞性睡眠呼吸暂停综合征 (OSAHS)，伴随白天重度嗜睡。AHI: 18次/小时，最低血氧饱和度: 82%。',
      '定制 HJ-MAD-03 智能下颌前移阻鼾器，初始调节下颌前移量为 4.0mm。',
      '1. 每晚夜间持续配戴阻鼾器。\n2. 每日清晨使用专用清洁泡腾片清洗阻鼾器。\n3. 控制体重，避免侧卧改为侧仰卧位睡姿。\n4. 戒烟限酒，尤其是睡前避免饮酒。',
      '患者比较配合，首诊已完成，下颌前移耐受性良好。四周后预约复诊微调。'
    ]
  );

  // 11. Treatment Records
  const tr1 = await run(
    `INSERT INTO treatment_records (patient_id, doctor_id, medical_record_id, device_model, initial_advancement, current_advancement, start_date, next_adjust_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient1.id,
      doc1.id,
      mr1.id,
      'HJ-MAD-03',
      4.0,
      5.5,
      '2026-05-29',
      '2026-06-25',
      'active'
    ]
  );

  // Wearing logs are created only by real mini-program check-ins.

  // Device Adjustments
  await run(
    `INSERT INTO device_adjustments (treatment_id, adjust_date, operator_id, adjusted_advancement, patient_feedback, instructions)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      tr1.id,
      '2026-06-08',
      doc1.id,
      5.5,
      '感觉打鼾声确实变小了，只是清晨颞下颌关节有点酸胀，约10分钟后消失。',
      '将前移量微调增加至5.5mm，建议清晨醒来做几下张口运动以缓解关节酸胀。若持续疼痛请及时联系。'
    ]
  );

  // 12. Follow Up Tasks
  const fut1 = await run(
    `INSERT INTO follow_up_tasks (patient_id, doctor_id, title, description, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      patient1.id,
      doc1.id,
      '首周佩戴适应性随访',
      '致电确认患者收到阻鼾器后，配戴第一周的牙齿酸胀及口水分泌情况，排查是否有严重的颞下颌关节不适。',
      '2026-06-05',
      'completed'
    ]
  );
  const fut2 = await run(
    `INSERT INTO follow_up_tasks (patient_id, doctor_id, title, description, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      patient1.id,
      doc1.id,
      '复诊前佩戴习惯及数据核对随访',
      '打卡数据显示患者本周有两次未满5小时，电话回访原因，并指导在小程序内上传打卡记录。',
      '2026-06-15',
      'pending'
    ]
  );

  // Follow Up Records
  await run(
    `INSERT INTO follow_up_records (task_id, patient_id, doctor_id, contact_type, summary)
     VALUES (?, ?, ?, ?, ?)`,
    [
      fut1.id,
      patient1.id,
      doc1.id,
      'phone',
      '电话沟通完毕，患者反馈收到产品后前两晚确实有牙胀、流口水，第三天起明显减轻，未出现颞下颌关节持续剧痛。指导了清晨放松活动，随访任务已完成。'
    ]
  );

  // 13. Products
  const prod1 = { id: 1 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      1,
      '定制式可调舌型阻鼾器 HJ-MAD-03',
      'device',
      '/static/product/hj-mad-03.png',
      JSON.stringify(['/static/product/hj-mad-03.png', '/static/product/hj-mad-03-2.png']),
      298000, // 2980元
      368000,
      '针对中轻度阻塞性睡眠呼吸暂停(OSAHS)及顽固打鼾设计，采用食品级高分子材质，下颌前移微调精度达0.5mm，智能监测传感器自动上传睡眠佩戴时长与质量数据。',
      120,
      58,
      1,
      0.12, // 12%
      'on'
    ]
  );
  const prod2 = { id: 2 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      2,
      '鼾静阻鼾器专用清洁泡腾片 (60片/盒)',
      'accessory',
      '/static/product/pillow.png', // Reusing placeholder
      JSON.stringify(['/static/product/pillow.png', '/static/product/pillow-2.png']),
      4900, // 49元
      6900,
      '专为阻鼾器高分子材料研发 of 温和除菌清洁片。能有效杀灭99.9%的口腔常见细菌，防止异味积聚，不损伤阻鼾器金属调节螺丝与树脂基托。',
      800,
      340,
      1,
      0.10, // 10%
      'on'
    ]
  );
  const prod3 = { id: 3 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      3,
      '鼾静智能阻鼾舒眠记忆枕',
      'accessory',
      '/static/product/pillow.png',
      JSON.stringify(['/static/product/pillow.png']),
      29900, // 299元
      39900,
      '人体工学设计，智能控温与防鼾姿势引导，提升整晚睡眠舒适度与深睡比例。',
      150,
      85,
      0,
      0.0,
      'on'
    ]
  );
  const prod4 = { id: 4 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      4,
      '诊所首诊挂号门诊费',
      'service',
      '/static/product/screening.png',
      JSON.stringify(['/static/product/screening.png']),
      20000,
      20000,
      '挂号门诊费，包含初次就诊及基础筛查服务。',
      99999,
      1200,
      0,
      0.0,
      'on'
    ]
  );
  const prod5 = { id: 5 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      5,
      '诊所专家诊断评估费',
      'service',
      '/static/product/screening.png',
      JSON.stringify(['/static/product/screening.png']),
      50000,
      50000,
      '专家诊断评估费，包含专家一对一问诊及阻鼾器物理适配评估。',
      99999,
      650,
      0,
      0.0,
      'on'
    ]
  );
  const prod6 = { id: 6 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      6,
      '专业睡眠呼吸多导初筛服务套餐',
      'service',
      '/static/product/screening.png',
      JSON.stringify(['/static/product/screening.png']),
      19900,
      29900,
      '包含一次线上睡眠嗜睡问卷评估、三晚鼾声监测报告、以及一次门诊专家面对面的物理阻鼾器适应性筛查与出诊挂号费用。',
      9999,
      125,
      0,
      0.0,
      'on'
    ]
  );
  const prod7 = { id: 7 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      7,
      '快递运费',
      'service',
      '/static/product/screening.png',
      JSON.stringify(['/static/product/screening.png']),
      1500,
      1500,
      '顺丰快递或挂号邮寄服务费。',
      99999,
      500,
      0,
      0.0,
      'on'
    ]
  );
  const prod8 = { id: 8 };
  await run(
    `INSERT INTO products (id, name, category, image_url, gallery_urls, price, original_price, description, stock, sales_count, is_distribution, commission_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), original_price = VALUES(original_price)`,
    [
      8,
      '就诊预约定金',
      'service',
      '/static/product/screening.png',
      JSON.stringify(['/static/product/screening.png']),
      20000,
      20000,
      '就诊预约定金。',
      99999,
      100,
      0,
      0.0,
      'on'
    ]
  );

  // 14. Coupons
  const cp1 = await run(
    `INSERT INTO coupons (title, type, value, min_spend, status, valid_start, valid_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['新用户专享首诊抵扣券', 'cash', 3000, 5000, 'active', '2026-05-01', '2026-12-31']
  );
  const cp2 = await run(
    `INSERT INTO coupons (title, type, value, min_spend, status, valid_start, valid_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['阻鼾器商城九折券', 'discount', 10, 0, 'active', '2026-05-01', '2026-12-31'] // 10% off
  );

  // User Coupons
  await run(`INSERT INTO user_coupons (user_id, coupon_id, status) VALUES (?, ?, ?)`, [user1.id, cp2.id, 'active']);

  // 15. Orders
  const order1 = await run(
    `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ORD202606010001',
      user1.id,
      'product',
      298000,
      0,
      null,
      298000,
      'wechat',
      '2026-06-01 10:15:30',
      'paid',
      JSON.stringify({ receiver: '张华', phone: '13800138001', province: '广东省', city: '深圳市', district: '龙岗区', detail: '中心路123号科苑花园3栋201' })
    ]
  );
  await run(
    `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [order1.id, prod1.id, 'HJ-MAD-03 鼾静智能下颌前移阻鼾器', '/static/product/hj-mad-03.png', 298000, 1]
  );

  const order2 = await run(
    `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ORD202606020001',
      user3.id,
      'product',
      4900,
      0,
      null,
      4900,
      'wechat',
      '2026-06-02 14:20:11',
      'completed',
      JSON.stringify({ receiver: '王芳', phone: '13700137003', province: '广东省', city: '深圳市', district: '福田区', detail: '深南大道6008号报业大厦西侧高层' })
    ]
  );
  await run(
    `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [order2.id, prod2.id, '鼾静阻鼾器专用清洁泡腾片 (60片/盒)', '/static/product/pillow.png', 4900, 1]
  );

  // 16. Distributors & Distribution Orders
  const dist1 = await run(
    `INSERT INTO distributors (user_id, nickname, avatar_url, level, invite_code, invite_qr_url, total_commission, available_commission, withdrawn_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user1.id,
      '睡眠推广员-张华',
      '/static/demo/avatar.jpg',
      'gold',
      'ZHANG888',
      '/static/demo/qrcode.png',
      35760, // 357.60元
      12000, // 120.00元
      23760, // 237.60元
      'active'
    ]
  );

  // Distribution Relationships: User1 (张华) recommended User3 (王芳)
  await run(
    `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, ?)`,
    [user1.id, user3.id, 1]
  );

  // Commission bill: user3 bought prod2 (foam tablets) for 4900, user1 got 10% -> 490 commission
  await run(
    `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status, settled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order2.id,
      dist1.id,
      '王* (137****7003)',
      4900,
      490,
      1,
      'settled',
      '2026-06-02 14:35:00'
    ]
  );

  // 17. Withdraw Records
  await run(
    `INSERT INTO withdraw_records (user_id, amount, fee, actual_amount, status, account_info, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user1.id,
      23760,
      0,
      23760,
      'success',
      '微信零钱 (绑定的微信钱包)',
      '2026-05-20 18:00:00'
    ]
  );
  await run(
    `INSERT INTO withdraw_records (user_id, amount, fee, actual_amount, status, account_info)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user1.id,
      12000,
      0,
      12000,
      'pending',
      '微信零钱 (绑定的微信钱包)'
    ]
  );

  // 18. Live Rooms
  await run(
    `INSERT INTO live_rooms (title, cover_url, anchor_name, anchor_avatar, status, start_time, end_time, viewer_count, replay_url, product_ids, description, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '远离鼾症，深度睡眠健康公开课',
      '/static/demo/store-1.jpg',
      '古堪民 主任医师',
      '/static/demo/doctor-1.jpg',
      'replay',
      '2026-05-28 20:00:00',
      '2026-05-28 21:30:00',
      1250,
      '/static/demo/snore-demo.mp4',
      JSON.stringify([prod1.id, prod2.id]),
      '中西医结合主任医师王芳医生在线解答打鼾问题，教你如何分辨普通打鼾和睡眠呼吸暂停。',
      JSON.stringify(['科普', '义诊', '专家答疑'])
    ]
  );
  await run(
    `INSERT INTO live_rooms (title, cover_url, anchor_name, anchor_avatar, status, start_time, viewer_count, description, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '物理阻鼾器的佩戴与下颌前移微调指南',
      '/static/demo/store-2.jpg',
      '王志远 副主任医师',
      '/static/demo/doctor-2.jpg',
      'upcoming',
      '2026-06-18 19:30:00',
      328,
      '睡眠技师王志远带你了解不同类型的阻鼾器，从材质、舒适度、效果多维度对比。',
      JSON.stringify(['产品测评', '选购指南'])
    ]
  );

  // 19. Community Posts
  const post1 = await run(
    `INSERT INTO community_posts (user_id, user_role, title, content, tags, likes_count, comments_count, is_top, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user1.id,
      'patient',
      '配戴 HJ-MAD-03 阻鼾器四周体验，打鼾明显好转！',
      '以前睡觉打鼾震天响，经常憋醒。在鼾静诊所定制了HJ-MAD-03。刚配戴的前三天有些流口水，牙齿酸胀，不过按照古医生的建议清晨做做嘴部张合操，第四天就完全适应了。现在老婆说我基本上不打鼾了，白天精神也好了很多，整个人神清气爽！',
      JSON.stringify(['阻鼾器配戴', '打鼾治疗', 'OSAHS改善']),
      28,
      5,
      1,
      'approved'
    ]
  );

  // Post Comments
  await run(
    `INSERT INTO post_comments (post_id, user_id, content, likes_count, status)
     VALUES (?, ?, ?, ?, ?)`,
    [
      post1.id,
      user2.id,
      '真的这么管用吗？我也经常憋醒，感觉每天都睡不饱，准备预约个周末的号去看看。',
      8,
      'approved'
    ]
  );
  await run(
    `INSERT INTO post_comments (post_id, user_id, content, likes_count, status)
     VALUES (?, ?, ?, ?, ?)`,
    [
      post1.id,
      user1.id,
      '管用的，你可以先做个问卷自测和录音评估，然后带着结果去，医生看诊时更针对性。',
      3,
      'approved'
    ]
  );

  // 31. Seed Historical Doctor Appointments & Evaluations
  console.log('Seeding extra historical appointments and evaluations...');
  
  // Doctor 1: 古堪民 (12 appointments, 8 evaluations)
  const doc1ApptIds = [];
  for (let i = 1; i <= 12; i++) {
    const apptNo = `APPT_SEED_D1_${String(i).padStart(4, '0')}`;
    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apptNo,
        user1.id,
        patient1.id,
        store1.id,
        doc1.id,
        1,
        '2026-05-28',
        '09:00 - 09:30',
        'first',
        i <= 10 ? 'completed' : 'pending',
        `打鼾评估与常规咨询 #${i}`
      ]
    );
    doc1ApptIds.push(result.id);
  }
  
  // Seed evaluations for Doctor 1 (Target average: 4.9)
  const d1Ratings = [5, 5, 4.8, 5, 4.9, 5, 5, 4.8];
  for (let i = 0; i < d1Ratings.length; i++) {
    await run(
      `INSERT INTO appointment_evaluations (appointment_id, doctor_id, user_id, rating, content)
       VALUES (?, ?, ?, ?, ?)`,
      [
        doc1ApptIds[i],
        doc1.id,
        user1.id,
        d1Ratings[i],
        `古医生非常专业，态度很好，给的阻鼾器调节方案非常管用，睡觉不打鼾了。评价 #${i+1}`
      ]
    );
  }

  // Doctor 2: 王志远 (10 appointments, 6 evaluations)
  const doc2ApptIds = [];
  for (let i = 1; i <= 10; i++) {
    const apptNo = `APPT_SEED_D2_${String(i).padStart(4, '0')}`;
    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apptNo,
        user2.id,
        patient3.id,
        store1.id,
        doc2.id,
        3,
        '2026-05-28',
        '10:30 - 11:00',
        'first',
        i <= 8 ? 'completed' : 'pending',
        `耳鼻喉科阻鼾器筛查咨询 #${i}`
      ]
    );
    doc2ApptIds.push(result.id);
  }

  // Seed evaluations for Doctor 2 (Target average: 4.8)
  const d2Ratings = [5, 4.8, 4.5, 5, 4.8, 4.7];
  for (let i = 0; i < d2Ratings.length; i++) {
    await run(
      `INSERT INTO appointment_evaluations (appointment_id, doctor_id, user_id, rating, content)
       VALUES (?, ?, ?, ?, ?)`,
      [
        doc2ApptIds[i],
        doc2.id,
        user2.id,
        d2Ratings[i],
        `王医生检查得很细致，分析了上气道阻塞的具体原因，非常有帮助。评价 #${i+1}`
      ]
    );
  }

  // Doctor 3: 刘婉清 (8 appointments, 5 evaluations)
  const doc3ApptIds = [];
  for (let i = 1; i <= 8; i++) {
    const apptNo = `APPT_SEED_D3_${String(i).padStart(4, '0')}`;
    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apptNo,
        user1.id,
        patient1.id,
        store3.id,
        doc3.id,
        3,
        '2026-05-28',
        '14:30 - 15:00',
        'first',
        i <= 6 ? 'completed' : 'pending',
        `睡眠行为干预与习惯随访 #${i}`
      ]
    );
    doc3ApptIds.push(result.id);
  }

  // Seed evaluations for Doctor 3 (Target average: 4.9)
  const d3Ratings = [5, 5, 4.8, 5, 4.7];
  for (let i = 0; i < d3Ratings.length; i++) {
    await run(
      `INSERT INTO appointment_evaluations (appointment_id, doctor_id, user_id, rating, content)
       VALUES (?, ?, ?, ?, ?)`,
      [
        doc3ApptIds[i],
        doc3.id,
        user1.id,
        d3Ratings[i],
        `刘医生的睡眠干预方案很管用，帮助我调整了心理依从性，现在佩戴阻鼾器很顺畅。评价 #${i+1}`
      ]
    );
  }

  await injectNewDistributionSeeds();
  try {
    await injectImSeeds();
  } catch (e) {
    console.error('Failed to inject IM seeds:', e);
  }
  console.log('Database seeded successfully.');
};

const injectNewDistributionSeeds = async () => {
  try {
    // 1. Get user1 and user2
    const user1 = await query("SELECT id FROM users WHERE openid = 'openid_user_1'");
    const user2 = await query("SELECT id FROM users WHERE openid = 'openid_user_2'");
    if (user1.length === 0 || user2.length === 0) {
      console.log('Skipping seed injection: seeded users not found.');
      return;
    }
    const user1Id = user1[0].id;
    const user2Id = user2[0].id;

    // 2. Add User2 as a distributor
    await run(
      `INSERT INTO distributors (user_id, nickname, avatar_url, level, invite_code, invite_qr_url, total_commission, available_commission, withdrawn_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user2Id,
        '睡眠推广员-李明',
        '/static/demo/avatar-2.jpg',
        'silver',
        'LIMING666',
        '/static/demo/qrcode.png',
        0,
        0,
        0,
        'active'
      ]
    );

    // 3. Relationship: User1 (张华) recommended User2 (李明)
    await run(
      `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, ?)`,
      [user1Id, user2Id, 1]
    );

    // 4. Create new user 4 recommended by User2
    const user4 = await run(
      `INSERT INTO users (openid, nickname, phone, avatar_url, member_level, points, total_spent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['openid_user_4', '微信用户-赵达', '13600136004', null, 'normal', 0, 0]
    );

    const patient5 = await run(
      `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [await nextPatientNo(), user4.id, '赵达', 'self', 1, 35, '13600136004', 1]
    );

    // 5. Relationship: User2 (李明) recommended User4 (赵达)
    await run(
      `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, ?)`,
      [user2Id, user4.id, 1]
    );

    // 6. Create appointment for User4 (赵达)
    const store = await query("SELECT id FROM stores LIMIT 1");
    const doctor = await query("SELECT id FROM doctors LIMIT 1");
    const schedule = await query("SELECT id FROM doctor_schedules LIMIT 1");
    
    if (store.length > 0 && doctor.length > 0 && schedule.length > 0) {
      await run(
        `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'AP202606140001',
          user4.id,
          patient5.id,
          store[0].id,
          doctor[0].id,
          schedule[0].id,
          '2026-06-14',
          '10:00-10:30',
          'first',
          'pending',
          '经常打鼾，被家人抱怨'
        ]
      );
      console.log('Successfully injected new distribution seed data.');
    } else {
      console.log('Skipping appointment seeding: store, doctor or schedule missing.');
    }
  } catch (error) {
    console.error('Failed to inject distribution seeds:', error);
  }
};

const injectImSeeds = async () => {
  try {
    const imCount = await query('SELECT count(*) as count FROM im_messages');
    if (imCount[0].count > 0) {
      console.log('IM database already has data. Skipping IM seeding.');
      return;
    }

    console.log('Seeding IM mock data into database...');
    let patientZhang = await query("SELECT id FROM patients WHERE name = '张华' LIMIT 1");
    let patientLi = await query("SELECT id FROM patients WHERE name = '李明' LIMIT 1");
    let patientWang = await query("SELECT id FROM patients WHERE name = '王芳' LIMIT 1");

    if (patientZhang.length === 0) {
      patientZhang = await query("SELECT id FROM patients LIMIT 1");
    }
    if (patientLi.length === 0) {
      patientLi = await query("SELECT id FROM patients LIMIT 1");
    }
    if (patientWang.length === 0) {
      patientWang = await query("SELECT id FROM patients LIMIT 1");
    }

    const zhangId = patientZhang.length > 0 ? patientZhang[0].id : null;
    const liId = patientLi.length > 0 ? patientLi[0].id : null;
    const wangId = patientWang.length > 0 ? patientWang[0].id : null;

    if (zhangId) {
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [zhangId, 'patient', '张华', '李医生您好，我已经配戴 HJ-MAD-03 阻鼾器三周了。', 1, '2026-06-25 10:40:00']
      );
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [zhangId, 'doctor', '李医生', '张先生您好，最近佩戴感觉如何？昨晚的睡眠数据我看到您的依从率是 100%，佩戴时长 7.5 小时。', 1, '2026-06-25 10:42:00']
      );
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [zhangId, 'patient', '张华', '最近打鼾确实声音变小了很多，我爱人说效果很明显。不过就是晚上下颌感觉有些微酸，要调小刻度吗？', 0, '2026-06-25 10:45:00']
      );
    }

    if (liId && liId !== zhangId) {
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [liId, 'patient', '李明', '医生，下周五李明辉医生在福田门诊部坐诊吗？我想去复查一下。', 1, '2026-06-25 09:20:00']
      );
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [liId, 'doctor', '客服助理', '是的，李医生下周五全天在福田门诊部坐诊，您可以直接在小程序上预约挂号。', 1, '2026-06-25 09:25:00']
      );
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [liId, 'patient', '李明', '好的，谢谢医生，下周五我准时去门诊复诊。', 0, '2026-06-25 09:30:00']
      );
    }

    if (wangId && wangId !== liId && wangId !== zhangId) {
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [wangId, 'doctor', '客服助理', '王女士，您的阻鼾器清洁和维护状况良好，建议每周使用泡腾片清洗 2-3 次。', 1, '2026-06-25 08:00:00']
      );
      await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [wangId, 'patient', '王芳', '我的清洁泡腾片快用完了，商城里可以直接买吧？', 0, '2026-06-25 08:15:00']
      );
    }
    console.log('IM mock data seeded successfully.');
  } catch (error) {
    console.error('Failed to seed IM mock data:', error);
  }
};
