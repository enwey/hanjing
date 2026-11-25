import { randomBytes } from 'node:crypto';
import { get, query, transaction } from './db.js';
import { decryptPII, encryptPII, formatShanghaiDateTime } from './helpers.js';
import { writeNotification } from './notification-center.js';
import { getWechatTransferGateway } from './wechatPay.js';
import { sendWechatSubscribeMessage } from './wechatSubscribe.js';

export const authorizationCallbackPath = '/api/v1/pay/wechat-withdraw-authorization-callback';
export const realNameThreshold = 200000;
const root = '/v3/fund-app/mch-transfer';
const authorizationPath = `${root}/user-confirm-authorization`;
const terminalStates = ['SUCCESS', 'FAIL', 'CANCELLED'];
const newNumber = prefix => prefix + randomBytes(15).toString('hex');
const notFound = error => error.statusCode === 404 && error.data?.code === 'NOT_FOUND';
const unavailable = () => Object.assign(new Error('微信零钱提现暂不可用，请选择银行卡'), { statusCode: 503 });
const authRequired = () => Object.assign(new Error('请先完成微信零钱收款授权'), { statusCode: 409 });

export async function initWechatWithdrawals(execute) {
  await execute(`CREATE TABLE IF NOT EXISTS wechat_withdraw_authorizations (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    out_authorization_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    user_id BIGINT UNSIGNED NOT NULL,
    mch_id VARCHAR(32) NOT NULL,
    app_id VARCHAR(32) NOT NULL,
    openid VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    scene_id VARCHAR(36) NOT NULL,
    authorization_id VARCHAR(32) NULL,
    package_info VARCHAR(512) NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'CREATED',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_wechat_withdraw_auth_user (user_id, mch_id, app_id, scene_id, openid, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await execute(`CREATE TABLE IF NOT EXISTS wechat_withdraw_transfers (
    withdraw_id BIGINT UNSIGNED PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    out_bill_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    out_authorization_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    real_name_encrypted VARCHAR(512) NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'awaiting_review',
    first_attempt_at DATETIME(3) NULL,
    next_attempt_at DATETIME(3) NULL,
    claim_token VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_error VARCHAR(64) NULL,
    UNIQUE KEY uniq_wechat_withdraw_request (user_id, request_id),
    KEY idx_wechat_withdraw_due (next_attempt_at, state),
    FOREIGN KEY (withdraw_id) REFERENCES withdraw_records(id) ON DELETE RESTRICT,
    FOREIGN KEY (out_authorization_no) REFERENCES wechat_withdraw_authorizations(out_authorization_no) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
}

export async function getWechatWithdrawalConfig() {
  if (process.env.WECHAT_WITHDRAW_ENABLED !== 'true') return null;
  const sceneId = process.env.WECHAT_WITHDRAW_SCENE_ID || '';
  if (!/^\d{1,36}$/.test(sceneId)) return null;
  const minAmount = Number(process.env.WECHAT_WITHDRAW_MIN_CENTS || 10);
  const maxAmount = Number(process.env.WECHAT_WITHDRAW_MAX_CENTS);
  if (!Number.isSafeInteger(minAmount) || !Number.isSafeInteger(maxAmount)
    || minAmount < 10 || maxAmount < minAmount || maxAmount > 2147483647) return null;
  let origin;
  try { origin = new URL(process.env.WECHAT_WITHDRAW_NOTIFY_BASE_URL); } catch { return null; }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return null;
  const gateway = await getWechatTransferGateway();
  const miniAppId = process.env.WX_MINI_APP_ID;
  if (!gateway || !miniAppId || gateway.appId !== miniAppId) return null;
  return { ...gateway, sceneId, minAmount, maxAmount, notifyUrl: origin.origin + authorizationCallbackPath };
}

async function findAuthorization(userId, config, create) {
  return transaction(async conn => {
    const [[user]] = await conn.execute('SELECT openid FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!/^o[A-Za-z0-9_-]{20,63}$/.test(user?.openid || '')) return null;
    const scope = [userId, config.mchId, config.appId, user.openid, config.sceneId];
    const [[row]] = await conn.execute(
      `SELECT * FROM wechat_withdraw_authorizations WHERE user_id=? AND mch_id=? AND app_id=?
       AND openid=? AND scene_id=? ORDER BY id DESC LIMIT 1`, scope
    );
    if (!create || (row && row.state !== 'CLOSED')) return row;
    const number = newNumber('WA');
    await conn.execute(
      `INSERT INTO wechat_withdraw_authorizations
       (out_authorization_no, user_id, mch_id, app_id, openid, scene_id) VALUES (?, ?, ?, ?, ?, ?)`, [number, ...scope]
    );
    return { out_authorization_no: number, openid: user.openid, state: 'CREATED' };
  });
}

async function saveAuthorization(number, state, authorizationId = null) {
  await query(
    `UPDATE wechat_withdraw_authorizations SET state=?, authorization_id=COALESCE(?, authorization_id),
      package_info=IF(?='WAIT_USER_CONFIRM', package_info, NULL)
     WHERE out_authorization_no=? AND state<>'CLOSED' AND (? <> 'WAIT_USER_CONFIRM' OR state<>'TAKING_EFFECT')`,
    [state, authorizationId, state, number, state]
  );
}

async function readAuthorization(config, row, display = false) {
  const result = await config.request('GET',
    `${authorizationPath}/out-authorization-no/${row.out_authorization_no}?is_display_authorization=${display}`);
  if (result.out_authorization_no !== row.out_authorization_no || result.appid !== config.appId
    || result.openid !== row.openid || (result.transfer_scene_id && result.transfer_scene_id !== config.sceneId)
    || !['WAIT_USER_CONFIRM', 'TAKING_EFFECT', 'CLOSED'].includes(result.state)
    || (result.state === 'TAKING_EFFECT' && !result.authorization_id)) throw new Error('AUTHORIZATION_MISMATCH');
  await saveAuthorization(row.out_authorization_no, result.state, result.authorization_id);
  const local = await get('SELECT state FROM wechat_withdraw_authorizations WHERE out_authorization_no=?', [row.out_authorization_no]);
  return { ...result, state: local.state };
}

export async function getWechatAuthorization(userId, prepare, config) {
  config ??= await getWechatWithdrawalConfig();
  if (!config) return { enabled: false, authorized: false };
  const row = await findAuthorization(userId, config, prepare);
  if (!row || row.state === 'CLOSED') {
    if (prepare && !row) throw Object.assign(new Error('请使用微信登录后再授权收款'), { statusCode: 409 });
    return { enabled: true, authorized: false };
  }
  let result;
  try {
    try {
      result = await readAuthorization(config, row, prepare);
    } catch (error) {
      if (!notFound(error)) throw error;
      if (row.state === 'WAIT_USER_CONFIRM' && Date.now() - new Date(row.created_at).getTime() > 30 * 86400000) {
        await saveAuthorization(row.out_authorization_no, 'CLOSED');
        result = { state: 'CLOSED' };
      } else if (row.state !== 'CREATED') {
        throw error;
      } else if (prepare) {
        result = await config.request('POST', authorizationPath, {
          out_authorization_no: row.out_authorization_no,
          appid: config.appId,
          openid: row.openid,
          transfer_scene_id: config.sceneId,
          user_display_name: `推广员 ${userId}`,
          authorization_notify_url: config.notifyUrl
        });
        if (result.out_authorization_no !== row.out_authorization_no) throw new Error('AUTHORIZATION_MISMATCH');
        if (result.state === 'WAIT_USER_CONFIRM') {
          await query(`UPDATE wechat_withdraw_authorizations SET state='WAIT_USER_CONFIRM', package_info=?
            WHERE out_authorization_no=? AND state IN ('CREATED','WAIT_USER_CONFIRM')`,
          [result.package_info || null, row.out_authorization_no]);
        } else result = await readAuthorization(config, row, true);
      }
    }
    if (prepare && result?.state === 'CLOSED') {
      await findAuthorization(userId, config, true);
      return { enabled: true, authorized: false, retry: true };
    }
  } catch {
    throw Object.assign(new Error('暂时无法查询微信收款授权，请稍后重试'), { statusCode: 502 });
  }
  const authorized = result?.state === 'TAKING_EFFECT';
  const packageInfo = result?.package_info || row.package_info;
  return {
    enabled: true,
    authorized,
    ...(authorized ? { authorizationNumber: row.out_authorization_no } : {}),
    ...(prepare && result?.state === 'WAIT_USER_CONFIRM' && packageInfo ? {
      mchId: config.mchId, appId: config.appId, package: packageInfo
    } : {})
  };
}

export async function receiveWechatAuthorization(req, res) {
  try {
    const config = await getWechatTransferGateway();
    const event = config && await config.readNotification(req);
    if (!event) return res.status(401).json({ code: 'FAIL' });
    const { type, data } = event;
    const expected = {
      'MCHTRANSFER.AUTHORIZATION.CONFIRMED': 'TAKING_EFFECT',
      'MCHTRANSFER.AUTHORIZATION.CLOSED': 'CLOSED'
    }[type];
    const row = await get('SELECT * FROM wechat_withdraw_authorizations WHERE out_authorization_no=?', [data.out_authorization_no || '']);
    if (!row) return res.sendStatus(204);
    if (!expected || data.state !== expected || data.appid !== row.app_id || data.openid !== row.openid
      || config.mchId !== row.mch_id || (data.mch_id && data.mch_id !== row.mch_id)
      || (row.authorization_id && data.authorization_id !== row.authorization_id)
      || (expected === 'TAKING_EFFECT' && !data.authorization_id)) return res.status(400).json({ code: 'FAIL' });
    await saveAuthorization(row.out_authorization_no, expected, data.authorization_id || null);
    return res.sendStatus(204);
  } catch {
    return res.status(500).json({ code: 'FAIL' });
  }
}

export async function prepareWechatWithdrawal(userId, amount, body) {
  const config = await getWechatWithdrawalConfig();
  if (!config) throw unavailable();
  if (amount < config.minAmount || amount > config.maxAmount) {
    const minimum = amount < config.minAmount;
    const limit = ((minimum ? config.minAmount : config.maxAmount) / 100).toFixed(2);
    throw Object.assign(new Error(`微信零钱${minimum ? '最低' : '单笔最高'}提现金额为 ${limit} 元`), { statusCode: 400 });
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(requestId)) {
    throw Object.assign(new Error('提现请求编号无效，请重新发起'), { statusCode: 400 });
  }
  const realName = amount >= realNameThreshold && typeof body.realName === 'string' ? body.realName.trim() : '';
  if (amount >= realNameThreshold && (!realName || Buffer.byteLength(realName) > 150 || [...realName].length > 50 || /[\p{C}\d]/u.test(realName))) {
    throw Object.assign(new Error('微信零钱提现满 2,000 元，请填写微信支付实名姓名'), { statusCode: 400 });
  }
  const existing = await get(`SELECT w.amount FROM wechat_withdraw_transfers t
    JOIN withdraw_records w ON w.id=t.withdraw_id WHERE t.user_id=? AND t.request_id=?`, [userId, requestId]);
  if (existing && Number(existing.amount) !== amount) {
    throw Object.assign(new Error('该请求编号已用于另一笔提现'), { statusCode: 409 });
  }
  if (existing) return { existing: true };
  const auth = await getWechatAuthorization(userId, false, config);
  if (!auth.authorized) throw authRequired();
  return { requestId, number: auth.authorizationNumber, encryptedName: realName ? encryptPII(realName) : null };
}

export async function storeWechatWithdrawal(conn, id, userId, details) {
  const [[auth]] = await conn.execute(
    `SELECT a.state FROM wechat_withdraw_authorizations a JOIN users u ON u.id=a.user_id AND u.openid=a.openid
     WHERE a.out_authorization_no=? AND a.user_id=? FOR UPDATE`, [details.number, userId]
  );
  if (auth?.state !== 'TAKING_EFFECT') throw authRequired();
  await conn.execute(
    `INSERT INTO wechat_withdraw_transfers (withdraw_id, user_id, request_id, out_bill_no, out_authorization_no, real_name_encrypted)
     VALUES (?, ?, ?, ?, ?, ?)`, [id, userId, details.requestId, newNumber('WT'), details.number, details.encryptedName]
  );
}

async function finishTransfer(row, state, reference, reason) {
  const completed = await transaction(async conn => {
    const [[record]] = await conn.execute('SELECT * FROM withdraw_records WHERE id=? FOR UPDATE', [row.withdraw_id]);
    if (record?.status !== 'approved') return;
    const [[claim]] = await conn.execute('SELECT claim_token FROM wechat_withdraw_transfers WHERE withdraw_id=? FOR UPDATE', [row.withdraw_id]);
    if (claim?.claim_token !== row.claim_token) return;
    const paid = state === 'SUCCESS';
    await conn.execute(
      `UPDATE withdraw_records SET status=?, payout_reference=?, completed_at=CURRENT_TIMESTAMP
       WHERE id=?`, [paid ? 'paid' : 'failed', reference, record.id]
    );
    const column = paid ? 'withdrawn_amount' : 'available_commission';
    const [updated] = await conn.execute(`UPDATE distributors SET ${column}=${column}+? WHERE id=?`, [record.amount, record.distributor_id]);
    if (updated.affectedRows !== 1) throw new Error('DISTRIBUTOR_MISMATCH');
    await conn.execute(
      `UPDATE wechat_withdraw_transfers SET state=?, next_attempt_at=NULL, claim_token=NULL, real_name_encrypted=NULL, last_error=? WHERE withdraw_id=?`,
      [state, reason, record.id]
    );
    const amount = (Number(record.actual_amount) / 100).toFixed(2);
    await writeNotification(conn, {
      userId: record.user_id, title: paid ? '微信零钱提现已到账' : '微信零钱提现未到账',
      content: paid ? `¥${amount} 已转入微信零钱。` : `¥${amount} 已退回可提现余额。`,
      type: 'promo', businessType: 'withdraw', businessId: record.id, onceKey: 'wechat-payout-result'
    });
    return paid ? record : null;
  });
  if (completed) {
    await sendWechatSubscribeMessage({
      userId: completed.user_id, event: 'withdraw_paid', businessId: `withdraw_paid:${completed.id}`,
      page: 'pages/distribution/withdraw-records/index',
      payload: { amount: `¥${(Number(completed.actual_amount) / 100).toFixed(2)}`, status: '已到账',
        time: completed.created_at ? formatShanghaiDateTime(new Date(completed.created_at)) : '', remark: '微信零钱已到账' }
    }).catch(error => console.warn('[Wechat Subscribe] Withdrawal notification failed:', error.message || error));
  }
}

function validateTransfer(config, row, result, inquiry) {
  if (result.out_bill_no !== row.out_bill_no || (result.mch_id ?? result.mchid) !== row.mch_id
    || result.appid !== row.app_id || Number(result.transfer_amount) !== Number(row.actual_amount)
    || (inquiry && result.openid && result.openid !== row.openid)
    || !/^[A-Za-z0-9]{1,100}$/.test(result.transfer_bill_no || '')) throw new Error('TRANSFER_MISMATCH');
}

async function reconcileTransfer(config, row) {
  if (config.appId !== row.app_id || config.mchId !== row.mch_id) throw new Error('MERCHANT_CHANGED');
  let result;
  let inquiry = false;
  if (row.first_attempt_at) {
    const age = Date.now() - new Date(row.first_attempt_at).getTime();
    if (age >= 30 * 86400000) throw new Error('TRANSFER_QUERY_WINDOW_EXPIRED');
    try {
      result = await config.request('GET', `${root}/transfer-bills/out-bill-no/${row.out_bill_no}`);
      inquiry = true;
    } catch (error) {
      // Never reuse an old bill outside a bounded retry window.
      if (!notFound(error) || age > 86400000) throw error;
    }
  }
  if (!result) {
    if (!config.canSend || config.sceneId !== row.scene_id) throw new Error('TRANSFER_DISABLED');
    const owner = await get('SELECT openid FROM users WHERE id=?', [row.user_id]);
    if (owner?.openid !== row.openid) {
      if (!row.first_attempt_at) return finishTransfer(row, 'FAIL', null, 'PAYEE_CHANGED');
      throw new Error('PAYEE_CHANGED');
    }
    const auth = await readAuthorization(config, row);
    if (auth.state !== 'TAKING_EFFECT') {
      if (!row.first_attempt_at && auth.state === 'CLOSED') return finishTransfer(row, 'FAIL', null, 'AUTHORIZATION_CLOSED');
      throw new Error('AUTHORIZATION_INACTIVE');
    }
    const realName = row.real_name_encrypted ? decryptPII(row.real_name_encrypted) : '';
    if (Number(row.actual_amount) >= realNameThreshold && (!realName || realName === row.real_name_encrypted)) {
      throw new Error('REAL_NAME_MISSING');
    }
    const attempt = await query(
      `UPDATE wechat_withdraw_transfers
       SET first_attempt_at=COALESCE(first_attempt_at,NOW(3)), next_attempt_at=DATE_ADD(NOW(3), INTERVAL 90 SECOND)
       WHERE withdraw_id=? AND claim_token=? AND state='processing' AND next_attempt_at>NOW(3)`,
      [row.withdraw_id, row.claim_token]
    );
    if (!attempt.affectedRows) return;
    result = await config.request('POST', `${root}/transfer-bills/transfer`, {
      appid: row.app_id,
      out_bill_no: row.out_bill_no,
      transfer_scene_id: row.scene_id,
      transfer_amount: Number(row.actual_amount),
      transfer_remark: '推广佣金提现',
      transfer_scene_report_infos: [
        { info_type: '岗位类型', info_content: '推广员' },
        { info_type: '报酬说明', info_content: '推广佣金提现' }
      ],
      out_authorization_no: row.out_authorization_no
    }, realName);
  }
  validateTransfer(config, row, result, inquiry);
  if (terminalStates.includes(result.state) && (inquiry || result.state === 'SUCCESS')) {
    const paid = result.state === 'SUCCESS';
    return finishTransfer(row, result.state, paid ? result.transfer_bill_no : null,
      /^[A-Z0-9_]{1,64}$/.test(result.fail_reason || '') && !paid ? result.fail_reason : null);
  }
  throw new Error('TRANSFER_PENDING_CONFIRMATION');
}

export async function processWechatWithdrawals(config) {
  if (!config) {
    const active = await getWechatWithdrawalConfig();
    if (active) config = { ...active, canSend: true };
    else {
      if (!await get('SELECT withdraw_id FROM wechat_withdraw_transfers WHERE first_attempt_at IS NOT NULL AND next_attempt_at <= NOW(3) LIMIT 1')) return;
      config = await getWechatTransferGateway();
    }
  }
  if (!config) return;
  const candidates = await query(
    `SELECT withdraw_id FROM wechat_withdraw_transfers
     WHERE state IN ('queued','processing','reconcile') AND next_attempt_at<=NOW(3)
     AND (? OR first_attempt_at IS NOT NULL) ORDER BY next_attempt_at LIMIT 10`, [Boolean(config.canSend)]
  );
  for (const { withdraw_id: id } of candidates) {
    const token = newNumber('WL');
    const claim = await query(
      `UPDATE wechat_withdraw_transfers SET state='processing', claim_token=?, next_attempt_at=DATE_ADD(NOW(3), INTERVAL 90 SECOND)
       WHERE withdraw_id=? AND state IN ('queued','processing','reconcile') AND next_attempt_at<=NOW(3)`, [token, id]
    );
    if (!claim.affectedRows) continue;
    const row = await get(`SELECT t.*, a.mch_id, a.app_id, a.scene_id, a.openid, w.actual_amount
      FROM wechat_withdraw_transfers t JOIN wechat_withdraw_authorizations a USING (out_authorization_no)
      JOIN withdraw_records w ON w.id=t.withdraw_id WHERE t.withdraw_id=? AND t.claim_token=? AND w.status='approved'`, [id, token]);
    if (!row) continue;
    try {
      await reconcileTransfer(config, row);
    } catch (error) {
      const code = error.data?.code || error.message;
      const safeCode = /^[A-Z0-9_]{1,64}$/.test(code || '') ? code : 'RESULT_UNAVAILABLE';
      await query(`UPDATE wechat_withdraw_transfers SET state='reconcile', claim_token=NULL, last_error=?,
        next_attempt_at=IF(?='TRANSFER_QUERY_WINDOW_EXPIRED', NULL, DATE_ADD(NOW(3), INTERVAL 5 MINUTE))
        WHERE withdraw_id=? AND claim_token=?`, [safeCode, safeCode, id, token]);
    }
  }
}
