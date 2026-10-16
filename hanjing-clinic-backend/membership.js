import { query, transaction } from './db.js';

const DEFAULT_MEMBER_LEVEL_RULES = [
  { level: 'normal', title: '普通会员', color: '#9CA3AF', bgColor: '#F3F4F6', spentRequired: 0, benefits: [{ icon: 'appointment', title: '在线预约', desc: '随时预约睡眠门诊' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }] },
  { level: 'silver', title: '白银会员', color: '#6B7280', bgColor: '#F3F4F6', spentRequired: 100000, benefits: [{ icon: 'appointment', title: '在线预约', desc: '优先时段选择' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物9.5折', desc: '商城商品享95折优惠' }] },
  { level: 'gold', title: '黄金会员', color: '#F5A623', bgColor: '#FFF9E6', spentRequired: 300000, benefits: [{ icon: 'appointment', title: '在线预约', desc: 'VIP优先预约通道' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物9折', desc: '商城商品享9折优惠' }, { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' }, { icon: 'channel', title: '分销权限', desc: '可申请成为推广员' }] },
  { level: 'diamond', title: '钻石会员', color: '#3B6BF5', bgColor: '#EEF4FF', spentRequired: 1000000, benefits: [{ icon: 'appointment', title: '在线预约', desc: '院长级专家优先约' }, { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }, { icon: 'discount', title: '购物8.5折', desc: '商城商品享85折优惠' }, { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' }, { icon: 'channel', title: '分销权限', desc: '推广员+高佣金比例' }, { icon: 'free', title: '年度免费检查', desc: '每年1次免费睡眠监测' }] },
];

function parseBenefits(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function normalizeLevel(row) {
  return { id: Number(row.id), level: row.code, title: row.name, color: row.color, bgColor: row.bg_color, spentRequired: Number(row.spent_required || 0), benefits: parseBenefits(row.benefits) };
}

async function execute(conn, sql, params = []) {
  if (conn) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

export async function getMemberLevelRules(conn = null) {
  const rows = await execute(conn, `SELECT id, code, name, spent_required, color, bg_color, benefits
    FROM member_levels WHERE status = 'active' ORDER BY sort_order ASC, spent_required ASC`);
  return rows.length ? rows.map(normalizeLevel) : DEFAULT_MEMBER_LEVEL_RULES;
}

export async function getCurrentUserMembership(userId, conn = null) {
  const rows = await execute(conn, `SELECT ml.id, ml.code, ml.name, ml.spent_required, ml.color, ml.bg_color, ml.benefits
    FROM user_memberships um
    JOIN member_levels ml ON ml.id = um.level_id
    WHERE um.user_id = ? LIMIT 1`, [userId]);
  return rows[0] ? normalizeLevel(rows[0]) : null;
}

async function calculateUserTotalSpent(userId, conn = null) {
  const rows = await execute(conn, `SELECT COALESCE(SUM(pay_amount), 0) AS total_spent
    FROM orders WHERE user_id = ? AND pay_at IS NOT NULL
      AND status IN ('paid', 'shipping', 'shipped', 'processing', 'completed', 'refund_pending', 'refunding')
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(shipping_address), shipping_address, '{}'), '$.refund_payment_conflict')), 'false') <> 'true'`, [userId]);
  return Number(rows[0]?.total_spent || 0);
}

export async function syncUserMembership(userId, conn = null, reason = 'order_sync') {
  if (!conn) return transaction(tx => syncUserMembership(userId, tx, reason));
  await execute(conn, 'SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
  const totalSpent = await calculateUserTotalSpent(userId, conn);
  const levels = await getMemberLevelRules(conn);
  let matched = levels.filter((level) => totalSpent >= level.spentRequired).at(-1) || levels[0];
  if (!matched?.id) throw new Error('会员等级配置不存在');

  const currentRows = await execute(conn, `SELECT level_id, protected_level_id FROM user_memberships WHERE user_id = ? FOR UPDATE`, [userId]);
  if (currentRows[0]?.protected_level_id) {
    const [protectedLevel] = await execute(conn, 'SELECT * FROM member_levels WHERE id=?', [currentRows[0].protected_level_id]);
    if (protectedLevel && Number(protectedLevel.spent_required) >= matched.spentRequired) matched = normalizeLevel(protectedLevel);
  }
  const currentLevelId = Number(currentRows[0]?.level_id || 0);
  if (!currentLevelId) {
    await execute(conn, `INSERT INTO user_memberships (user_id, level_id, effective_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [userId, matched.id]);
  } else if (currentLevelId !== matched.id) {
    await execute(conn, `UPDATE user_memberships SET level_id = ?, effective_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [matched.id, userId]);
    await execute(conn, `INSERT INTO user_membership_history (user_id, from_level_id, to_level_id, total_spent, reason)
      VALUES (?, ?, ?, ?, ?)`, [userId, currentLevelId, matched.id, totalSpent, reason]);
  }

  return { id: userId, member_level: matched.level, total_spent: totalSpent, member_level_id: matched.id };
}

export async function setUserMembership(userId, levelCode, conn = null, reason = 'admin_adjustment') {
  if (!conn) return transaction(tx => setUserMembership(userId, levelCode, tx, reason));
  await execute(conn, 'SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
  const levels = await getMemberLevelRules(conn);
  const matched = levels.find((level) => level.level === levelCode);
  if (!matched?.id) throw new Error('指定的会员等级不存在');
  const currentRows = await execute(conn, `SELECT level_id FROM user_memberships WHERE user_id = ? FOR UPDATE`, [userId]);
  const currentLevelId = Number(currentRows[0]?.level_id || 0);
  if (!currentLevelId) {
    await execute(conn, `INSERT INTO user_memberships (user_id, level_id, protected_level_id, effective_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, [userId, matched.id, matched.id]);
  } else if (currentLevelId !== matched.id) {
    await execute(conn, `UPDATE user_memberships SET level_id = ?, effective_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [matched.id, userId]);
    const totalSpent = await calculateUserTotalSpent(userId, conn);
    await execute(conn, `INSERT INTO user_membership_history (user_id, from_level_id, to_level_id, total_spent, reason)
      VALUES (?, ?, ?, ?, ?)`, [userId, currentLevelId, matched.id, totalSpent, reason]);
  }
  await execute(conn, 'UPDATE user_memberships SET protected_level_id=? WHERE user_id=?', [matched.id, userId]);
  return { id: userId, member_level: matched.level, member_level_id: matched.id };
}
