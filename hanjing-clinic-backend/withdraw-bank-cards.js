import { decryptPII, encryptPII } from './helpers.js';

export async function initWithdrawBankCards(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS application_migrations (
      migration_key VARCHAR(100) PRIMARY KEY
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS withdraw_bank_cards (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      bank_name VARCHAR(100) NOT NULL,
      account_name VARCHAR(100) NOT NULL,
      account_no_encrypted VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NULL,
      last_four CHAR(4) CHARACTER SET ascii NOT NULL,
      last_withdraw_id BIGINT UNSIGNED NOT NULL,
      UNIQUE KEY uniq_withdraw_bank_card (user_id, account_no_encrypted),
      KEY idx_withdraw_bank_card_recent (user_id, last_withdraw_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

const cardError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validNumber = (value) => /^\d{8,34}$/.test(value);

export function validateBankCard(info, existing = null) {
  const bankName = String(info?.bankName || '').trim();
  const accountName = String(info?.accountName || '').trim();
  const accountNo = String(info?.accountNo || '').trim();
  if (!bankName || !accountName || (!accountNo && !existing?.account_no_encrypted)) {
    throw cardError('请填写完整的银行卡信息');
  }
  if (bankName.length > 100 || accountName.length > 100 || (accountNo && !validNumber(accountNo))) {
    throw cardError('银行卡信息格式无效');
  }
  return {
    bank_name: bankName,
    account_name: accountName,
    account_no_encrypted: accountNo ? encryptPII(accountNo) : existing.account_no_encrypted,
    last_four: accountNo ? accountNo.slice(-4) : existing.last_four,
  };
}

export function presentBankCard(card) {
  return {
    id: String(card.id),
    bankName: card.bank_name,
    accountName: card.account_name,
    maskedAccountNo: card.last_four ? '**** ' + card.last_four : '卡号待补全',
    needsAccountNo: !(card.has_account_no ?? card.account_no_encrypted),
  };
}

export function bankWithdrawalSnapshot(card) {
  if (!card.account_no_encrypted) throw cardError('请先编辑银行卡并补全卡号');
  return JSON.stringify({
    method: 'bank',
    bankName: card.bank_name,
    accountName: card.account_name,
    accountNoEncrypted: card.account_no_encrypted,
    accountNo: '********' + card.last_four,
  });
}

export async function lockBankCard(conn, userId, cardId) {
  const id = typeof cardId === 'string' || Number.isSafeInteger(cardId) ? String(cardId) : '';
  if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n) {
    throw cardError('银行卡编号无效');
  }
  const [[card]] = await conn.execute(
    `SELECT CAST(id AS CHAR) AS id, bank_name, account_name, account_no_encrypted, last_four
     FROM withdraw_bank_cards WHERE user_id = ? AND id = ? FOR UPDATE`,
    [userId, id]
  );
  if (!card) throw cardError('银行卡不存在或已删除', 404);
  return card;
}

export async function storeSubmittedBankCard(conn, userId, card, withdrawId) {
  await conn.execute(
    `INSERT INTO withdraw_bank_cards (user_id, bank_name, account_name, account_no_encrypted, last_four, last_withdraw_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       bank_name = IF(VALUES(last_withdraw_id) >= last_withdraw_id, VALUES(bank_name), bank_name),
       account_name = IF(VALUES(last_withdraw_id) >= last_withdraw_id, VALUES(account_name), account_name),
       last_withdraw_id = GREATEST(last_withdraw_id, VALUES(last_withdraw_id))`,
    [userId, card.bank_name, card.account_name, card.account_no_encrypted, card.last_four, withdrawId]
  );
}

export async function mergeWithdrawBankCards(conn, sourceUserId, targetUserId) {
  const [cards] = await conn.execute('SELECT * FROM withdraw_bank_cards WHERE user_id = ? FOR UPDATE', [sourceUserId]);
  for (const card of cards) {
    await storeSubmittedBankCard(conn, targetUserId, card, card.last_withdraw_id);
  }
  await conn.execute('DELETE FROM withdraw_bank_cards WHERE user_id = ?', [sourceUserId]);
}

const backfillKey = 'withdraw_bank_cards_backfill_v1';

export async function backfillWithdrawBankCards(query, transaction) {
  if ((await query('SELECT 1 FROM application_migrations WHERE migration_key = ?', [backfillKey])).length) return;

  await transaction(async (conn) => {
    // Claim and import in the same transaction. Failed imports can retry at startup.
    const [claim] = await conn.execute(
      "INSERT IGNORE INTO application_migrations (migration_key) VALUES (?)",
      [backfillKey]
    );
    if (!claim.affectedRows) return;

    let afterId = 0;
    for (;;) {
      const [rows] = await conn.execute(
        `SELECT id, user_id, account_info FROM withdraw_records
         WHERE id > ? AND user_id IS NOT NULL ORDER BY id LIMIT 500`,
        [afterId]
      );
      for (const row of rows) {
        let account;
        try {
          account = typeof row.account_info === 'string' ? JSON.parse(row.account_info) : row.account_info;
        } catch {
          continue;
        }
        if (!account || (account.method && account.method !== 'bank')) continue;
        const bankName = String(account.bankName || '').trim().slice(0, 100);
        const accountName = String(account.accountName || '').trim().slice(0, 100);
        if (account.method !== 'bank' && (!bankName || !accountName)) continue;
        const decoded = decryptPII(String(account.accountNoEncrypted || ''));
        const original = String(account.accountNo || '').trim();
        const accountNo = validNumber(decoded) ? decoded : validNumber(original) ? original : '';
        const lastFour = accountNo.slice(-4)
          || String(account.accountNo || account.label || '').match(/(?:[*＊•xX]+|尾号)\s*(\d{4})$/)?.[1] || '';
        await storeSubmittedBankCard(conn, row.user_id, {
          bank_name: bankName,
          account_name: accountName,
          account_no_encrypted: accountNo ? encryptPII(accountNo) : null,
          last_four: lastFour,
        }, row.id);
      }
      if (rows.length < 500) return;
      afterId = rows.at(-1).id;
    }
  });
}
