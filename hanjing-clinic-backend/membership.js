import { get, run } from './db.js';

export const MEMBER_LEVEL_RULES = [
  {
    level: 'normal',
    title: '普通会员',
    color: '#9CA3AF',
    bgColor: '#F3F4F6',
    spentRequired: 0,
    benefits: [
      { icon: 'appointment', title: '在线预约', desc: '随时预约睡眠门诊' },
      { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' }
    ]
  },
  {
    level: 'silver',
    title: '白银会员',
    color: '#6B7280',
    bgColor: '#F3F4F6',
    spentRequired: 100000,
    benefits: [
      { icon: 'appointment', title: '在线预约', desc: '优先时段选择' },
      { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' },
      { icon: 'discount', title: '购物9.5折', desc: '商城商品享95折优惠' }
    ]
  },
  {
    level: 'gold',
    title: '黄金会员',
    color: '#F5A623',
    bgColor: '#FFF9E6',
    spentRequired: 300000,
    benefits: [
      { icon: 'appointment', title: '在线预约', desc: 'VIP优先预约通道' },
      { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' },
      { icon: 'discount', title: '购物9折', desc: '商城商品享9折优惠' },
      { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' },
      { icon: 'channel', title: '分销权限', desc: '可申请成为推广员' }
    ]
  },
  {
    level: 'diamond',
    title: '钻石会员',
    color: '#3B6BF5',
    bgColor: '#EEF4FF',
    spentRequired: 1000000,
    benefits: [
      { icon: 'appointment', title: '在线预约', desc: '院长级专家优先约' },
      { icon: 'assess', title: '免费初筛', desc: 'ESS量表 + AI鼾声分析' },
      { icon: 'discount', title: '购物8.5折', desc: '商城商品享85折优惠' },
      { icon: 'service', title: '专属客服', desc: '1v1健康顾问服务' },
      { icon: 'channel', title: '分销权限', desc: '推广员+高佣金比例' },
      { icon: 'free', title: '年度免费检查', desc: '每年1次免费睡眠监测' }
    ]
  }
];

function getMemberLevelBySpent(totalSpent) {
  const spent = Number(totalSpent || 0);
  let matched = MEMBER_LEVEL_RULES[0];
  for (const rule of MEMBER_LEVEL_RULES) {
    if (spent >= Number(rule.spentRequired || 0)) {
      matched = rule;
    }
  }
  return matched;
}

async function calculateUserTotalSpent(userId, conn = null) {
  const sql = `SELECT COALESCE(SUM(pay_amount), 0) AS total_spent
     FROM orders
     WHERE user_id = ?
       AND pay_at IS NOT NULL
       AND status IN ('paid', 'shipping', 'shipped', 'processing', 'completed', 'refund_pending', 'refunding')`;
  const row = conn
    ? (await conn.execute(sql, [userId]))[0][0]
    : await get(sql, [userId]);
  return Number(row?.total_spent || 0);
}

export async function syncUserMembership(userId, conn = null) {
  const totalSpent = await calculateUserTotalSpent(userId, conn);
  const matched = getMemberLevelBySpent(totalSpent);
  const sql = `UPDATE users
     SET total_spent = ?, member_level = ?
     WHERE id = ?`;
  if (conn) {
    await conn.execute(sql, [totalSpent, matched.level, userId]);
  } else {
    await run(sql, [totalSpent, matched.level, userId]);
  }
  return {
    id: userId,
    member_level: matched.level,
    total_spent: totalSpent,
  };
}
