import { get, query, run } from './db.js';

const TOKEN_CACHE = {
  value: '',
  expiresAt: 0
};

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

const DEFAULT_TEMPLATE_IDS = {
  wechat_template_appointment_created: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_appointment_paid: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_appointment_changed: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_appointment_status: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_visit_reminder: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_revisit_reminder: 'ZrwxAqI7I6jKWNnh8qaZtzJpJeJmPms-Pb-vaexjljc',
  wechat_template_order_status: 'L2KhvQwmF894HvgrNJaYqft4ZXmI5JQVWzea92vp5Vw',
  wechat_template_withdraw_result: 'OIlLpczSef8MJsw9vAslECSEEXKyrCjj_OQaaqcfZPM',
  wechat_template_withdraw_paid: 'OIlLpczSef8MJsw9vAslECSEEXKyrCjj_OQaaqcfZPM',
  wechat_template_refund_result: 'WQdjQRXxrBz9BMUA3DSohsAW8OzQZiZXR2kHLJ6KLeI'
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

async function getWechatMiniAccessToken() {
  const now = Date.now();
  if (TOKEN_CACHE.value && TOKEN_CACHE.expiresAt > now + 60_000) {
    return TOKEN_CACHE.value;
  }

  const appId = process.env.WX_MINI_APP_ID;
  const appSecret = process.env.WX_MINI_APP_SECRET;
  if (!appId || !appSecret) {
    return '';
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    console.warn('[Wechat Subscribe] Failed to get access token:', data.errmsg || response.status);
    return '';
  }

  TOKEN_CACHE.value = data.access_token;
  TOKEN_CACHE.expiresAt = now + Math.max((Number(data.expires_in) || 7200) - 120, 60) * 1000;
  return TOKEN_CACHE.value;
}

async function isEventEnabled(event) {
  const switchKey = EVENT_SWITCH_KEYS[event];
  if (!switchKey) return true;
  const row = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [switchKey]);
  return row ? String(row.key_value) === 'true' : true;
}

async function getTemplateId(event) {
  const keys = EVENT_TEMPLATE_KEYS[event] || [];
  for (const key of keys) {
    const templateId = await getTemplateIdByKey(key);
    if (templateId) return templateId;
  }
  return '';
}

async function getTemplateIdByKey(key) {
  const setting = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [key]);
  return firstTemplateId(setting?.key_value || process.env[key.toUpperCase()] || DEFAULT_TEMPLATE_IDS[key]);
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
  const ids = [];
  for (const keys of Object.values(EVENT_TEMPLATE_KEYS)) {
    for (const key of keys) {
      const setting = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [key]);
      String(setting?.key_value || process.env[key.toUpperCase()] || DEFAULT_TEMPLATE_IDS[key] || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(id => {
          if (!ids.includes(id)) ids.push(id);
        });
    }
  }
  return ids;
}

export async function getSubscribeTemplateMap() {
  const map = {};
  for (const [event, keys] of Object.entries(EVENT_TEMPLATE_KEYS)) {
    for (const key of keys) {
      const templateId = await getTemplateIdByKey(key);
      if (templateId) {
        map[event] = templateId;
        break;
      }
    }
  }
  return map;
}

export async function sendWechatSubscribeMessage({ userId, event, businessId = '', page = '', payload = {} }) {
  try {
    if (!userId || !event) return { skipped: true, reason: 'missing_user_or_event' };
    if (businessId && await hasSent(event, businessId)) {
      return { skipped: true, reason: 'already_sent' };
    }
    if (!await isEventEnabled(event)) {
      return { skipped: true, reason: 'disabled' };
    }

    const user = await get(`SELECT id, openid FROM users WHERE id = ?`, [userId]);
    if (!user?.openid || String(user.openid).startsWith('manual_')) {
      return { skipped: true, reason: 'missing_openid' };
    }

    const templateId = await getTemplateId(event);
    if (!templateId) {
      return { skipped: true, reason: 'missing_template' };
    }

    const accessToken = await getWechatMiniAccessToken();
    if (!accessToken) {
      await logSend({ userId, openid: user.openid, event, templateId, businessId, status: 'failed', errorMessage: 'missing_access_token' });
      return { skipped: true, reason: 'missing_access_token' };
    }

    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: user.openid,
        template_id: templateId,
        page: page || 'pages/profile/notifications/index',
        data: buildTemplateData(event, payload),
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
