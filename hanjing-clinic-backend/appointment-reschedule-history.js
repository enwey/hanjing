export const rescheduleHistorySchema = `CREATE TABLE IF NOT EXISTS appointment_reschedule_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  appointment_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(20) NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  before_snapshot JSON NOT NULL,
  after_snapshot JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointment_history (appointment_id, id)
) ENGINE=InnoDB`;

function dateOnly(value) {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
  }
  return String(value || '').slice(0, 10);
}
function snapshot(row) {
  return {store_id:row.store_id,store_name:row.store_name || '',doctor_id:row.doctor_id,
    doctor_name:row.doctor_name || '',schedule_id:row.schedule_id,
    date:dateOnly(row.appointment_date),time:row.appointment_time};
}

// 与预约更新使用同一事务；旧值必须来自锁定的预约，避免并发时记录过期数据。
export async function recordReschedule(conn, before, after, source, operatorId) {
  const oldValue=snapshot(before), newValue=snapshot(after);
  if (['store_id','doctor_id','schedule_id','date','time'].every(key=>String(oldValue[key])===String(newValue[key]))) return;
  const [[actor]] = await conn.execute(source === 'admin'
    ? "SELECT COALESCE(NULLIF(name, ''), username) AS name FROM admin_users WHERE id=?"
    : 'SELECT nickname AS name FROM users WHERE id=?', [operatorId]);
  await conn.execute(`INSERT INTO appointment_reschedule_history
    (appointment_id, source, operator_id, operator_name, before_snapshot, after_snapshot)
    VALUES (?, ?, ?, ?, ?, ?)`, [before.id, source, operatorId,
      actor?.name || (source==='admin'?'后台人员':'患者用户'),JSON.stringify(oldValue),JSON.stringify(newValue)]);
}

export function parseRescheduleHistory(rows) {
  return rows.map(row=>({...row,
    before_snapshot:typeof row.before_snapshot==='string'?JSON.parse(row.before_snapshot):row.before_snapshot,
    after_snapshot:typeof row.after_snapshot==='string'?JSON.parse(row.after_snapshot):row.after_snapshot}));
}
