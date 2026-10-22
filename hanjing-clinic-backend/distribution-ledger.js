import { query, transaction } from './db.js';

export function businessError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export async function getDistributionFeatureConfig(conn = null) {
  const sql = `SELECT key_name, key_value FROM system_settings
    WHERE key_name IN ('distribution_settle_days','enable_distribution','min_withdraw','withdraw_fee_rate')`;
  const rows = conn ? (await conn.execute(sql))[0] : await query(sql);
  const values = Object.fromEntries(rows.map(row => [row.key_name, row.key_value]));
  if (Object.keys(values).length !== 4 || Object.values(values).some(value => String(value).trim() === '')) {
    throw businessError('请先配置结算天数、分销开关、最低提现金额和手续费率', 503);
  }
  const settleDays = Number(values.distribution_settle_days);
  const minWithdrawAmount = Math.round(Number(values.min_withdraw) * 100);
  const rate = Number(values.withdraw_fee_rate);
  if (!Number.isSafeInteger(settleDays) || settleDays < 0 ||
      !Number.isSafeInteger(minWithdrawAmount) || minWithdrawAmount <= 0 ||
      !Number.isFinite(rate) || rate < 0 || rate >= 100 ||
      !['true', 'false'].includes(String(values.enable_distribution))) {
    throw businessError('分销财务配置无效，请联系运营人员', 503);
  }
  return { settleDays, minWithdrawAmount, enableDistribution: String(values.enable_distribution) === 'true',
    withdrawFeeRates: { wechat: 0, bank: rate / 100 }, eligibleLevels: ['gold', 'diamond'] };
}

export function withdrawStatus(status) {
  if (['success', 'completed', 'paid'].includes(status)) return 'paid';
  if (['failed', 'rejected'].includes(status)) return 'rejected';
  return status;
}

export function publicWithdrawAccount(value) {
  let account;
  try { account = typeof value === 'string' ? JSON.parse(value) : value; } catch { return { label: value }; }
  if (!account || typeof account !== 'object') return {};
  const { accountNoEncrypted, ...visible } = account;
  return visible;
}

export async function readCommissionLedger(conn, promoterId, userId) {
  const [[commission]] = await conn.execute(
    `SELECT COALESCE(SUM(CASE WHEN status != 'refunded' THEN commission_amount ELSE 0 END),0) total,
      COALESCE(SUM(CASE WHEN status = 'settled' THEN commission_amount ELSE 0 END),0) settled,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END),0) frozen
     FROM distribution_orders WHERE distributor_id = ?`, [promoterId]);
  const [[withdrawal]] = await conn.execute(
    `SELECT COALESCE(SUM(CASE WHEN status IN ('success','completed','paid') THEN amount ELSE 0 END),0) paid,
      COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN amount ELSE 0 END),0) reserved
     FROM withdraw_records WHERE user_id = ?`, [userId]);
  return {
    total: Number(commission.total), frozen: Number(commission.frozen),
    withdrawn: Number(withdrawal.paid), reserved: Number(withdrawal.reserved),
    available: Number(commission.settled) - Number(withdrawal.paid) - Number(withdrawal.reserved)
  };
}

export async function settleCommissions(userId = null) {
  const config = await getDistributionFeatureConfig();
  if (!config.enableDistribution) return 0;
  const configuredDays = config.settleDays;
  const promoters = await query(
    'SELECT id, user_id FROM distributors WHERE (? IS NULL OR user_id = ?) ORDER BY id',
    [userId, userId]
  );
  let settled = 0;
  for (const promoter of promoters) {
    settled += await transaction(async (conn) => {
      // All entry points use the same locking read, so each commission is credited once.
      const [rows] = await conn.execute(
        `SELECT d.id, d.commission_amount FROM distribution_orders d
         JOIN orders o ON o.id = d.order_id
         WHERE d.distributor_id = ? AND d.status = 'pending' AND o.status = 'completed'
           AND o.pay_at IS NOT NULL AND o.pay_amount > 0
           AND d.commission_amount >= 0 AND d.commission_amount <= o.pay_amount
           AND (d.lock_until <= CURRENT_TIMESTAMP OR
             (d.lock_until IS NULL AND o.updated_at <= DATE_SUB(NOW(), INTERVAL ? DAY)))
         ORDER BY d.id FOR UPDATE`, [promoter.id, configuredDays]
      );
      if (!rows.length) return 0;
      let total = 0;
      for (const row of rows) {
        const [result] = await conn.execute(
          "UPDATE distribution_orders SET status = 'settled', settled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
          [row.id]
        );
        if (result.affectedRows === 1) total += Number(row.commission_amount);
      }
      await conn.execute('UPDATE distributors SET available_commission = available_commission + ? WHERE id = ?', [total, promoter.id]);
      await conn.execute('INSERT INTO user_notifications (user_id, title, content) VALUES (?, ?, ?)',
        [promoter.user_id, '佣金已结算', `推广佣金 ¥${(total / 100).toFixed(2)} 已转为可提现余额。`]);
      return total;
    });
  }
  return settled;
}

export async function reviewWithdrawal(id, approve, remark) {
  return transaction(async (conn) => {
    const [[record]] = await conn.execute('SELECT * FROM withdraw_records WHERE id = ? FOR UPDATE', [id]);
    if (!record || record.status !== 'pending') throw businessError('提现记录不存在或已审核', 409);
    await conn.execute(
      `UPDATE withdraw_records SET status = ?, remark = ?, reviewed_at = CURRENT_TIMESTAMP,
       completed_at = NULL WHERE id = ?`, [approve ? 'approved' : 'failed', remark, id]
    );
    if (!approve) {
      await conn.execute('UPDATE distributors SET available_commission = available_commission + ? WHERE user_id = ?', [record.amount, record.user_id]);
    }
    await conn.execute('INSERT INTO user_notifications (user_id, title, content) VALUES (?, ?, ?)',
      [record.user_id, approve ? '提现审核通过' : '提现申请已驳回',
        approve ? '提现审核通过，等待实际打款。' : `提现已驳回，¥${(record.amount / 100).toFixed(2)} 已退回余额。${remark}`]);
    return record;
  });
}

export async function confirmWithdrawalPaid(id, reference) {
  const receipt = String(reference || '').trim();
  if (receipt.length < 6 || receipt.length > 120) throw businessError('请填写真实银行转账流水号（6-120字符）');
  return transaction(async (conn) => {
    const [[record]] = await conn.execute('SELECT * FROM withdraw_records WHERE id = ? FOR UPDATE', [id]);
    if (!record || record.status !== 'approved') throw businessError('只有审核通过且尚未打款的记录可以确认', 409);
    let account;
    try { account = JSON.parse(record.account_info); } catch {}
    if (account?.method !== 'bank') throw businessError('自动转账尚未接入，此处仅可登记实际完成的银行转账', 503);
    await conn.execute(
      "UPDATE withdraw_records SET status = 'paid', payout_reference = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [receipt, id]
    );
    await conn.execute('UPDATE distributors SET withdrawn_amount = withdrawn_amount + ? WHERE user_id = ?', [record.amount, record.user_id]);
    await conn.execute('INSERT INTO user_notifications (user_id, title, content) VALUES (?, ?, ?)',
      [record.user_id, '提现已打款', `银行转账已登记，到账金额 ¥${(record.actual_amount / 100).toFixed(2)}。`]);
    return record;
  });
}
