import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, get, run, transaction } from '../db.js';
import {
  JWT_SECRET,
  checkStoreIsOpen,
  verifyPatientAccess,
  verifyUserAccess,
  maskPhone,
  logAdminAction,
  authenticateWxToken,
  escapeHtml
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


// ----------------------------------------
// 11. WECHAT MINI PROGRAM API (v1)
// ----------------------------------------


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
      const existingUserByPhone = await get(`SELECT * FROM users WHERE phone = ?`, [phone]);
      if (existingUserByPhone) {
        await run(`UPDATE users SET openid = ? WHERE id = ?`, [openid, existingUserByPhone.id]);
        user = existingUserByPhone;
        user.openid = openid;
      } else {
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
      }
    } else {
      if (phoneCode && (!user.phone || user.phone === '13800000000')) {
        const existingUserByPhone = await get(`SELECT * FROM users WHERE phone = ? AND id != ?`, [phone, user.id]);
        if (!existingUserByPhone) {
          await run(`UPDATE users SET phone = ? WHERE id = ?`, [phone, user.id]);
          await run(`UPDATE patients SET phone = ? WHERE user_id = ? AND relation = 'self'`, [phone, user.id]);
          user.phone = phone;
        } else {
          await run(`UPDATE users SET openid = NULL WHERE id = ?`, [user.id]);
          await run(`UPDATE users SET openid = ? WHERE id = ?`, [openid, existingUserByPhone.id]);
          user = existingUserByPhone;
          user.openid = openid;
        }
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
    try {
      fs.appendFileSync('./login_errors.log', `[${new Date().toISOString()}] Error: ${error.message}\nStack: ${error.stack}\nBody: ${JSON.stringify(req.body)}\n\n`);
    } catch (e) {}
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
        birthday: user.birthday ? formatDate(user.birthday) : '1995-01-01',
        memberLevel: user.member_level || 'normal'
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取个人资料失败' });
  }
});

// 3. User Profile (PUT)
app.put('/api/v1/user/profile', authenticateWxToken, async (req, res) => {
  const { nickname, phone, gender, age, birthday } = req.body;
  const nicknameClean = nickname ? escapeHtml(nickname) : null;
  const phoneClean = phone ? escapeHtml(phone) : null;
  const birthdayClean = birthday === '' || !birthday ? null : birthday;
  const genderClean = gender !== undefined ? gender : null;
  const ageClean = age !== undefined ? age : null;
  try {
    await run(
      `UPDATE users SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone), birthday = COALESCE(?, birthday) WHERE id = ?`,
      [nicknameClean, phoneClean, birthdayClean, req.user.id]
    );
    await run(
      `UPDATE patients SET name = COALESCE(?, name), gender = COALESCE(?, gender), age = COALESCE(?, age), phone = COALESCE(?, phone) 
       WHERE user_id = ? AND relation = 'self'`,
      [nicknameClean, genderClean, ageClean, phoneClean, req.user.id]
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
        birthday: user.birthday ? formatDate(user.birthday) : null,
        memberLevel: user.member_level || 'normal'
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ code: 500, message: '更新资料失败' });
  }
});

// 3.1 Account Security (GET)
app.get('/api/v1/user/account-security', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户未找到' });
    }
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    
    // Masking helper for phone
    const phoneFull = user.phone || (patient ? patient.phone : '');
    let phoneMasked = '未绑定';
    if (phoneFull && phoneFull.length >= 7) {
      phoneMasked = `${phoneFull.slice(0, 3)}****${phoneFull.slice(-4)}`;
    }
    
    // Masking helper for real name
    const realName = patient ? patient.name : '';
    let realNameMasked = '未认证';
    let realNameVerified = false;
    if (realName && realName !== '微信用户' && !realName.startsWith('微信用户_')) {
      realNameVerified = true;
      if (realName.length === 2) {
        realNameMasked = `${realName[0]}*`;
      } else if (realName.length > 2) {
        realNameMasked = `${realName[0]}*${realName.slice(-1)}`;
      } else {
        realNameMasked = realName;
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        phone: phoneMasked,
        hasPassword: false,
        lastLogin: user.updated_at || user.created_at || new Date().toISOString(),
        loginDevice: '微信小程序 (WeChat Miniprogram)',
        realNameVerified: realNameVerified,
        realName: realNameMasked
      }
    });
  } catch (error) {
    console.error('Get account security error:', error);
    res.status(500).json({ code: 500, message: '获取账号安全信息失败' });
  }
});

// --- Sleep & Snore Assessments ---

// Static folder serving for uploaded snore audio files
app.use('/uploads', express.static('./uploads'));

// GET /api/v1/assessments
app.get('/api/v1/assessments', authenticateWxToken, async (req, res) => {
  try {
    const essList = await query(`SELECT * FROM ess_assessments WHERE user_id = ?`, [req.user.id]);
    const snoreList = await query(`SELECT * FROM snore_assessments WHERE user_id = ?`, [req.user.id]);

    const formattedEss = essList.map(item => {
      const score = item.total_score;
      let advice = '暂无建议';
      if (score <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
      else if (score <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
      else if (score <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
      else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

      return {
        id: 'asmt-' + item.id,
        userId: item.user_id.toString(),
        patientId: 'pat-self',
        type: 'ess',
        essAnswers: JSON.parse(item.answers),
        essScore: score,
        essLevel: item.risk_level,
        recommendation: advice,
        createdAt: item.created_at
      };
    });

    const formattedSnore = snoreList.map(item => {
      let advice = '暂无建议';
      if (item.risk_level === 'normal' || item.risk_level === 'low') advice = '您的鼾声分析在正常范围内，睡眠呼吸暂停风险较低。';
      else if (item.risk_level === 'mild') advice = '您的鼾声分析显示有轻度风险，可能存在间歇性打鼾，建议侧卧睡眠并注意观察。';
      else if (item.risk_level === 'moderate') advice = '您的鼾声分析显示中度风险，有明显的呼吸暂停征兆。建议预约线下门诊进行睡眠呼吸阻鼾器适配评估。';
      else advice = '您的鼾声分析显示重度风险，Apnea事件频发。强烈建议尽早前往诊所进行多导睡眠监测（PSG）或佩戴舌型阻鼾器。';

      return {
        id: 'snore-' + item.id,
        userId: item.user_id.toString(),
        patientId: 'pat-self',
        type: 'ai_snore',
        snoreRecordUrl: item.file_url,
        snoreAnalysis: {
          duration: item.duration,
          avgDecibel: item.avg_decibel,
          peakDecibel: item.peak_decibel,
          snoreRate: item.snore_rate,
          apneaEvents: item.apnea_events,
          riskLevel: item.risk_level
        },
        recommendation: advice,
        createdAt: item.created_at
      };
    });

    const combined = [...formattedEss, ...formattedSnore].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      code: 0,
      message: 'success',
      data: combined
    });
  } catch (error) {
    console.error('getAssessments error:', error);
    res.status(500).json({ code: 500, message: '获取评估记录失败' });
  }
});

// GET /api/v1/assessments/ess-questions
app.get('/api/v1/assessments/ess-questions', authenticateWxToken, (req, res) => {
  const questions = [
    { id: 1, situation: "坐着看书或读报时", emoji: "📖", hint: "请回想您近期的日常状态" },
    { id: 2, situation: "看电视时", emoji: "📺", hint: "放松状态下是否容易睡着" },
    { id: 3, situation: "在公共场所坐着不动（如在剧院或开会）", emoji: "🏛️", hint: "在安静的公共场合" },
    { id: 4, situation: "作为乘客乘坐汽车1小时以上", emoji: "🚗", hint: "作为乘客而非驾驶员" },
    { id: 5, situation: "下午躺下休息时", emoji: "🛋️", hint: "环境允许时是否能保持清醒" },
    { id: 6, situation: "坐着与人交谈时", emoji: "💬", hint: "与他人面对面聊天" },
    { id: 7, situation: "午餐后安静坐着（未饮酒）", emoji: "🍽️", hint: "饭后不喝酒的情况下" },
    { id: 8, situation: "在车中，因交通堵塞停车几分钟", emoji: "🚦", hint: "作为驾驶员短暂停车时" }
  ];
  res.json({
    code: 0,
    message: 'success',
    data: questions
  });
});

// POST /api/v1/assessments/ess
app.post('/api/v1/assessments/ess', authenticateWxToken, async (req, res) => {
  const { answers, patientId } = req.body;
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ code: 400, message: '答案不能为空且必须是数组' });
  }

  try {
    const totalScore = answers.reduce((acc, val) => acc + val, 0);
    let riskLevel = 'normal';
    if (totalScore <= 5) riskLevel = 'normal';
    else if (totalScore <= 10) riskLevel = 'mild';
    else if (totalScore <= 15) riskLevel = 'moderate';
    else riskLevel = 'severe';

    const result = await run(
      `INSERT INTO ess_assessments (user_id, total_score, risk_level, answers) VALUES (?, ?, ?, ?)`,
      [req.user.id, totalScore, riskLevel, JSON.stringify(answers)]
    );

    let advice = '';
    if (totalScore <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
    else if (totalScore <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
    else if (totalScore <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
    else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: 'asmt-' + result.id,
        userId: req.user.id.toString(),
        patientId: patientId || 'pat-self',
        type: 'ess',
        essAnswers: answers,
        essScore: totalScore,
        essLevel: riskLevel,
        recommendation: advice,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('submitESS error:', error);
    res.status(500).json({ code: 500, message: '提交ESS评估失败' });
  }
});

// POST /api/v1/assessments/snore
app.post('/api/v1/assessments/snore', authenticateWxToken, async (req, res) => {
  const { duration, fileData, fileName } = req.body;
  if (!duration) {
    return res.status(400).json({ code: 400, message: '时长不能为空' });
  }

  try {
    let fileUrl = '/static/demo/snore-demo.mp4';

    if (fileData) {
      if (!fs.existsSync('./uploads/snore')) {
        fs.mkdirSync('./uploads/snore', { recursive: true });
      }
      const baseName = path.basename(fileName || 'snore.m4a');
      const cleanFileName = baseName.replace(/[^a-zA-Z0-9_.-]/g, '');
      const safeFileName = `${Date.now()}_${cleanFileName || 'snore.m4a'}`;
      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(`./uploads/snore/${safeFileName}`, buffer);
      fileUrl = `/uploads/snore/${safeFileName}`;
    }

    const snoreRate = 25 + Math.floor(Math.random() * 55);
    const apneaEvents = Math.floor((duration / 3600) * (5 + Math.random() * 35));
    const avgDecibel = 45 + Math.floor(Math.random() * 20);
    const peakDecibel = avgDecibel + 10 + Math.floor(Math.random() * 20);

    let riskLevel = 'low';
    if (apneaEvents < 5) riskLevel = 'normal';
    else if (apneaEvents < 15) riskLevel = 'mild';
    else if (apneaEvents < 30) riskLevel = 'moderate';
    else riskLevel = 'severe';

    const result = await run(
      `INSERT INTO snore_assessments (user_id, file_url, duration, avg_decibel, peak_decibel, snore_rate, apnea_events, risk_level) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, fileUrl, duration, avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel]
    );

    let advice = '';
    if (riskLevel === 'normal' || riskLevel === 'low') advice = '您的鼾声分析在正常范围内，睡眠呼吸暂停风险较低。';
    else if (riskLevel === 'mild') advice = '您的鼾声分析显示有轻度风险，可能存在间歇性打鼾，建议侧卧睡眠并注意观察。';
    else if (riskLevel === 'moderate') advice = '您的鼾声分析显示中度风险，有明显的呼吸暂停征兆。建议预约线下门诊进行睡眠呼吸阻鼾器适配评估。';
    else advice = '您的鼾声分析显示重度风险，Apnea事件频发。强烈建议尽早前往诊所进行多导睡眠监测（PSG）或佩戴舌型阻鼾器。';

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: 'snore-' + result.id,
        userId: req.user.id.toString(),
        patientId: 'pat-self',
        type: 'ai_snore',
        snoreRecordUrl: fileUrl,
        snoreAnalysis: {
          duration,
          avgDecibel,
          peakDecibel,
          snoreRate,
          apneaEvents,
          riskLevel
        },
        recommendation: advice,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('submitSnore error:', error);
    res.status(500).json({ code: 500, message: '提交鼾声录音失败' });
  }
});

// GET /api/v1/assessments/snore-analysis/:id
app.get('/api/v1/assessments/snore-analysis/:id', authenticateWxToken, async (req, res) => {
  const paramId = req.params.id;
  try {
    if (paramId.startsWith('snore-')) {
      const realId = parseInt(paramId.replace('snore-', ''), 10);
      const item = await get(`SELECT * FROM snore_assessments WHERE id = ?`, [realId]);
      if (!item) {
        return res.status(404).json({ code: 404, message: '评估记录不存在' });
      }

      let advice = '';
      if (item.risk_level === 'normal' || item.risk_level === 'low') advice = '您的鼾声分析在正常范围内，睡眠呼吸暂停风险较低。';
      else if (item.risk_level === 'mild') advice = '您的鼾声分析显示有轻度风险，可能存在间歇性打鼾，建议侧卧睡眠并注意观察。';
      else if (item.risk_level === 'moderate') advice = '您的鼾声分析显示中度风险，有明显的呼吸暂停征兆。建议预约线下门诊进行睡眠呼吸阻鼾器适配评估。';
      else advice = '您的鼾声分析显示重度风险，Apnea事件频发。强烈建议尽早前往诊所进行多导睡眠监测（PSG）或佩戴舌型阻鼾器。';

      return res.json({
        code: 0,
        message: 'success',
        data: {
          id: 'snore-' + item.id,
          userId: item.user_id.toString(),
          patientId: 'pat-self',
          type: 'ai_snore',
          snoreRecordUrl: item.file_url,
          snoreAnalysis: {
            duration: item.duration,
            avgDecibel: item.avg_decibel,
            peakDecibel: item.peak_decibel,
            snoreRate: item.snore_rate,
            apneaEvents: item.apnea_events,
            riskLevel: item.risk_level
          },
          recommendation: advice,
          createdAt: item.created_at
        }
      });
    } else if (paramId.startsWith('asmt-')) {
      const realId = parseInt(paramId.replace('asmt-', ''), 10);
      const item = await get(`SELECT * FROM ess_assessments WHERE id = ?`, [realId]);
      if (!item) {
        return res.status(404).json({ code: 404, message: '评估记录不存在' });
      }

      let advice = '';
      const score = item.total_score;
      if (score <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
      else if (score <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
      else if (score <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
      else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

      return res.json({
        code: 0,
        message: 'success',
        data: {
          id: 'asmt-' + item.id,
          userId: item.user_id.toString(),
          patientId: 'pat-self',
          type: 'ess',
          essAnswers: JSON.parse(item.answers),
          essScore: score,
          essLevel: item.risk_level,
          recommendation: advice,
          createdAt: item.created_at
        }
      });
    }

    res.status(400).json({ code: 400, message: '无效的评估ID' });
  } catch (error) {
    console.error('getSnoreAnalysis error:', error);
    res.status(500).json({ code: 500, message: '获取评估详情失败' });
  }
});

// --- Community Forum Endpoints ---

// GET /api/v1/community/posts
app.get('/api/v1/community/posts', async (req, res) => {
  try {
    const list = await query(
      `SELECT p.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 'approved'
       ORDER BY p.is_top DESC, p.created_at DESC`
    );

    const formatted = list.map(p => ({
      id: p.id,
      author: p.author_name || '普通患者',
      avatar: p.author_avatar || '/static/demo/avatar.jpg',
      role: p.user_role,
      roleLabel: p.user_role === 'doctor' ? '专家医生' : p.user_role === 'expert' ? '睡眠专家' : '鼾友',
      title: p.title,
      content: p.content,
      tags: p.tags ? JSON.parse(p.tags) : [],
      likes: p.likes_count,
      comments: p.comments_count,
      isTop: p.is_top === 1,
      createdAt: p.created_at,
      isLiked: false
    }));

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    console.error('getCommunityPosts error:', error);
    res.status(500).json({ code: 500, message: '获取帖子列表失败' });
  }
});

// GET /api/v1/community/posts/:id
app.get('/api/v1/community/posts/:id', async (req, res) => {
  const postId = req.params.id;
  try {
    const post = await get(
      `SELECT p.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.status = 'approved'`,
      [postId]
    );

    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在或未通过审核' });
    }

    const comments = await query(
      `SELECT c.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM post_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ? AND c.status = 'approved'
       ORDER BY c.created_at ASC`,
      [postId]
    );

    const formattedComments = comments.map(c => ({
      id: c.id,
      author: c.author_name || '普通患者',
      avatar: c.author_avatar || '/static/demo/avatar.jpg',
      content: c.content,
      likes: c.likes_count,
      createdAt: c.created_at
    }));

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: post.id,
        author: post.author_name || '普通患者',
        avatar: post.author_avatar || '/static/demo/avatar.jpg',
        role: post.user_role,
        roleLabel: post.user_role === 'doctor' ? '专家医生' : post.user_role === 'expert' ? '睡眠专家' : '鼾友',
        title: post.title,
        content: post.content,
        tags: post.tags ? JSON.parse(post.tags) : [],
        likes: post.likes_count,
        commentsCount: post.comments_count,
        isTop: post.is_top === 1,
        createdAt: post.created_at,
        isLiked: false,
        comments: formattedComments
      }
    });
  } catch (error) {
    console.error('getCommunityPostDetail error:', error);
    res.status(500).json({ code: 500, message: '获取帖子详情失败' });
  }
});

// POST /api/v1/community/posts
app.post('/api/v1/community/posts', authenticateWxToken, async (req, res) => {
  const { title, content, tags } = req.body;
  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '标题和内容不能为空' });
  }

  const titleClean = escapeHtml(title);
  const contentClean = escapeHtml(content);
  const tagsClean = Array.isArray(tags) ? tags.map(t => typeof t === 'string' ? escapeHtml(t) : t) : [];

  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    let role = 'patient';
    if (user.role === 'doctor' || user.role === 'admin') {
      role = 'doctor';
    }

    const status = 'approved'; 

    const result = await run(
      `INSERT INTO community_posts (user_id, user_role, title, content, tags, likes_count, comments_count, is_top, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      [req.user.id, role, titleClean, contentClean, JSON.stringify(tagsClean), status]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id,
        author: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        role,
        roleLabel: role === 'doctor' ? '专家医生' : '鼾友',
        title: titleClean,
        content: contentClean,
        tags: tagsClean,
        likes: 0,
        comments: 0,
        isTop: false,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('createPost error:', error);
    res.status(500).json({ code: 500, message: '发布帖子失败' });
  }
});

// POST /api/v1/community/posts/:id/like
app.post('/api/v1/community/posts/:id/like', authenticateWxToken, async (req, res) => {
  const postId = req.params.id;
  const { isLiked } = req.body;
  try {
    const change = isLiked ? 1 : -1;
    await run(
      `UPDATE community_posts SET likes_count = GREATEST(0, likes_count + ?) WHERE id = ?`,
      [change, postId]
    );
    res.json({ code: 0, message: 'success' });
  } catch (error) {
    console.error('likePost error:', error);
    res.status(500).json({ code: 500, message: '点赞失败' });
  }
});

// POST /api/v1/community/posts/:id/comment
app.post('/api/v1/community/posts/:id/comment', authenticateWxToken, async (req, res) => {
  const postId = req.params.id;
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ code: 400, message: '评论内容不能为空' });
  }

  const contentClean = escapeHtml(content);

  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const result = await run(
      `INSERT INTO post_comments (post_id, user_id, content, likes_count, status) VALUES (?, ?, ?, 0, 'approved')`,
      [postId, req.user.id, contentClean]
    );

    await run(
      `UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?`,
      [postId]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id,
        author: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        content: contentClean,
        likes: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('commentPost error:', error);
    res.status(500).json({ code: 500, message: '评论失败' });
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

  const nameClean = escapeHtml(name);
  const relationClean = relation ? escapeHtml(relation) : 'other';
  const phoneClean = phone ? escapeHtml(phone) : null;

  try {
    const genderVal = gender === '男' || gender === 1 ? 1 : gender === '女' || gender === 2 ? 2 : 0;
    const result = await run(
      `INSERT INTO patients (user_id, name, relation, gender, age, phone, has_snore) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [req.user.id, nameClean, relationClean, genderVal, age || null, phoneClean]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id.toString(),
        name: nameClean,
        relation: relationClean,
        gender: genderVal,
        age,
        phone: phoneClean,
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
    const storeIds = list.map(s => s.id);
    
    let allFeatures = [];
    let allDocCounts = [];
    let allHours = [];

    if (storeIds.length > 0) {
      const placeholders = storeIds.map(() => '?').join(',');
      allFeatures = await query(`SELECT store_id, feature FROM store_features WHERE store_id IN (${placeholders})`, storeIds);
      allDocCounts = await query(`SELECT store_id, COUNT(*) as count FROM doctor_store_mapping WHERE store_id IN (${placeholders}) GROUP BY store_id`, storeIds);
      allHours = await query(`SELECT store_id, open_time, close_time FROM store_hours WHERE store_id IN (${placeholders})`, storeIds);
    }

    const featuresMap = {};
    allFeatures.forEach(f => {
      if (!featuresMap[f.store_id]) featuresMap[f.store_id] = [];
      featuresMap[f.store_id].push(f.feature);
    });

    const docCountsMap = {};
    allDocCounts.forEach(d => {
      docCountsMap[d.store_id] = d.count;
    });

    const hoursMap = {};
    allHours.forEach(h => {
      if (!hoursMap[h.store_id]) hoursMap[h.store_id] = [];
      hoursMap[h.store_id].push(h);
    });

    const formatted = [];
    for (const store of list) {
      const features = featuresMap[store.id] || [];
      const doctorCount = docCountsMap[store.id] || 0;
      const hours = hoursMap[store.id] || [];

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
        features: features,
        tags: features,
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
  const { storeId, latitude, longitude } = req.query;
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
      let userId = null;
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded && decoded.id) {
            userId = decoded.id;
          }
        } catch (err) {
          // ignore
        }
      }

      // Get all active/on-duty doctors
      const allActiveDoctors = await query(`SELECT * FROM doctors WHERE status = 1`);
      
      if (allActiveDoctors.length === 0) {
        list = [];
      } else {
        const activeDoctorIds = allActiveDoctors.map(d => d.id);
        const placeholders = activeDoctorIds.map(() => '?').join(',');
        
        // Load global evaluation stats to calculate Bayesian Average
        const allEvalStatsGlobal = await query(
          `SELECT doctor_id, COUNT(*) as count, AVG(rating) as avg_rating 
           FROM appointment_evaluations 
           WHERE doctor_id IN (${placeholders}) 
           GROUP BY doctor_id`, 
          activeDoctorIds
        );
        
        const evalStatsMapGlobal = {};
        allEvalStatsGlobal.forEach(e => {
          evalStatsMapGlobal[e.doctor_id] = { count: e.count, avg_rating: e.avg_rating };
        });

        // Compute global metrics for Bayesian Average
        let totalRatingSum = 0;
        let doctorsWithReviewsCount = 0;
        let totalReviewsCount = 0;
        allActiveDoctors.forEach(d => {
          const stats = evalStatsMapGlobal[d.id];
          if (stats && stats.count > 0) {
            totalRatingSum += Number(stats.avg_rating);
            totalReviewsCount += stats.count;
            doctorsWithReviewsCount++;
          }
        });
        
        const globalAvgRating = doctorsWithReviewsCount > 0 ? (totalRatingSum / doctorsWithReviewsCount) : 5.0;
        const globalAvgReviews = doctorsWithReviewsCount > 0 ? (totalReviewsCount / doctorsWithReviewsCount) : 1.0;

        // Load doctor store mappings to compute distance scoring
        const allMappingsGlobal = await query(
          `SELECT doctor_id, store_id FROM doctor_store_mapping WHERE doctor_id IN (${placeholders})`,
          activeDoctorIds
        );
        
        const doctorStoreMapGlobal = {};
        allMappingsGlobal.forEach(m => {
          if (!doctorStoreMapGlobal[m.doctor_id]) {
            doctorStoreMapGlobal[m.doctor_id] = [];
          }
          doctorStoreMapGlobal[m.doctor_id].push(m.store_id);
        });

        // Determine closest store
        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);
        let closestStoreId = null;

        if (!isNaN(userLat) && !isNaN(userLng)) {
          const stores = await query(`SELECT id, latitude, longitude FROM stores WHERE status = 'open'`);
          let minDistance = Infinity;
          
          const getDistance = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Radius of Earth in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = 
              Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
          };

          stores.forEach(store => {
            const storeLat = parseFloat(store.latitude);
            const storeLng = parseFloat(store.longitude);
            if (!isNaN(storeLat) && !isNaN(storeLng)) {
              const distance = getDistance(userLat, userLng, storeLat, storeLng);
              if (distance < minDistance) {
                minDistance = distance;
                closestStoreId = store.id;
              }
            }
          });
        }

        // Determine average exposure count across all active doctors
        let totalExposures = 0;
        allActiveDoctors.forEach(d => {
          totalExposures += (d.exposure_count || 0);
        });
        const avgExposure = allActiveDoctors.length > 0 ? (totalExposures / allActiveDoctors.length) : 0;

        // Pre-calculate scoring properties on all active doctors
        allActiveDoctors.forEach(d => {
          const stats = evalStatsMapGlobal[d.id] || { count: 0, avg_rating: null };
          const R = stats.avg_rating !== null && stats.avg_rating !== undefined ? Number(stats.avg_rating) : 5.0;
          const v = stats.count || 0;
          
          // 1. Bayesian Rating
          d.adjustedRating = (globalAvgReviews * globalAvgRating + R * v) / (globalAvgReviews + v);
          
          // 2. Distance Score
          const storeIds = doctorStoreMapGlobal[d.id] || [];
          if (closestStoreId && storeIds.includes(closestStoreId)) {
            d.distanceScore = 10;
          } else {
            d.distanceScore = 5;
          }
          
          // 3. Exposure Modifier
          const expCount = d.exposure_count || 0;
          d.exposureMultiplier = expCount < avgExposure ? 1.5 : 0.8;
        });

        // Seedable PRNG for stability (session or daily seed)
        const todayStr = new Date().toISOString().slice(0, 10);
        const seedStr = (userId ? `user_${userId}_` : "anon_") + todayStr;
        
        // Seedable PRNG function (Mulberry32)
        const createSeededRandom = (seedString) => {
          let h = 1779033703 ^ seedString.length;
          for (let i = 0; i < seedString.length; i++) {
            h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
            h = h << 13 | h >>> 19;
          }
          let seed = (h ^ h >>> 16) >>> 0;
          return () => {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
          };
        };
        const random = createSeededRandom(seedStr);

        // Helper function for weighted random selection from a pool
        const weightedRandomSelect = (pool, weightFn, selectedSet) => {
          const candidates = pool.filter(d => !selectedSet.has(d.id));
          if (candidates.length === 0) return null;
          
          let totalWeight = 0;
          const weights = candidates.map(c => {
            const w = Math.max(0, weightFn(c));
            totalWeight += w;
            return w;
          });
          
          if (totalWeight <= 0) {
            const idx = Math.floor(random() * candidates.length);
            return candidates[idx];
          }
          
          let r = random() * totalWeight;
          for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0) {
              return candidates[i];
            }
          }
          return candidates[candidates.length - 1];
        };

        const selectedSet = new Set();
        const recommendedList = [];

        // SLOT 1: 口碑高分推荐
        const slot1Doc = weightedRandomSelect(
          allActiveDoctors,
          d => d.adjustedRating * d.exposureMultiplier,
          selectedSet
        );
        if (slot1Doc) {
          selectedSet.add(slot1Doc.id);
          recommendedList.push(slot1Doc);
        }

        // SLOT 2: 附近便捷就诊
        const slot2Doc = weightedRandomSelect(
          allActiveDoctors,
          d => d.distanceScore * d.exposureMultiplier,
          selectedSet
        );
        if (slot2Doc) {
          selectedSet.add(slot2Doc.id);
          recommendedList.push(slot2Doc);
        }

        // SLOT 3: 新晋之星/公平轮播
        const sortedExposures = allActiveDoctors.map(d => d.exposure_count || 0).sort((a, b) => a - b);
        const medianExposure = sortedExposures.length > 0 ? sortedExposures[Math.floor(sortedExposures.length / 2)] : 0;
        const risingStarPool = allActiveDoctors.filter(d => d.is_new === 1 || (d.exposure_count || 0) <= medianExposure);
        
        const slot3Doc = weightedRandomSelect(
          risingStarPool.length > 0 ? risingStarPool : allActiveDoctors,
          d => d.exposureMultiplier,
          selectedSet
        );
        if (slot3Doc) {
          selectedSet.add(slot3Doc.id);
          recommendedList.push(slot3Doc);
        }

        // Fallback: fill up to 3 doctors if pools are small
        while (recommendedList.length < Math.min(3, allActiveDoctors.length)) {
          const fallbackDoc = weightedRandomSelect(
            allActiveDoctors,
            d => 1,
            selectedSet
          );
          if (fallbackDoc) {
            selectedSet.add(fallbackDoc.id);
            recommendedList.push(fallbackDoc);
          } else {
            break;
          }
        }

        // Record exposure counts asynchronously for recommended ones
        if (recommendedList.length > 0) {
          const selectedIds = recommendedList.map(d => d.id);
          const placeholdersUpdate = selectedIds.map(() => '?').join(',');
          query(
            `UPDATE doctors SET exposure_count = exposure_count + 1 WHERE id IN (${placeholdersUpdate})`,
            selectedIds
          ).catch(err => console.error('Failed to update exposure counts:', err));
        }

        const remainingDoctors = allActiveDoctors.filter(d => !selectedSet.has(d.id));
        list = [...recommendedList, ...remainingDoctors];
      }
    }

    const doctorIds = list.map(d => d.id);
    let allMappings = [];
    let allApptCounts = [];
    let allEvalStats = [];

    if (doctorIds.length > 0) {
      const placeholders = doctorIds.map(() => '?').join(',');
      allMappings = await query(`SELECT doctor_id, store_id FROM doctor_store_mapping WHERE doctor_id IN (${placeholders})`, doctorIds);
      allApptCounts = await query(`SELECT doctor_id, COUNT(*) as count FROM appointments WHERE doctor_id IN (${placeholders}) GROUP BY doctor_id`, doctorIds);
      allEvalStats = await query(`SELECT doctor_id, COUNT(*) as count, AVG(rating) as avg_rating FROM appointment_evaluations WHERE doctor_id IN (${placeholders}) GROUP BY doctor_id`, doctorIds);
    }

    const mappingsMap = {};
    allMappings.forEach(m => {
      if (!mappingsMap[m.doctor_id]) mappingsMap[m.doctor_id] = [];
      mappingsMap[m.doctor_id].push(m.store_id);
    });

    const apptCountsMap = {};
    allApptCounts.forEach(c => {
      apptCountsMap[c.doctor_id] = c.count;
    });

    const evalStatsMap = {};
    allEvalStats.forEach(e => {
      evalStatsMap[e.doctor_id] = { count: e.count, avg_rating: e.avg_rating };
    });

    const formatted = [];
    for (const d of list) {
      const storeIds = mappingsMap[d.id] || [];
      const consultCount = apptCountsMap[d.id] || 0;
      const evalStats = evalStatsMap[d.id] || { count: 0, avg_rating: null };
      const reviewCount = evalStats.count;
      
      let rating = 5.0;
      if (evalStats.avg_rating !== null && evalStats.avg_rating !== undefined) {
        rating = Math.round(Number(evalStats.avg_rating) * 10) / 10;
      }
      
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
        storeIds
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
      data: list.map(item => formatDate(item.date))
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
      date: formatDate(row.date),
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

  const symptomDescClean = symptomDesc ? escapeHtml(symptomDesc) : '';

  try {
    // Map mock storeId
    let resolvedStoreId = storeId;
    if (typeof storeId === 'string') {
      const match = storeId.match(/(\d+)$/);
      resolvedStoreId = match ? parseInt(match[1], 10) : parseInt(storeId, 10);
    }
    if (isNaN(resolvedStoreId)) resolvedStoreId = 1;

    // Map mock doctorId
    let resolvedDoctorId = doctorId;
    if (typeof doctorId === 'string') {
      const match = doctorId.match(/(\d+)$/);
      resolvedDoctorId = match ? parseInt(match[1], 10) : parseInt(doctorId, 10);
    }
    if (isNaN(resolvedDoctorId)) resolvedDoctorId = 1;

    // Map mock patientId
    let resolvedPatientId = patientId;
    if (typeof patientId === 'string' && (patientId.startsWith('pat-') || isNaN(Number(patientId)))) {
      const defaultPatient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
      if (defaultPatient) {
        resolvedPatientId = defaultPatient.id;
      } else {
        const firstPatient = await get(`SELECT id FROM patients WHERE user_id = ? LIMIT 1`, [req.user.id]);
        if (firstPatient) {
          resolvedPatientId = firstPatient.id;
        } else {
          return res.status(400).json({ code: 400, message: '未找到就诊人信息' });
        }
      }
    } else {
      resolvedPatientId = parseInt(patientId, 10);
    }

    // Map mock scheduleId
    let resolvedScheduleId = scheduleId;
    let schedule = null;
    if (typeof scheduleId === 'string' && (scheduleId.startsWith('schedule-') || isNaN(Number(scheduleId)))) {
      schedule = await get(
        `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND store_id = ? AND date = ? LIMIT 1`,
        [resolvedDoctorId, resolvedStoreId, appointmentDate]
      );
      if (schedule) {
        resolvedScheduleId = schedule.id;
      } else {
        schedule = await get(
          `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND store_id = ? LIMIT 1`,
          [resolvedDoctorId, resolvedStoreId]
        );
        if (schedule) {
          resolvedScheduleId = schedule.id;
        }
      }
    } else {
      resolvedScheduleId = parseInt(scheduleId, 10);
      schedule = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [resolvedScheduleId]);
    }

    if (!schedule) {
      return res.status(400).json({ code: 400, message: '排班时段不存在' });
    }
    if (schedule.booked_slots >= schedule.total_slots) {
      return res.status(400).json({ code: 400, message: '该预约时段已约满' });
    }

    const apptNo = `AP2026${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

    const result = await run(
      `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'mini_app')`,
      [
        apptNo,
        req.user.id,
        resolvedPatientId,
        resolvedStoreId,
        resolvedDoctorId,
        resolvedScheduleId,
        appointmentDate,
        appointmentTime,
        type || 'first',
        symptomDescClean
      ]
    );

    await run(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [resolvedScheduleId]);

    const o = {
      id: result.id,
      appointmentNo: apptNo,
      userId: req.user.id.toString(),
      patientId: resolvedPatientId,
      doctorId: resolvedDoctorId,
      storeId: resolvedStoreId,
      scheduleId: resolvedScheduleId,
      appointmentDate,
      appointmentTime,
      type,
      symptomDesc,
      status: 'pending',
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
  let { status } = req.query;
  if (status === 'undefined' || status === 'null' || status === '') {
    status = undefined;
  }
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
    sql += ` ORDER BY a.created_at DESC`;

    const list = await query(sql, params);
    const formatted = list.map(row => ({
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: formatDate(row.appointment_date),
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
      `SELECT a.*, p.name as patient_name, d.name as doctor_name, d.title as doctor_title, d.avatar_url as doctor_avatar, d.specialty as doctor_specialty, d.hospital as doctor_hospital, d.intro as doctor_intro, d.experience_years as doctor_experience_years, d.expertise as doctor_expertise, s.name as store_name
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

    let expertise = null;
    if (row.doctor_expertise) {
      try {
        const parsed = typeof row.doctor_expertise === 'string' ? JSON.parse(row.doctor_expertise) : row.doctor_expertise;
        if (Array.isArray(parsed) && parsed.length > 0) {
          expertise = parsed;
        }
      } catch (e) {
        console.error('Failed to parse expertise JSON:', e);
      }
    }

    if (!expertise || expertise.length === 0) {
      if (row.doctor_specialty === '睡眠呼吸科' || row.doctor_specialty === '睡眠呼吸') {
        expertise = ['睡眠呼吸暂停综合症', '鼾症非手术治疗', '阻鼾器适配', '下颌前移治疗'];
      } else if (row.doctor_specialty === '耳鼻喉科') {
        expertise = ['鼻内镜诊断', '上气道评估', '过敏性鼻炎与鼾症', '多导睡眠监测'];
      } else if (row.doctor_specialty === '心理科' || row.doctor_specialty === '口腔正畸') {
        expertise = ['正畸辅导', '睡眠行为干预', '情绪焦虑管理', '依从性辅导'];
      } else {
        expertise = ['阻鼾器适配', '睡眠健康辅导'];
      }
    }

    const appt = {
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: formatDate(row.appointment_date),
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

    const medicalRecord = await get(
      `SELECT mr.*, d.name as doctor_name, s.name as store_name
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN stores s ON mr.store_id = s.id
       WHERE mr.appointment_id = ?`,
      [id]
    );

    let treatmentRecord = null;
    if (medicalRecord) {
      // 1. Try to find a treatment record that was created at this appointment (first fit)
      treatmentRecord = await get(
        `SELECT tr.*
         FROM treatment_records tr
         WHERE tr.medical_record_id = ?`,
        [medicalRecord.id]
      );

      // 2. If not found, see if there was a device adjustment on the date of this medical record (follow-up)
      if (!treatmentRecord) {
        const adjustment = await get(
          `SELECT tr.*, da.adjusted_advancement, da.patient_feedback, da.instructions
           FROM treatment_records tr
           JOIN device_adjustments da ON da.treatment_id = tr.id
           WHERE tr.patient_id = ? AND (DATE(da.adjust_date) = DATE(?) OR da.adjust_date = ?)
           ORDER BY da.id DESC LIMIT 1`,
          [medicalRecord.patient_id, medicalRecord.visit_date, medicalRecord.visit_date]
        );
        if (adjustment) {
          treatmentRecord = {
            id: adjustment.id,
            device_model: adjustment.device_model,
            initial_advancement: adjustment.initial_advancement,
            current_advancement: adjustment.adjusted_advancement, // use the adjusted value from that day!
            next_adjust_date: adjustment.next_adjust_date,
            status: adjustment.status,
            start_date: adjustment.start_date
          };
        }
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        appointment: appt,
        doctor: {
          id: row.doctor_id,
          name: row.doctor_name,
          avatarUrl: row.doctor_avatar,
          title: row.doctor_title,
          specialty: row.doctor_specialty,
          hospital: row.doctor_hospital,
          intro: row.doctor_intro,
          experienceYears: row.doctor_experience_years,
          expertise: expertise
        },
        store: {
          id: row.store_id,
          name: row.store_name
        },
        medicalRecord: medicalRecord ? {
          id: medicalRecord.id,
          diagnosis: medicalRecord.diagnosis,
          prescription: medicalRecord.prescription,
          doctorAdvice: medicalRecord.doctor_advice,
          note: medicalRecord.note,
          visitDate: formatDate(medicalRecord.visit_date),
          doctorName: medicalRecord.doctor_name,
          storeName: medicalRecord.store_name
        } : null,
        treatmentRecord: treatmentRecord ? {
          id: treatmentRecord.id,
          deviceModel: treatmentRecord.device_model || treatmentRecord.deviceModel,
          initialAdvancement: Number(treatmentRecord.initial_advancement || treatmentRecord.initialAdvancement),
          currentAdvancement: Number(treatmentRecord.current_advancement || treatmentRecord.currentAdvancement),
          nextAdjustDate: formatDate(treatmentRecord.next_adjust_date || treatmentRecord.nextAdjustDate),
          status: treatmentRecord.status,
          startDate: formatDate(treatmentRecord.start_date || treatmentRecord.startDate)
        } : null
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
  const reasonClean = reason ? escapeHtml(reason) : '';
  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status === 'completed' || appt.status === 'arrived' || appt.status === 'cancelled' || appt.status === 'no_show') {
      return res.status(400).json({ code: 400, message: '该预约状态下不支持取消' });
    }

    await run(
      `UPDATE appointments SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reasonClean, id]
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
    if (appt.status === 'completed' || appt.status === 'arrived' || appt.status === 'cancelled' || appt.status === 'no_show') {
      return res.status(400).json({ code: 400, message: '该预约状态下不支持修改就诊时间' });
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
    
    const distributorIds = relationships.map(r => r.distributor_id).filter(Boolean);
    const childUserIds = relationships.map(r => r.child_user_id);

    let allStats = [];
    let allPromoted = [];
    
    if (distributorIds.length > 0) {
      const placeholders = distributorIds.map(() => '?').join(',');
      allStats = await query(
        `SELECT distributor_id, COUNT(*) as count, SUM(order_amount) as sales 
         FROM distribution_orders 
         WHERE distributor_id IN (${placeholders}) 
         GROUP BY distributor_id`,
        distributorIds
      );
    }

    if (childUserIds.length > 0) {
      const placeholders = childUserIds.map(() => '?').join(',');
      allPromoted = await query(
        `SELECT parent_user_id, child_user_id 
         FROM distribution_relationships 
         WHERE parent_user_id IN (${placeholders})`,
        childUserIds
      );
    }

    const statsMap = {};
    allStats.forEach(s => {
      statsMap[s.distributor_id] = { count: s.count, sales: s.sales };
    });

    const promotedPatientsMap = {};
    const allPromotedPatientIdsSet = new Set();
    allPromoted.forEach(p => {
      if (!promotedPatientsMap[p.parent_user_id]) promotedPatientsMap[p.parent_user_id] = [];
      promotedPatientsMap[p.parent_user_id].push(p.child_user_id);
      allPromotedPatientIdsSet.add(p.child_user_id);
    });

    const allPromotedPatientIds = Array.from(allPromotedPatientIdsSet);
    let paidOrdersSet = new Set();
    let completedAptsSet = new Set();
    let anyAptsSet = new Set();

    if (allPromotedPatientIds.length > 0) {
      const placeholders = allPromotedPatientIds.map(() => '?').join(',');
      
      const paidOrders = await query(
        `SELECT DISTINCT user_id FROM orders WHERE user_id IN (${placeholders}) AND pay_at IS NOT NULL`,
        allPromotedPatientIds
      );
      paidOrders.forEach(o => paidOrdersSet.add(o.user_id));

      const completedApts = await query(
        `SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders}) AND status = 'completed'`,
        allPromotedPatientIds
      );
      completedApts.forEach(a => completedAptsSet.add(a.user_id));

      const anyApts = await query(
        `SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders})`,
        allPromotedPatientIds
      );
      anyApts.forEach(a => anyAptsSet.add(a.user_id));
    }

    for (const rel of relationships) {
      let orderCount = 0;
      let totalSales = 0;
      if (rel.distributor_id && statsMap[rel.distributor_id]) {
        orderCount = statsMap[rel.distributor_id].count || 0;
        totalSales = statsMap[rel.distributor_id].sales || 0;
      }

      const promotedPatients = promotedPatientsMap[rel.child_user_id] || [];

      let status = null;
      let statusText = '';
      let statusClass = '';

      if (promotedPatients.length > 0) {
        const hasPaid = promotedPatients.some(id => paidOrdersSet.has(id));
        if (hasPaid) {
          status = 'paid';
          statusText = '已成交';
          statusClass = 'paid';
        } else {
          const hasCompleted = promotedPatients.some(id => completedAptsSet.has(id));
          if (hasCompleted) {
            status = 'unpaid';
            statusText = '未成交';
            statusClass = 'unpaid';
          } else {
            const hasAny = promotedPatients.some(id => anyAptsSet.has(id));
            if (hasAny) {
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
        patientCount: patientCountRow ? patientCountRow.count : 0,
        storeCount: storeCountRow ? storeCountRow.count : 0,
        satisfaction
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取首页统计失败' });
  }
});

// 1) 获取与客服的聊天记录
app.get('/api/v1/im/messages', authenticateWxToken, async (req, res) => {
  try {
    const patient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: [] });
    }
    const messages = await query(`
      SELECT sender, text, DATE_FORMAT(created_at, '%H:%i') as time 
      FROM im_messages 
      WHERE patient_id = ? 
      ORDER BY created_at ASC`,
      [patient.id]
    );
    res.json({ code: 0, message: 'success', data: messages });
  } catch (error) {
    console.error('Client Get IM Messages Error:', error);
    res.status(500).json({ code: 500, message: '获取消息失败' });
  }
});

// 2) 发送消息给客服
app.post('/api/v1/im/send', authenticateWxToken, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ code: 400, message: '消息内容不能为空' });
  }
  try {
    const patient = await get(`SELECT id, name FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '未找到关联患者' });
    }
    await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) VALUES (?, 'patient', ?, ?, 0)`,
      [patient.id, patient.name, text]
    );

    // 自动模拟客服助理在线自动回复
    setTimeout(async () => {
      try {
        await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) VALUES (?, 'doctor', '客服助理', '收到您的消息，我们会在工作时间（9:00-18:00）尽快回复。如需紧急帮助，请拨打客服热线：400-888-9999', 1)`,
          [patient.id]
        );
      } catch (e) {
        console.error('Mock assistant auto-reply insertion failed:', e);
      }
    }, 1500);

    res.json({ code: 0, message: '发送成功' });
  } catch (error) {
    console.error('Client Send IM Error:', error);
    res.status(500).json({ code: 500, message: '发送失败' });
  }
});

export default app;
