import { query } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  try {
    const treatmentRecordsList = await query(`
      SELECT tr.id as treatment_id, tr.patient_id, p.user_id 
      FROM treatment_records tr
      JOIN patients p ON tr.patient_id = p.id
    `);
    
    console.log('Found treatment records:', treatmentRecordsList);
    const today = new Date();
    
    for (const tr of treatmentRecordsList) {
      const timelineCount = await query('SELECT COUNT(*) as count FROM treatment_timelines WHERE user_id = ? AND patient_id = ?', [tr.user_id, tr.patient_id]);
      console.log(`User ${tr.user_id} patient ${tr.patient_id} has ${timelineCount[0].count} timeline records.`);
      if (timelineCount[0].count === 0) {
        const dates = [
          new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000),
          new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)
        ];
        const timelineData = [
          ['建立疗程档案', '针对中重度阻塞性睡眠呼吸暂停(OSAHS)及顽固打鼾设计，采用食品级高分子材质，下颌前移微调精度达0.5mm，智能监测传感器自动上传睡眠佩戴时长与质量数据。', 'visit', '王芳', '#1A9D5C', 'start'],
          ['阻鼾器设计与制作', '定制式阻鼾器设计制作完成，型号：HJ-MAD-03。', 'milestone', '陈技师', '#3B6BF5', 'device'],
          ['阻鼾器佩戴调试', '王医生为您完成了阻鼾器首次试戴和下颌前移量微调（初始前移：4.0mm）。', 'adjust', '王医生', '#F59E0B', 'adjust']
        ];
        for (let j = 0; j < dates.length; j++) {
          const dateStr = `${dates[j].getFullYear()}-${String(dates[j].getMonth() + 1).padStart(2, '0')}-${String(dates[j].getDate()).padStart(2, '0')}`;
          await query(`
            INSERT INTO treatment_timelines (user_id, patient_id, treatment_id, event_date, event_title, event_desc, event_type, doctor_name, color, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [tr.user_id, tr.patient_id, tr.treatment_id, dateStr, timelineData[j][0], timelineData[j][1], timelineData[j][2], timelineData[j][3], timelineData[j][4], timelineData[j][5]]);
        }
        console.log(`Successfully seeded default treatment timelines for user ${tr.user_id}, patient ${tr.patient_id}`);
      }
      
      const wearingCount = await query('SELECT COUNT(*) as count FROM wearing_records WHERE user_id = ?', [tr.user_id]);
      console.log(`User ${tr.user_id} has ${wearingCount[0].count} wearing records.`);
      if (wearingCount[0].count === 0) {
        for (let i = 1; i <= 7; i++) {
          const pastDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
          const duration = Math.floor(400 + Math.random() * 120);
          const comfort = Math.floor(4 + Math.random() * 2); // 4 or 5
          const decibel = Math.floor(35 + Math.random() * 15);
          const apnea = Math.floor(Math.random() * 3);
          const s = [
            "首次佩戴，有轻微异物感",
            "逐渐适应，无不适",
            "佩戴感良好，睡眠质量改善",
            "",
            "颞下颌关节略有酸胀",
            "调整后舒适度提升"
          ];
          const note = s[i % s.length];

          await query(`
            INSERT INTO wearing_records (user_id, wearing_date, start_time, end_time, duration_mins, comfort_score, snore_decibel, apnea_events, note)
            VALUES (?, ?, '22:30:00', '06:30:00', ?, ?, ?, ?, ?)
          `, [tr.user_id, dateStr, duration, comfort, decibel, apnea, note || null]);
        }
        console.log(`Successfully seeded default wearing records for user ${tr.user_id}`);
      }
    }
  } catch (err) {
    console.error('Failed to query or seed:', err);
  }
  process.exit(0);
}

runTest();
