import express from 'express';
import jwt from 'jsonwebtoken';
import { get, query, run, transaction } from '../db.js';
import {
  JWT_SECRET,
  authenticatePromoterToken,
  decryptPII,
  encryptPII,
  formatShanghaiDateTime,
  hashPassword,
  verifyPassword
} from '../helpers.js';

const app = express.Router();
const smsCodes = new Map(); // phone -> { code, expires }
const DEFAULT_DISTRIBUTION_SETTLE_DAYS = 7;
const DISTRIBUTION_MIN_WITHDRAW_AMOUNT = 10000;
const DISTRIBUTION_BANK_FEE_RATE = 0.01;
const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
const shouldExposeSmsCode = nodeEnv !== 'production';

function getDistributorLevelRule(level) {
  const rules = {
    silver: { label: '银牌' },
    gold: { label: '金牌' },
    diamond: { label: '钻石' }
  };
  return rules[level] || { label: '普通' };
}

function maskPhone(phone) {
  const value = String(phone || '').trim();
  if (!value) return '';
  if (value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function getPromoterPatientProgressStage(item) {
  const treatmentStatus = String(item.treatment_status || '').toLowerCase();
  const appointmentStatus = String(item.latest_appointment_status || '').toLowerCase();
  const completedVisits = Number(item.completed_visit_count || 0);
  const orderCount = Number(item.order_count || 0);
  const appointmentCount = Number(item.appointment_count || 0);

  if (treatmentStatus === 'active') return { code: 'treating', label: '治疗中' };
  if (treatmentStatus === 'completed' || treatmentStatus === 'finished') return { code: 'completed', label: '治疗完成' };
  if (treatmentStatus === 'paused') return { code: 'paused', label: '暂停治疗' };
  if (completedVisits > 0 || ['completed', 'arrived', 'settled', 'checked_in'].includes(appointmentStatus)) {
    return { code: 'visited', label: '已到诊' };
  }
  if (appointmentCount > 0 || ['pending', 'confirmed', 'pending_payment'].includes(appointmentStatus)) {
    return { code: 'appointed', label: '已预约' };
  }
  if (orderCount > 0) return { code: 'purchased', label: '已购买' };
  return { code: 'registered', label: '已登记' };
}

async function getDistributionSettleDays() {
  const row = await get(`SELECT key_value FROM system_settings WHERE key_name = 'distribution_settle_days'`);
  const days = parseInt(row?.key_value, 10);
  if (!Number.isInteger(days) || days < 0) {
    return DEFAULT_DISTRIBUTION_SETTLE_DAYS;
  }
  return days;
}

async function getDistributionFeatureConfig() {
  const [settleDays, enableDistributionRow, minWithdrawRow, withdrawFeeRateRow] = await Promise.all([
    getDistributionSettleDays(),
    get(`SELECT key_value FROM system_settings WHERE key_name = 'enable_distribution'`),
    get(`SELECT key_value FROM system_settings WHERE key_name = 'min_withdraw'`),
    get(`SELECT key_value FROM system_settings WHERE key_name = 'withdraw_fee_rate'`)
  ]);
  const minWithdrawYuan = Number(minWithdrawRow?.key_value);
  const withdrawFeeRatePercent = Number(withdrawFeeRateRow?.key_value);
  const minWithdrawAmount = Number.isFinite(minWithdrawYuan) && minWithdrawYuan >= 0
    ? Math.round(minWithdrawYuan * 100)
    : DISTRIBUTION_MIN_WITHDRAW_AMOUNT;
  const bankWithdrawFeeRate = Number.isFinite(withdrawFeeRatePercent) && withdrawFeeRatePercent >= 0
    ? withdrawFeeRatePercent / 100
    : DISTRIBUTION_BANK_FEE_RATE;
  return {
    settleDays,
    enableDistribution: String(enableDistributionRow?.key_value || 'true') !== 'false',
    minWithdrawAmount,
    withdrawFeeRates: {
      wechat: 0,
      bank: bankWithdrawFeeRate
    }
  };
}

async function getDistributionWithdrawRecordList(userId) {
  const list = await query(
    `SELECT * FROM withdraw_records WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return list.map((item) => ({
    id: item.id.toString(),
    amount: item.amount,
    fee: item.fee,
    actualAmount: item.actual_amount,
    accountInfo: (() => {
      try {
        return typeof item.account_info === 'string' ? JSON.parse(item.account_info) : item.account_info;
      } catch {
        return { label: item.account_info };
      }
    })(),
    status: item.status === 'success' || item.status === 'completed'
      ? 'approved'
      : item.status === 'failed'
        ? 'rejected'
        : item.status,
    createdAt: item.created_at,
    completedAt: item.completed_at
  }));
}

async function settleEligibleDistributionCommissionsByPromoter(userId, promoterId) {
  const settleDays = await getDistributionSettleDays();
  const pendingList = await query(
    `SELECT do.id, do.commission_amount
       FROM distribution_orders do
       JOIN orders o ON o.id = do.order_id
       WHERE do.distributor_id = ?
         AND do.status = 'pending'
         AND o.status = 'completed'
         AND (do.lock_until <= CURRENT_TIMESTAMP OR (do.lock_until IS NULL AND o.updated_at <= DATE_SUB(NOW(), INTERVAL ${settleDays} DAY)))`,
    [promoterId]
  );

  if (!pendingList.length) return 0;

  const total = pendingList.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const ids = pendingList.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');

  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE distribution_orders
       SET status = 'settled', settled_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      ids
    );
    await conn.execute(
      `UPDATE distributors
       SET available_commission = available_commission + ?
       WHERE id = ?`,
      [total, promoterId]
    );
    await conn.execute(
      `INSERT INTO user_notifications (user_id, title, content)
       VALUES (?, '佣金已结算', ?)`,
      [userId, `您有 ¥${(total / 100).toFixed(2)} 的推广佣金已转为可提现余额。`]
    );
  });

  return total;
}

async function getPromoterByPhone(phone) {
  const encryptedPhone = encryptPII(phone);
  return get(
    `SELECT d.id as promoter_id, d.user_id, d.nickname as promoter_nickname, d.avatar_url as promoter_avatar, d.level, d.invite_code,
            d.total_commission, d.available_commission, d.withdrawn_amount, d.status as promoter_status, d.created_at as promoter_created_at,
            u.nickname as user_nickname, u.avatar_url as user_avatar, u.phone, u.password_hash, u.created_at as user_created_at
     FROM distributors d
     JOIN users u ON d.user_id = u.id
     WHERE u.phone = ? OR u.phone = ?
     LIMIT 1`,
    [encryptedPhone, phone]
  );
}

async function getPromoterContext(userId) {
  return get(
    `SELECT d.id as promoter_id, d.user_id, d.nickname as promoter_nickname, d.avatar_url as promoter_avatar, d.level, d.invite_code,
            d.total_commission, d.available_commission, d.withdrawn_amount, d.status as promoter_status, d.created_at as promoter_created_at,
            u.nickname as user_nickname, u.avatar_url as user_avatar, u.phone, u.password_hash, u.created_at as user_created_at
     FROM distributors d
     JOIN users u ON d.user_id = u.id
     WHERE d.user_id = ?
     LIMIT 1`,
    [userId]
  );
}

async function getPromoterSummary(context) {
  const userId = context.user_id;
  const promoterId = context.promoter_id;
  await settleEligibleDistributionCommissionsByPromoter(userId, promoterId);
  const featureConfig = await getDistributionFeatureConfig();

  const [lv1, lv2, orderStats, pendingStats] = await Promise.all([
    get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 1`, [userId]),
    get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 2`, [userId]),
    get(
      `SELECT COUNT(DISTINCT order_id) as total_orders, COALESCE(SUM(order_amount), 0) as total_sales
       FROM distribution_orders
       WHERE distributor_id = ? AND status != 'refunded'`,
      [promoterId]
    ),
    get(
      `SELECT COALESCE(SUM(commission_amount), 0) as frozen_commission
       FROM distribution_orders
       WHERE distributor_id = ? AND status = 'pending'`,
      [promoterId]
    )
  ]);

  return {
    promoter: {
      id: String(context.promoter_id),
      userId: String(context.user_id),
      nickname: context.promoter_nickname || context.user_nickname || '推广员',
      avatarUrl: context.promoter_avatar || context.user_avatar || '',
      phone: decryptPII(context.phone) || '',
      level: context.level,
      levelLabel: getDistributorLevelRule(context.level).label,
      inviteCode: context.invite_code,
      status: context.promoter_status,
      createdAt: context.promoter_created_at
    },
    summary: {
      teamCount: Number(lv1?.count || 0),
      teamLevel2Count: Number(lv2?.count || 0),
      totalInvites: Number(lv1?.count || 0) + Number(lv2?.count || 0),
      totalOrders: Number(orderStats?.total_orders || 0),
      totalSales: Number(orderStats?.total_sales || 0),
      availableCommission: Number(context.available_commission || 0),
      totalCommission: Number(context.total_commission || 0),
      withdrawnAmount: Number(context.withdrawn_amount || 0),
      frozenCommission: Number(pendingStats?.frozen_commission || 0),
      settleDays: featureConfig.settleDays,
      minWithdrawAmount: featureConfig.minWithdrawAmount,
      withdrawFeeRates: featureConfig.withdrawFeeRates
    }
  };
}

app.post('/api/promoter/send-code', async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '请输入有效的手机号' });
  }

  const promoter = await getPromoterByPhone(phone);
  if (!promoter) {
    return res.status(404).json({ code: 404, message: '该手机号未绑定推广员账号' });
  }
  if (promoter.promoter_status !== 'active') {
    return res.status(403).json({ code: 403, message: '该推广员账号已停用，请联系运营人员' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  smsCodes.set(phone, { code, expires: Date.now() + 5 * 60 * 1000 });
  console.log(`[Promoter SMS] Verification code for ${phone} is: ${code}`);

  const payload = {
    code: 200,
    message: shouldExposeSmsCode ? '验证码发送成功（开发环境已直接返回）' : '验证码发送成功',
    data: {}
  };
  if (shouldExposeSmsCode) {
    payload.data.code = code;
  }

  res.json(payload);
});

app.post('/api/promoter/login', async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '').trim();
  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
  }

  const promoter = await getPromoterByPhone(phone);
  if (!promoter) {
    return res.status(404).json({ code: 404, message: '该手机号未绑定推广员账号' });
  }
  if (promoter.promoter_status !== 'active') {
    return res.status(403).json({ code: 403, message: '该推广员账号已停用，请联系运营人员' });
  }
  if (!promoter.password_hash) {
    return res.status(400).json({ code: 400, message: '该账号尚未设置登录密码，请先在小程序账号安全中设置密码' });
  }
  if (!verifyPassword(password, promoter.password_hash)) {
    return res.status(400).json({ code: 400, message: '手机号或密码错误' });
  }

  const token = jwt.sign(
    {
      scope: 'promoter',
      user_id: promoter.user_id,
      promoter_id: promoter.promoter_id,
      phone
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    code: 200,
    message: '登录成功',
    data: {
      token,
      user: {
        id: String(promoter.promoter_id),
        user_id: String(promoter.user_id),
        nickname: promoter.promoter_nickname || promoter.user_nickname || '推广员',
        phone,
        role_name: '推广员',
        role_code: 'promoter',
        level: promoter.level,
        inviteCode: promoter.invite_code,
        avatar_url: promoter.promoter_avatar || promoter.user_avatar || ''
      }
    }
  });
});

app.get('/api/promoter/me', authenticatePromoterToken, async (req, res) => {
  const promoter = await getPromoterContext(req.user.user_id);
  if (!promoter) {
    return res.status(404).json({ code: 404, message: '推广员账号不存在' });
  }
  res.json({
    code: 200,
    data: {
      id: String(promoter.promoter_id),
      user_id: String(promoter.user_id),
      nickname: promoter.promoter_nickname || promoter.user_nickname || '推广员',
      phone: decryptPII(promoter.phone) || '',
      role_name: '推广员',
      role_code: 'promoter',
      level: promoter.level,
      levelLabel: getDistributorLevelRule(promoter.level).label,
      inviteCode: promoter.invite_code,
      avatar_url: promoter.promoter_avatar || promoter.user_avatar || '',
      hasPassword: Boolean(promoter.password_hash),
      createdAt: promoter.promoter_created_at
    }
  });
});

app.put('/api/promoter/profile', authenticatePromoterToken, async (req, res) => {
  const nickname = String(req.body.nickname || '').trim();
  if (!nickname) {
    return res.status(400).json({ code: 400, message: '昵称不能为空' });
  }

  await transaction(async (conn) => {
    await conn.execute(`UPDATE distributors SET nickname = ? WHERE user_id = ?`, [nickname, req.user.user_id]);
    await conn.execute(`UPDATE users SET nickname = ? WHERE id = ?`, [nickname, req.user.user_id]);
  });

  res.json({ code: 200, message: '资料保存成功' });
});

app.put('/api/promoter/password', authenticatePromoterToken, async (req, res) => {
  try {
    const oldPassword = String(req.body.oldPassword || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();
    const confirmPassword = String(req.body.confirmPassword || '').trim();

    if (!oldPassword) {
      return res.status(400).json({ code: 400, message: '请输入原始密码' });
    }
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ code: 400, message: '请输入新密码并确认' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ code: 400, message: '两次输入的新密码不一致' });
    }
    if (newPassword.length < 6 || newPassword.length > 20) {
      return res.status(400).json({ code: 400, message: '新密码长度需为 6-20 位' });
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,20}$/.test(newPassword)) {
      return res.status(400).json({ code: 400, message: '新密码需包含字母和数字' });
    }

    const user = await get(`SELECT id, password_hash FROM users WHERE id = ?`, [req.user.user_id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '推广员账号不存在' });
    }
    if (!user.password_hash || !verifyPassword(oldPassword, user.password_hash)) {
      return res.status(400).json({ code: 400, message: '原始密码不正确' });
    }

    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(newPassword), req.user.user_id]);
    res.json({ code: 200, message: '修改密码成功，请重新登录' });
  } catch (error) {
    console.error('Promoter change password error:', error);
    res.status(500).json({ code: 500, message: '修改密码失败' });
  }
});

app.get('/api/promoter/dashboard', authenticatePromoterToken, async (req, res) => {
  const context = await getPromoterContext(req.user.user_id);
  if (!context) {
    return res.status(404).json({ code: 404, message: '推广员账号不存在' });
  }

  const summary = await getPromoterSummary(context);
  const recentCommissions = await query(
    `SELECT do.id, do.order_amount, do.commission_amount, do.status, do.created_at,
            MAX(o.order_no) as order_no,
            MAX(p.name) as patient_name,
            GROUP_CONCAT(DISTINCT pr.name SEPARATOR '、') as product_names
     FROM distribution_orders do
     LEFT JOIN orders o ON do.order_id = o.id
     LEFT JOIN patients p ON o.user_id = p.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products pr ON oi.product_id = pr.id
     WHERE do.distributor_id = ?
     GROUP BY do.id
     ORDER BY do.created_at DESC
     LIMIT 10`,
    [context.promoter_id]
  );

  res.json({
    code: 200,
    data: {
      ...summary,
      recentCommissions
    }
  });
});

app.get('/api/promoter/team', authenticatePromoterToken, async (req, res) => {
  const parentUserId = req.user.user_id;
  const currentDistributor = await get(`SELECT id FROM distributors WHERE user_id = ?`, [parentUserId]);
  if (!currentDistributor) {
    return res.json({ code: 200, data: { list: [], total: 0 } });
  }

  const relationships = await query(
    `SELECT r.level as relation_level, r.child_user_id, u.nickname, u.avatar_url, u.phone, u.created_at as joined_at, d.level, d.id as distributor_id,
            direct_rel.parent_user_id as upper_user_id,
            COALESCE(upper_d.nickname, upper_u.nickname) as upper_name,
            upper_u.phone as upper_phone
     FROM distribution_relationships r
     JOIN users u ON r.child_user_id = u.id
     LEFT JOIN distributors d ON u.id = d.user_id
     LEFT JOIN distribution_relationships direct_rel ON direct_rel.child_user_id = r.child_user_id AND direct_rel.level = 1
     LEFT JOIN users upper_u ON direct_rel.parent_user_id = upper_u.id
     LEFT JOIN distributors upper_d ON upper_u.id = upper_d.user_id
     WHERE r.parent_user_id = ?
     ORDER BY r.level ASC, r.created_at DESC`,
    [parentUserId]
  );

  const distributorIds = relationships.map((row) => row.distributor_id).filter(Boolean);
  const childUserIds = relationships.map((row) => row.child_user_id);

  let allStats = [];
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

  const statsMap = {};
  allStats.forEach((item) => {
    statsMap[item.distributor_id] = { count: Number(item.count || 0), sales: Number(item.sales || 0) };
  });

  let paidOrdersSet = new Set();
  let completedAptsSet = new Set();
  let anyAptsSet = new Set();

  if (childUserIds.length > 0) {
    const placeholders = childUserIds.map(() => '?').join(',');
    const [paidOrders, completedApts, anyApts] = await Promise.all([
      query(`SELECT DISTINCT user_id FROM orders WHERE user_id IN (${placeholders}) AND pay_at IS NOT NULL`, childUserIds),
      query(`SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders}) AND status = 'completed'`, childUserIds),
      query(`SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders})`, childUserIds)
    ]);
    paidOrders.forEach((item) => paidOrdersSet.add(item.user_id));
    completedApts.forEach((item) => completedAptsSet.add(item.user_id));
    anyApts.forEach((item) => anyAptsSet.add(item.user_id));
  }

  const list = relationships.map((rel) => {
    const stats = rel.distributor_id ? statsMap[rel.distributor_id] || { count: 0, sales: 0 } : { count: 0, sales: 0 };
    let status = 'new';
    let statusText = '未转化';
    if (paidOrdersSet.has(rel.child_user_id)) {
      status = 'paid';
      statusText = '已成交';
    } else if (completedAptsSet.has(rel.child_user_id)) {
      status = 'arrived';
      statusText = '已到诊';
    } else if (anyAptsSet.has(rel.child_user_id)) {
      status = 'booked';
      statusText = '已预约';
    }
    return {
      id: String(rel.child_user_id),
      nickname: rel.nickname || '用户',
      avatarUrl: rel.avatar_url || '',
      phone: decryptPII(rel.phone) || '',
      level: rel.level || 'member',
      levelLabel: rel.level ? getDistributorLevelRule(rel.level).label : '普通用户',
      relationLevel: Number(rel.relation_level || 1),
      upperUserId: rel.upper_user_id ? String(rel.upper_user_id) : '',
      upperName: rel.upper_name || '无',
      upperPhone: decryptPII(rel.upper_phone) || '',
      orderCount: stats.count,
      totalSales: stats.sales,
      joinedAt: rel.joined_at,
      status,
      statusText
    };
  });

  res.json({ code: 200, data: { list, total: list.length } });
});

app.get('/api/promoter/commissions', authenticatePromoterToken, async (req, res) => {
  const context = await getPromoterContext(req.user.user_id);
  if (!context) {
    return res.status(404).json({ code: 404, message: '推广员账号不存在' });
  }
  await settleEligibleDistributionCommissionsByPromoter(req.user.user_id, context.promoter_id);
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
    [context.promoter_id]
  );
  res.json({ code: 200, data: list });
});

app.get('/api/promoter/patients', authenticatePromoterToken, async (req, res) => {
  const context = await getPromoterContext(req.user.user_id);
  if (!context) {
    return res.status(404).json({ code: 404, message: '推广员账号不存在' });
  }

  const list = await query(
    `SELECT p.id, p.patient_no, p.name, p.phone, p.gender, p.age, p.source, p.created_at,
            u.member_level,
            promoted.relation_level,
            (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status NOT IN ('cancelled', 'no_show')) as appointment_count,
            (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status IN ('completed', 'arrived', 'settled', 'checked_in')) as completed_visit_count,
            (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.patient_id = p.id AND a.status NOT IN ('cancelled', 'no_show')) as last_visit,
            (SELECT a.appointment_date FROM appointments a WHERE a.patient_id = p.id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC LIMIT 1) as latest_appointment_date,
            (SELECT a.appointment_time FROM appointments a WHERE a.patient_id = p.id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC LIMIT 1) as latest_appointment_time,
            (SELECT a.status FROM appointments a WHERE a.patient_id = p.id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC LIMIT 1) as latest_appointment_status,
            (SELECT a.store_name FROM appointments a WHERE a.patient_id = p.id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC LIMIT 1) as latest_store_name,
            (SELECT a.doctor_name FROM appointments a WHERE a.patient_id = p.id ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC LIMIT 1) as latest_doctor_name,
            (SELECT COUNT(*) FROM patients fp WHERE fp.user_id = p.user_id) as family_count,
            (SELECT tr.status FROM treatment_records tr WHERE tr.patient_id = p.id ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC LIMIT 1) as treatment_status,
            (SELECT tr.start_date FROM treatment_records tr WHERE tr.patient_id = p.id ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC LIMIT 1) as treatment_start_date,
            (SELECT tr.next_adjust_date FROM treatment_records tr WHERE tr.patient_id = p.id ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC LIMIT 1) as next_adjust_date,
            (SELECT tr.device_product_name FROM treatment_records tr WHERE tr.patient_id = p.id ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC LIMIT 1) as device_name,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = p.user_id AND o.status NOT IN ('cancelled', 'refunded')) as order_count,
            (SELECT COALESCE(SUM(o.pay_amount), 0) FROM orders o WHERE o.user_id = p.user_id AND o.status NOT IN ('cancelled', 'refunded')) as paid_amount
     FROM (
       SELECT user_id, MIN(relation_level) as relation_level
       FROM (
         SELECT r.child_user_id as user_id, r.level as relation_level
         FROM distribution_relationships r
         WHERE r.parent_user_id = ?
         UNION ALL
         SELECT o.user_id as user_id, do.commission_level as relation_level
         FROM distribution_orders do
         JOIN orders o ON do.order_id = o.id
         WHERE do.distributor_id = ?
       ) promoted_users
       WHERE user_id IS NOT NULL
       GROUP BY user_id
     ) promoted
     JOIN patients p ON p.user_id = promoted.user_id
     JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC, p.id DESC`,
    [req.user.user_id, context.promoter_id]
  );

  const rows = list.map((item) => {
    const progress = getPromoterPatientProgressStage(item);
    return {
      id: String(item.id),
      patientNo: item.patient_no || '未生成',
      name: item.name || '患者',
      phoneMasked: maskPhone(decryptPII(item.phone) || item.phone || ''),
      gender: Number(item.gender) === 1 ? '男' : Number(item.gender) === 2 ? '女' : '未知',
      age: item.age ?? null,
      ageText: item.age === null || item.age === undefined ? '未知' : `${item.age}岁`,
      memberLevel: item.member_level || 'normal',
      memberLevelLabel: ({ normal: '普通', silver: 'VIP', gold: 'VIP', diamond: 'SVIP' })[item.member_level] || '普通',
      familyCount: Math.max(0, Number(item.family_count || 0) - 1),
      relationLevel: Number(item.relation_level || 1),
      source: item.source || 'distribution',
      progressCode: progress.code,
      progressLabel: progress.label,
      appointmentCount: Number(item.appointment_count || 0),
      completedVisitCount: Number(item.completed_visit_count || 0),
      lastVisit: item.last_visit || '',
      latestAppointmentDate: item.latest_appointment_date || '',
      latestAppointmentTime: item.latest_appointment_time || '',
      latestAppointmentStatus: item.latest_appointment_status || '',
      latestStoreName: item.latest_store_name || '',
      latestDoctorName: item.latest_doctor_name || '',
      treatmentStatus: item.treatment_status || '',
      treatmentStartDate: item.treatment_start_date || '',
      nextAdjustDate: item.next_adjust_date || '',
      deviceName: item.device_name || '',
      orderCount: Number(item.order_count || 0),
      paidAmount: Number(item.paid_amount || 0),
      createdAt: item.created_at
    };
  });

  res.json({ code: 200, data: { list: rows, total: rows.length } });
});

app.get('/api/promoter/patients/:id', authenticatePromoterToken, async (req, res) => {
  const { id } = req.params;
  const context = await getPromoterContext(req.user.user_id);
  if (!context) {
    return res.status(404).json({ code: 404, message: '推广员账号不存在' });
  }

  const patient = await get(
    `SELECT p.id, p.patient_no, p.user_id, p.name, p.phone, p.gender, p.age, p.relation, p.source, p.created_at,
            u.member_level,
            promoted.relation_level
     FROM (
       SELECT user_id, MIN(relation_level) as relation_level
       FROM (
         SELECT r.child_user_id as user_id, r.level as relation_level
         FROM distribution_relationships r
         WHERE r.parent_user_id = ?
         UNION ALL
         SELECT o.user_id as user_id, do.commission_level as relation_level
         FROM distribution_orders do
         JOIN orders o ON do.order_id = o.id
         WHERE do.distributor_id = ?
       ) promoted_users
       WHERE user_id IS NOT NULL
       GROUP BY user_id
     ) promoted
     JOIN patients p ON p.user_id = promoted.user_id
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [req.user.user_id, context.promoter_id, id]
  );

  if (!patient) {
    return res.status(404).json({ code: 404, message: '患者不存在或不属于当前推广范围' });
  }

  const [appointments, orders, familyMembers, treatment, timelines, totalSpentRow] = await Promise.all([
    query(
      `SELECT a.id, a.appointment_no, a.appointment_date, a.appointment_time, a.type, a.status,
              a.source, a.doctor_name, a.doctor_title, a.store_name, a.created_at
       FROM appointments a
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC`,
      [id]
    ),
    query(
      `SELECT o.id, o.order_no, o.type, o.pay_amount, o.status, o.pay_at, o.created_at,
              GROUP_CONCAT(oi.product_name SEPARATOR '、') as product_names
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ? AND o.status NOT IN ('cancelled', 'refunded')
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [patient.user_id]
    ),
    query(
      `SELECT id, name, relation, gender, age, phone
       FROM patients
       WHERE user_id = ?
       ORDER BY relation = 'self' DESC, id ASC`,
      [patient.user_id]
    ),
    get(
      `SELECT tr.id, tr.device_product_name, tr.device_model, tr.initial_advancement, tr.current_advancement,
              tr.start_date, tr.next_adjust_date, tr.status, tr.created_at, d.name as doctor_name
       FROM treatment_records tr
       LEFT JOIN doctors d ON tr.doctor_id = d.id
       WHERE tr.patient_id = ?
       ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC
       LIMIT 1`,
      [id]
    ),
    query(
      `SELECT id, event_date, event_title, event_type, doctor_name, color, icon
       FROM treatment_timelines
       WHERE patient_id = ?
       ORDER BY event_date DESC, id DESC
       LIMIT 20`,
      [id]
    ),
    get(
      `SELECT COALESCE(SUM(pay_amount), 0) as total_spent
       FROM orders
       WHERE user_id = ? AND status IN ('paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed')`,
      [patient.user_id]
    )
  ]);

  const appointmentCount = appointments.filter((item) => !['cancelled', 'no_show'].includes(String(item.status))).length;
  const completedVisitCount = appointments.filter((item) => ['completed', 'arrived', 'settled', 'checked_in'].includes(String(item.status))).length;
  const progress = getPromoterPatientProgressStage({
    treatment_status: treatment?.status || '',
    latest_appointment_status: appointments[0]?.status || '',
    completed_visit_count: completedVisitCount,
    order_count: orders.length,
    appointment_count: appointmentCount
  });

  res.json({
    code: 200,
    data: {
      id: String(patient.id),
      patientNo: patient.patient_no || '未生成',
      name: patient.name || '患者',
      phoneMasked: maskPhone(decryptPII(patient.phone) || patient.phone || ''),
      gender: Number(patient.gender) === 1 ? '男' : Number(patient.gender) === 2 ? '女' : '未知',
      age: patient.age ?? null,
      ageText: patient.age === null || patient.age === undefined ? '未知' : `${patient.age}岁`,
      relation: patient.relation || 'self',
      memberLevel: patient.member_level || 'normal',
      memberLevelLabel: ({ normal: '普通', silver: 'VIP', gold: 'VIP', diamond: 'SVIP' })[patient.member_level] || '普通',
      relationLevel: Number(patient.relation_level || 1),
      source: patient.source || 'distribution',
      progressCode: progress.code,
      progressLabel: progress.label,
      appointmentCount,
      completedVisitCount,
      totalSpent: Number(totalSpentRow?.total_spent || 0),
      createdAt: patient.created_at,
      treatment: treatment || null,
      appointments,
      orders: orders.map((item) => ({
        ...item,
        pay_amount: Number(item.pay_amount || 0),
        product_names: item.product_names || ''
      })),
      familyMembers: familyMembers.map((item) => ({
        id: String(item.id),
        name: item.name || '家庭成员',
        relation: item.relation || '',
        gender: Number(item.gender) === 1 ? '男' : Number(item.gender) === 2 ? '女' : '未知',
        age: item.age ?? null,
        phoneMasked: maskPhone(decryptPII(item.phone) || item.phone || '')
      })),
      timelines
    }
  });
});

app.get('/api/promoter/withdraws', authenticatePromoterToken, async (req, res) => {
  res.json({
    code: 200,
    data: await getDistributionWithdrawRecordList(req.user.user_id)
  });
});

app.get('/api/promoter/products', authenticatePromoterToken, async (_req, res) => {
  const list = await query(
    `SELECT id, name, category, image_url, price, description, stock, sales_count,
            is_distribution, commission_rate, commission_rate_level1, commission_rate_level2, status, created_at
     FROM products
     WHERE is_distribution = 1 AND status = 'on' AND deleted_at IS NULL
     ORDER BY id DESC`
  );
  res.json({ code: 200, data: list });
});

export default app;
