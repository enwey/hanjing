// 必须在创建预约的同一事务内调用，按预约日期跨门店、跨入口统一递增。
export const appointmentNumberSchema = `CREATE TABLE IF NOT EXISTS appointment_number_sequences (
  appointment_date DATE PRIMARY KEY,
  last_number BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB`;

export async function nextAppointmentNumber(conn, date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('预约日期无效');
  }
  // 唯一日期键的写锁串行化并发分配；事务失败时序号随预约一起回滚。
  await conn.execute(`INSERT INTO appointment_number_sequences (appointment_date, last_number)
    VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1`, [date]);
  const [[row]] = await conn.execute(
    'SELECT last_number FROM appointment_number_sequences WHERE appointment_date = ?', [date]);
  return `AP${date.replace(/-/g, '')}${String(row.last_number).padStart(4, '0')}`;
}
