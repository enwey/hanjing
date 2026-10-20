export async function initPatientProfileSchema(query) {
  const columns = {
    avatar_url: 'VARCHAR(255) DEFAULT NULL',
    birthday: 'DATE DEFAULT NULL',
    store_id: 'BIGINT UNSIGNED DEFAULT NULL',
    region: 'VARCHAR(120) DEFAULT NULL',
    address: 'VARCHAR(255) DEFAULT NULL',
  };
  const existing = new Set((await query('SHOW COLUMNS FROM patients')).map(column => column.Field));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      await query(`ALTER TABLE patients ADD COLUMN ${name} ${definition}`);
    }
  }
}
