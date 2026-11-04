import { get, query } from './db.js';
import { commissionReadScope, relationReadScope, promoterReadScope } from './distribution-read-scope.js';

export function comparePeriods(current, previous) {
  current = Number(current || 0); previous = Number(previous || 0);
  return { current, previous, percent: previous === 0 ? (current === 0 ? 0 : 100) : Math.round((current - previous) / previous * 1000) / 10 };
}

export function distributionPeriod(today, range) {
  if (range !== undefined && !['today', 'week', 'month'].includes(range)) throw new Error('统计范围不正确');
  const date = new Date(today + 'T00:00:00Z');
  const fmt = d => d.toISOString().slice(0, 10);
  const shift = (d, days) => new Date(d.getTime() + days * 86400000);
  let start = date, end = shift(date, 1), previous = shift(date, -1);
  if (range === 'week') {
    start = shift(date, -((date.getUTCDay() + 6) % 7));
    end = shift(start, 7); previous = shift(start, -7);
  } else if (range === 'month') {
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  } else if (range === undefined) {
    // Preserve the existing no-range API contract for other consumers.
    start = shift(date, -30); end = date; previous = shift(date, -60);
  }
  return { periodStart: fmt(start), periodEnd: fmt(end), previousStart: fmt(previous),
    periodLabel: {today:'今日',week:'本周',month:'本月'}[range] || '最近30天' };
}

export async function readDistributionTrends(user, selectedRange) {
  const { today } = await get("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'), '%Y-%m-%d') AS today");
  const bounds = distributionPeriod(today, selectedRange);
  const dates = [bounds.periodStart, bounds.previousStart, bounds.periodEnd];
  const commission = commissionReadScope(user, 'dc');
  const relation = relationReadScope(user, 'dr');
  const promoter = promoterReadScope(user, 'd');
  const period = alias => `IF(${alias}.created_at >= ?, 'current', 'previous')`;
  const range = alias => `${alias}.created_at >= ? AND ${alias}.created_at < ?`;
  const [orders, invitations, active] = await Promise.all([
    query(`SELECT ${period('dc')} AS period, COALESCE(SUM(dc.commission_amount),0) AS commission,
      COUNT(DISTINCT dc.order_id) AS orders FROM distribution_orders dc
      WHERE ${range('dc')} AND dc.status <> 'refunded' AND ${commission.sql} GROUP BY period`, [...dates,...commission.params]),
    query(`SELECT ${period('dr')} AS period, COUNT(*) AS invitations FROM distribution_relationships dr
      WHERE ${range('dr')} AND ${relation.sql} GROUP BY period`, [...dates,...relation.params]),
    query(`SELECT ${period('dr')} AS period, COUNT(DISTINCT d.id) AS active FROM distributors d
      JOIN distribution_relationships dr ON (dr.parent_distributor_id=d.id OR dr.parent_user_id=d.user_id)
      WHERE d.status='active' AND dr.level=1 AND ${range('dr')} AND ${promoter.sql} AND ${relation.sql}
      GROUP BY period`, [...dates,...promoter.params,...relation.params])
  ]);
  const compare = (rows, key) => {
    const result = comparePeriods(rows.find(r=>r.period==='current')?.[key], rows.find(r=>r.period==='previous')?.[key]);
    if (selectedRange && result.previous !== 0) result.percent = Math.round((result.current - result.previous) / Math.abs(result.previous) * 100);
    return result;
  };
  return { ...bounds, timezone:'Asia/Shanghai',
    totalCommission:compare(orders,'commission'), promotedOrders:compare(orders,'orders'),
    invitedUsers:compare(invitations,'invitations'), activePromoters:compare(active,'active') };
}
