// Additive migration: existing mini-program identities and ledgers are preserved.
export async function initBackendPromoterSchema(query) {
  const add = async (table, name, definition) => {
    const cols = await query(`SHOW COLUMNS FROM ${table}`);
    if (!cols.some(c=>c.Field===name)) await query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  await query('ALTER TABLE distributors MODIFY user_id BIGINT UNSIGNED NULL');
  await add('distributors','source_type',"VARCHAR(20) NOT NULL DEFAULT 'mini'");
  await add('distributors','contact_phone','VARCHAR(100) NULL');
  await add('distributors','created_by','BIGINT UNSIGNED NULL');
  await query(`CREATE TABLE IF NOT EXISTS promoter_accounts (
    distributor_id BIGINT UNSIGNED PRIMARY KEY, login_name VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, token_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(distributor_id) REFERENCES distributors(id) ON DELETE CASCADE)`);
  await query(`CREATE TABLE IF NOT EXISTS promoter_codes (
    code VARCHAR(32) PRIMARY KEY, distributor_id BIGINT UNSIGNED NOT NULL,
    active TINYINT NOT NULL DEFAULT 1, image MEDIUMBLOB NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(distributor_id) REFERENCES distributors(id) ON DELETE CASCADE)`);
  await add('promoter_codes','qr_environment','VARCHAR(20) NULL');
  await add('promoter_codes','qr_app_id','VARCHAR(64) NULL');
  // The parent is exactly one of a mini user or an independent promoter.
  await query('ALTER TABLE distribution_relationships MODIFY parent_user_id BIGINT UNSIGNED NULL');
  await add('distribution_relationships','parent_distributor_id','BIGINT UNSIGNED NULL');
  const constraints=await query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='distribution_relationships'");
  if(!constraints.some(c=>c.CONSTRAINT_NAME==='chk_distribution_parent_identity'))
    await query('ALTER TABLE distribution_relationships ADD CONSTRAINT chk_distribution_parent_identity CHECK ((parent_user_id IS NULL) <> (parent_distributor_id IS NULL))');
  if(!constraints.some(c=>c.CONSTRAINT_NAME==='fk_distribution_backend_parent'))
    await query('ALTER TABLE distribution_relationships ADD CONSTRAINT fk_distribution_backend_parent FOREIGN KEY(parent_distributor_id) REFERENCES distributors(id)');
  await add('appointments','referral_promoter_id','BIGINT UNSIGNED NULL');
  await add('appointments','referral_code','VARCHAR(32) NULL');
  await add('orders','referral_promoter_id','BIGINT UNSIGNED NULL');
  await add('orders','referral_mode','VARCHAR(20) NULL');
  await add('orders','distribution_processed','TINYINT NOT NULL DEFAULT 0');
  await query(`CREATE TABLE IF NOT EXISTS promoter_conversions (
    appointment_id BIGINT UNSIGNED PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
    distributor_id BIGINT UNSIGNED NOT NULL, mode VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(appointment_id) REFERENCES appointments(id), FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(distributor_id) REFERENCES distributors(id))`);
  for (const table of ['products','order_items']) {
    const suffix = table === 'order_items' ? '_snapshot' : '';
    await add(table,'backend_referral_enabled'+suffix,'TINYINT NOT NULL DEFAULT 0');
    await add(table,'backend_rate_x'+suffix,'DECIMAL(5,2) NOT NULL DEFAULT 0');
    await add(table,'backend_rate_y'+suffix,'DECIMAL(5,2) NOT NULL DEFAULT 0');
  }
  await add('distribution_orders','commission_kind',"VARCHAR(24) NOT NULL DEFAULT 'tier'");
  await add('distribution_orders','calculation_snapshot','JSON NULL');
  await query('ALTER TABLE withdraw_records MODIFY user_id BIGINT UNSIGNED NULL');
  await add('withdraw_records','distributor_id','BIGINT UNSIGNED NULL');
  await query(`UPDATE withdraw_records w JOIN distributors d ON d.user_id=w.user_id
    SET w.distributor_id=d.id WHERE w.distributor_id IS NULL`);
}
