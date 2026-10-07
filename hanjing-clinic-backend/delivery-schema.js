export async function initDeliverySchema(query) {
  await query(`CREATE TABLE IF NOT EXISTS fulfillment_mold_profiles (
    fulfillment_case_id BIGINT UNSIGNED PRIMARY KEY,
    mold_id BIGINT UNSIGNED NULL,
    details JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    revision INT NOT NULL DEFAULT 1,
    updated_by BIGINT UNSIGNED NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (mold_id) REFERENCES fulfillment_molds(id) ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE RESTRICT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS fulfillment_factory_batches (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    batch_no VARCHAR(80) NOT NULL UNIQUE,
    factory_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    carrier VARCHAR(100) NULL,
    tracking_no VARCHAR(100) NULL,
    sent_at DATETIME NULL,
    sender_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS fulfillment_factory_items (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    batch_id BIGINT UNSIGNED NOT NULL,
    fulfillment_case_id BIGINT UNSIGNED NOT NULL,
    mold_id BIGINT UNSIGNED NOT NULL,
    active_mold_id BIGINT UNSIGNED NULL UNIQUE,
    snapshot JSON NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    feedback TEXT NULL,
    received_at DATETIME NULL,
    returned_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_factory_batch_case (batch_id, fulfillment_case_id),
    FOREIGN KEY (batch_id) REFERENCES fulfillment_factory_batches(id) ON DELETE RESTRICT,
    FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (mold_id) REFERENCES fulfillment_molds(id) ON DELETE RESTRICT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS fulfillment_mold_files (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    fulfillment_case_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(180) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fulfillment_case_id) REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
  )`);
}
