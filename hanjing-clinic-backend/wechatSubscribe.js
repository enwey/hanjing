import { get, query, run, transaction } from './db.js';
import { setTimeout as delay } from 'node:timers/promises';
import { getWechatMiniAccessToken, isWechatAccessTokenInvalid } from './wechatMiniToken.js';
import { WECHAT_NOTIFICATION_EVENTS, notificationConfigKey, defaultNotificationMapping, normalizeNotificationPage } from './wechat-notification-config.js';

const EVENT_TEMPLATE_KEYS = {
  visit_reminder: ['wechat_template_visit_reminder'],
  withdraw_result: ['wechat_template_withdraw_result'],
  withdraw_paid: ['wechat_template_withdraw_paid', 'wechat_template_withdraw_result'],
  order_shipped: ['wechat_template_order_shipped'],
  promoter_activated: ['wechat_template_promoter_activated'],
};

const EVENT_SWITCH_KEYS = {
  visit_reminder: 'notify_visit_reminder',
  withdraw_result: 'notify_withdraw_apply'
};

function firstTemplateId(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)[0] || '';
}

function truncateValue(value, maxLength) {
  const text = String(value ?? '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function thing(value) {
  return { value: truncateValue(value, 20) || '-' };
}

function name(value) {
  return { value: truncateValue(value, 10) || '-' };
}

function phrase(value) {
  return { value: truncateValue(value, 5) || '-' };
}

function date(value) {
  return { value: truncateValue(value, 20) || '-' };
}

function amount(value) {
  return { value: truncateValue(value, 10) || '-' };
}

function character(value) {
  return { value: truncateValue(value, 32) || '-' };
}

function buildTemplateData(event, payload = {}) {
  if (event === 'visit_reminder') {
    return {
      name1: name(payload.patientName || payload.storeName || '兴康明'),
      date3: date(payload.appointmentTime || payload.dateTime || payload.date || ''),
      thing69: thing(payload.doctorName || payload.storeName || '门诊服务'),
      phrase14: phrase(payload.status || payload.statusText || '提醒'),
      character_string15: character(payload.appointmentNo || payload.remark || '请按时到诊')
    };
  }

  if (event === 'order_shipped') {
    return {
      character_string6: character(payload.orderNo || ''),
      phrase2: phrase(payload.status || payload.statusText || '通知'),
      thing1: thing(payload.productName || payload.remark || payload.storeName || '订单服务'),
      amount40: amount(payload.amount || ''),
      thing5: thing(payload.remark || '请查看订单详情')
    };
  }

  if (event === 'withdraw_result') {
    return {
      amount1: amount(payload.amount || ''),
      phrase3: phrase(payload.status || payload.statusText || '通知'),
      time6: date(payload.time || ''),
      thing5: thing(payload.remark || '请查看提现记录')
    };
  }

  if (event === 'withdraw_paid') {
    return {
      amount1: amount(payload.amount || ''),
      phrase3: phrase(payload.status || payload.statusText || '已到账'),
      time6: date(payload.time || ''),
      thing5: thing(payload.remark || '提现已到账')
    };
  }

  return {
    thing1: thing(payload.title || '服务通知'),
    thing2: thing(payload.remark || payload.content || '')
  };
}

async function isEventEnabled(event) {
  const definition = WECHAT_NOTIFICATION_EVENTS.find(item => item.event === event);
  if (!definition?.connected) return false;
  const config = await getNotificationOverride(event);
  if (config) return config.enabled === true;
  const switchKey = EVENT_SWITCH_KEYS[event];
  if (!switchKey) return true;
  const row = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [switchKey]);
  return row ? String(row.key_value) === 'true' : true;
}

async function getTemplateId(event) {
  const config = await getNotificationOverride(event);
  if (config) return config.templateId || '';
  const keys = EVENT_TEMPLATE_KEYS[event] || [];
  for (const key of keys) {
    const templateId = await getTemplateIdByKey(key);
    if (templateId) return templateId;
  }
  return '';
}

async function getTemplateIdByKey(key) {
  const setting = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [key]);
  return firstTemplateId(setting?.key_value || process.env[key.toUpperCase()]);
}
async function getNotificationOverride(event) {
  const row = await get('SELECT key_value FROM system_settings WHERE key_name = ?', [notificationConfigKey(event)]);
  if (!row) return null;
  try { return JSON.parse(row.key_value); }
  catch { return { enabled: false, templateId: '' }; }
}
export async function getWechatNotificationSettings() {
  return Promise.all(WECHAT_NOTIFICATION_EVENTS.map(async definition => {
    const config = await getNotificationOverride(definition.event);
    return {
      ...definition,
      enabled: await isEventEnabled(definition.event),
      templateId: await getTemplateId(definition.event),
      mapping: config?.mapping || defaultNotificationMapping(definition),
      source: config ? '独立配置' : '原系统配置 / 环境变量',
      revision: config?.revision || ''
    };
  }));
}
async function hasSent(event, businessId) {
  if (!businessId) return false;
  const row = await get(
    `SELECT id FROM wechat_subscribe_logs WHERE event = ? AND business_id = ? AND status = 'sent' LIMIT 1`,
    [event, String(businessId)]
  );
  return Boolean(row);
}

async function logSend({ userId, openid, event, templateId, businessId, status, errorMessage = '' }, execute = run) {
  await execute(
    `INSERT INTO wechat_subscribe_logs (user_id, openid, event, template_id, business_id, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId || null, openid || '', event, templateId || '', businessId ? String(businessId) : '', status, errorMessage]
  );
}

function getVisitReminderAuthorization({ event, businessId, templateId, openid }, read = get) {
  return read(
    `SELECT id, status FROM wechat_subscribe_logs
     WHERE event = ? AND business_id = ? AND template_id = ? AND openid = ?
       AND status IN ('authorized', 'needs_authorization')
     ORDER BY id DESC LIMIT 1`,
    [event, businessId, templateId, openid]
  );
}

const visitReminderEvent = 'visit_reminder';
const visitReminderRevisionJoin = `LEFT JOIN appointment_reschedule_history h ON h.id = (
  SELECT MAX(id) FROM appointment_reschedule_history WHERE appointment_id = a.id
)`;

function visitReminderBusinessId(row) {
  return row.reminder_revision ? `visit:${row.id}:${row.reminder_revision}` : `visit:${row.id}`;
}

export async function recordVisitReminderAuthorization({ appointmentId, userId, templateId }) {
  if (!await isEventEnabled(visitReminderEvent) || !templateId || templateId !== await getTemplateId(visitReminderEvent)) return false;
  const row = await get(
    `SELECT a.id, u.openid, h.id AS reminder_revision
     FROM appointments a JOIN users u ON u.id = a.user_id
     ${visitReminderRevisionJoin}
     WHERE a.id = ? AND a.user_id = ? AND a.status IN ('pending_payment','pending','confirmed')
       AND TIMESTAMP(a.appointment_date, SUBSTRING_INDEX(a.appointment_time, '-', 1)) >= NOW()`,
    [appointmentId, userId]
  );
  if (!row?.openid || String(row.openid).startsWith('manual_')) return false;
  return transaction(async conn => {
    const [[user]] = await conn.execute('SELECT openid FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (user?.openid !== row.openid) return false;
    await logSend({ userId, openid: row.openid, event: visitReminderEvent, templateId,
      businessId: visitReminderBusinessId(row), status: 'authorized' }, conn.execute.bind(conn));
    return true;
  });
}

async function logNotificationSkip(details, reason) {
  const previous = await get(
    `SELECT id FROM wechat_subscribe_logs
     WHERE event = ? AND business_id = ? AND status = 'skipped' AND error_message = ? LIMIT 1`,
    [details.event, details.businessId, reason]
  );
  if (!previous) await logSend({ ...details, status: 'skipped', errorMessage: reason });
}

export async function getSubscribeTemplateMap() {
  const map = {};
  for (const { event } of WECHAT_NOTIFICATION_EVENTS) {
    if (!await isEventEnabled(event)) continue;
    const templateId = await getTemplateId(event);
    if (templateId) map[event] = templateId;
  }
  return map;
}

export async function sendWechatSubscribeMessage({ userId, event, businessId = '', page = '', payload = {} }) {
  const logEventSkips = Boolean(businessId) && ['order_shipped', 'withdraw_result', 'withdraw_paid', 'promoter_activated'].includes(event);
  const logSkips = Boolean(businessId) && (event === visitReminderEvent || logEventSkips);
  let attempted = logEventSkips && userId ? { userId, event, businessId } : null;
  let authorizationId;
  try {
    if (!userId || !event) return { skipped: true, reason: 'missing_user_or_event' };
    if (businessId && await hasSent(event, businessId)) {
      return { skipped: true, reason: 'already_sent' };
    }
    const config = await getNotificationOverride(event);
    const connected = WECHAT_NOTIFICATION_EVENTS.some(item => item.event === event && item.connected);
    if (!connected || !(config ? config.enabled === true : await isEventEnabled(event))) {
      if (logEventSkips) await logNotificationSkip({ ...attempted, templateId: config?.templateId }, 'notification_disabled');
      return { skipped: true, reason: 'disabled' };
    }

    const user = await get(`SELECT id, openid FROM users WHERE id = ?`, [userId]);
    const templateId = config ? config.templateId : await getTemplateId(event);
    if (!user?.openid || String(user.openid).startsWith('manual_')) {
      if (logSkips) {
        await logNotificationSkip({ userId: user?.id, openid: user?.openid, event, businessId, templateId }, 'missing_openid');
      }
      return { skipped: true, reason: 'missing_openid' };
    }

    if (!templateId) {
      if (logSkips) {
        await logNotificationSkip({ userId, openid: user.openid, event, businessId }, 'missing_template');
      }
      return { skipped: true, reason: 'missing_template' };
    }

    attempted = { userId, openid: user.openid, event, templateId, businessId };
    if (event === visitReminderEvent && businessId) {
      const latest = await getVisitReminderAuthorization(attempted);
      if (latest?.status === 'needs_authorization') return { skipped: true, reason: 'needs_authorization' };
      authorizationId = latest?.id;
    }

    const defaultData = buildTemplateData(event, payload);
    const data = config?.mapping
      ? Object.fromEntries(Object.entries(config.mapping).map(([target, source]) => [target, defaultData[source]]))
      : defaultData;
    const body = JSON.stringify({
      touser: user.openid,
      template_id: templateId,
      page: normalizeNotificationPage(page),
      data,
      miniprogram_state: process.env.WX_MINI_SUBSCRIBE_STATE || 'formal',
      lang: 'zh_CN'
    });
    const send = (accessToken) => fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json' },
      body
    });
    let accessToken = await getWechatMiniAccessToken({ signal: AbortSignal.timeout(10000) });
    let response = await send(accessToken);
    let result = await response.json();
    if (isWechatAccessTokenInvalid(result) || Number(result?.errcode) === -1) {
      if (isWechatAccessTokenInvalid(result)) {
        accessToken = await getWechatMiniAccessToken({ forceRefresh: true, signal: AbortSignal.timeout(10000) });
      } else {
        await delay(1000);
      }
      response = await send(accessToken);
      result = await response.json();
    }
    if (!response.ok || result?.errcode !== 0) {
      const message = String(result?.errmsg || `HTTP ${response.status}, errcode ${result?.errcode ?? 'missing'}`).slice(0, 255);
      if (event === visitReminderEvent && businessId && Number(result?.errcode) === 43101) {
        // Serialize with authorization writes, without holding a lock during the WeChat request.
        await transaction(async conn => {
          const [[user]] = await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
          if (!user) return;
          const latest = await getVisitReminderAuthorization(attempted, async (sql, params) => {
            const [[row]] = await conn.execute(sql, params);
            return row;
          });
          const reauthorized = latest?.status === 'authorized' && latest.id !== authorizationId;
          const status = reauthorized ? 'failed' : 'needs_authorization';
          const errorMessage = reauthorized ? `发送期间已重新授权：${message}`.slice(0, 255) : message;
          await logSend({ ...attempted, status, errorMessage }, conn.execute.bind(conn));
        });
      } else {
        await logSend({ ...attempted, status: 'failed', errorMessage: message });
      }
      return { skipped: true, reason: message };
    }

    await logSend({ userId, openid: user.openid, event, templateId, businessId, status: 'sent' });
    return { sent: true };
  } catch (error) {
    if (attempted) {
      try { await logSend({ ...attempted, status: 'failed', errorMessage: String(error.message || 'send_failed').slice(0, 255) }); }
      catch { /* Notification errors must not roll back completed business operations. */ }
    }
    console.warn('[Wechat Subscribe] Send failed:', error.message || error);
    return { skipped: true, reason: error.message || 'send_failed' };
  }
}
export async function processVisitReminders() {
  if (!await isEventEnabled('visit_reminder')) return;
  const rows = await query(
    `SELECT a.id, a.user_id, a.appointment_no,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            SUBSTRING_INDEX(a.appointment_time, '-', 1) AS appointment_start_time,
            a.doctor_name, a.store_name, p.name AS patient_name,
            h.id AS reminder_revision, h.created_at AS rescheduled_at
     FROM appointments a
     LEFT JOIN patients p ON p.id = a.patient_id
     ${visitReminderRevisionJoin}
     WHERE a.status IN ('pending', 'confirmed')
       AND TIMESTAMP(a.appointment_date, SUBSTRING_INDEX(a.appointment_time, '-', 1)) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 HOUR)`
  );

  for (const row of rows) {
    // Retain successful sends made by older releases for the current time slot.
    if (row.reminder_revision && await get(
      `SELECT id FROM wechat_subscribe_logs WHERE event = ? AND business_id = ?
       AND status = 'sent' AND sent_at >= ? LIMIT 1`,
      [visitReminderEvent, `visit:${row.id}`, row.rescheduled_at]
    )) continue;
    await sendWechatSubscribeMessage({
      userId: row.user_id,
      event: visitReminderEvent,
      businessId: visitReminderBusinessId(row),
      page: `pages/appointment/detail/index?id=${row.id}`,
      payload: {
        patientName: row.patient_name,
        doctorName: row.doctor_name,
        storeName: row.store_name,
        appointmentTime: `${row.appointment_date} ${row.appointment_start_time}`,
        status: '待就诊',
        appointmentNo: row.appointment_no
      }
    });
  }
}

