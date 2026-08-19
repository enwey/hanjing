import express from 'express';
import jwt from 'jsonwebtoken';
import { get, query, run, transaction } from '../db.js';
import {
  JWT_SECRET,
  authenticatePromoterToken,
  decryptPII,
  encryptPII,
  formatShanghaiDateTime,
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
    `SELECT r.level as relation_level, r.child_user_id, u.nickname, u.avatar_url, u.phone, u.created_at as joined_at, d.level, d.id as distributor_id
     FROM distribution_relationships r
     JOIN users u ON r.child_user_id = u.id
     LEFT JOIN distributors d ON u.id = d.user_id
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
