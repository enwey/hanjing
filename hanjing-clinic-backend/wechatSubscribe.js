import { get, query, run } from './db.js';
import { getWechatMiniAccessToken } from './wechatMiniToken.js';
import { WECHAT_NOTIFICATION_EVENTS, notificationConfigKey, defaultNotificationMapping, normalizeNotificationPage } from './wechat-notification-config.js';

const EVENT_TEMPLATE_KEYS = {
  appointment_created: ['wechat_template_appointment_created', 'appointment_subscribe_template_ids'],
  appointment_paid: ['wechat_template_appointment_paid', 'appointment_subscribe_template_ids'],
  appointment_changed: ['wechat_template_appointment_changed', 'appointment_subscribe_template_ids'],
  appointment_status: ['wechat_template_appointment_status', 'appointment_subscribe_template_ids'],
  visit_reminder: ['wechat_template_visit_reminder', 'appointment_subscribe_template_ids'],
  revisit_reminder: ['wechat_template_revisit_reminder', 'appointment_subscribe_template_ids'],
  order_status: ['wechat_template_order_status'],
  withdraw_result: ['wechat_template_withdraw_result'],
  withdraw_paid: ['wechat_template_withdraw_paid', 'wechat_template_withdraw_result'],
  commission_settled: ['wechat_template_commission_settled'],
  refund_result: ['wechat_template_refund_result', 'wechat_template_order_status']
};

const EVENT_SWITCH_KEYS = {
  appointment_created: 'notify_new_booking',
  visit_reminder: 'notify_visit_reminder',
  revisit_reminder: 'notify_revisit_reminder',
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
  if (event.startsWith('appointment_') || event === 'visit_reminder' || event === 'revisit_reminder') {
    return {
      name1: name(payload.patientName || payload.storeName || '鼾静健康'),
      date3: date(payload.appointmentTime || payload.dateTime || payload.date || ''),
      thing69: thing(payload.doctorName || payload.storeName || '门诊服务'),
      phrase14: phrase(payload.status || payload.statusText || '提醒'),
      character_string15: character(payload.appointmentNo || payload.remark || '请按时到诊')
    };
  }

  if (event === 'order_status') {
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

  if (event === 'commission_settled') {
    return {
      amount1: amount(payload.amount || ''),
      thing2: thing(payload.remark || '佣金已结算'),
      time3: date(payload.time || ''),
      phrase4: phrase(payload.status || '已到账')
    };
  }

  if (event === 'refund_result') {
    return {
      character_string2: character(payload.orderNo || ''),
      amount1: amount(payload.amount || ''),
      time7: date(payload.time || ''),
      phrase4: phrase(payload.status || payload.statusText || '退款'),
      thing5: thing(payload.remark || '请查看退款详情')
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

async function logSend({ userId, openid, event, templateId, businessId, status, errorMessage = '' }) {
  await run(
    `INSERT INTO wechat_subscribe_logs (user_id, openid, event, template_id, business_id, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId || null, openid || '', event, templateId || '', businessId ? String(businessId) : '', status, errorMessage]
  );
}

export async function getAllSubscribeTemplateIds() {
  return [...new Set(Object.values(await getSubscribeTemplateMap()))];
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
  let attempted = null;
  try {
    if (!userId || !event) return { skipped: true, reason: 'missing_user_or_event' };
    if (businessId && await hasSent(event, businessId)) {
      return { skipped: true, reason: 'already_sent' };
    }
    const config = await getNotificationOverride(event);
    const connected = WECHAT_NOTIFICATION_EVENTS.some(item => item.event === event && item.connected);
    if (!connected || !(config ? config.enabled === true : await isEventEnabled(event))) {
      return { skipped: true, reason: 'disabled' };
    }

    const user = await get(`SELECT id, openid FROM users WHERE id = ?`, [userId]);
    if (!user?.openid || String(user.openid).startsWith('manual_')) {
      return { skipped: true, reason: 'missing_openid' };
    }

    const templateId = config ? config.templateId : await getTemplateId(event);
    if (!templateId) {
      return { skipped: true, reason: 'missing_template' };
    }

    attempted = { userId, openid: user.openid, event, templateId, businessId };
    const accessToken = await getWechatMiniAccessToken();
    if (!accessToken) {
      await logSend({ userId, openid: user.openid, event, templateId, businessId, status: 'failed', errorMessage: 'missing_access_token' });
      return { skipped: true, reason: 'missing_access_token' };
    }

    const defaultData = buildTemplateData(event, payload);
    const data = config?.mapping
      ? Object.fromEntries(Object.entries(config.mapping).map(([target, source]) => [target, defaultData[source]]))
      : defaultData;
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: user.openid,
        template_id: templateId,
        page: normalizeNotificationPage(page),
        data,
        miniprogram_state: process.env.WX_MINI_SUBSCRIBE_STATE || 'formal',
        lang: 'zh_CN'
      })
    });
    const result = await response.json();
    if (!response.ok || result.errcode) {
      const message = result.errmsg || `HTTP ${response.status}`;
      await logSend({ userId, openid: user.openid, event, templateId, businessId, status: 'failed', errorMessage: message });
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
    `SELECT a.id, a.user_id, a.appointment_no, a.appointment_date, a.appointment_time,
            a.doctor_name, a.store_name, p.name AS patient_name
     FROM appointments a
     LEFT JOIN patients p ON p.id = a.patient_id
     WHERE a.status IN ('pending', 'confirmed')
       AND TIMESTAMP(a.appointment_date, SUBSTRING_INDEX(a.appointment_time, '-', 1)) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 HOUR)`
  );

  for (const row of rows) {
    await sendWechatSubscribeMessage({
      userId: row.user_id,
      event: 'visit_reminder',
      businessId: `visit:${row.id}`,
      page: `pages/appointment/detail/index?id=${row.id}`,
      payload: {
        patientName: row.patient_name,
        doctorName: row.doctor_name,
        storeName: row.store_name,
        appointmentTime: `${String(row.appointment_date).slice(0, 10)} ${row.appointment_time}`,
        status: '待就诊',
        remark: row.appointment_no
      }
    });
  }
}

export async function processRevisitReminders() {
  if (!await isEventEnabled('revisit_reminder')) return;
  const rows = await query(
    `SELECT pd.id, pd.patient_id, pd.next_adjust_date, pd.device_model, pd.device_name_snapshot,
            p.user_id, p.name AS patient_name
     FROM patient_devices pd
     JOIN patients p ON p.id = pd.patient_id
     WHERE pd.status = 'active'
       AND pd.next_adjust_date IS NOT NULL
       AND pd.next_adjust_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)`
  );

  for (const row of rows) {
    await sendWechatSubscribeMessage({
      userId: row.user_id,
      event: 'revisit_reminder',
      businessId: `revisit:${row.id}:${String(row.next_adjust_date).slice(0, 10)}`,
      page: 'pages/treatment/index',
      payload: {
        patientName: row.patient_name,
        doctorName: '鼾静健康',
        appointmentTime: String(row.next_adjust_date).slice(0, 10),
        status: '复诊',
        remark: row.device_name_snapshot || row.device_model || '阻鼾器调整'
      }
    });
  }
}
