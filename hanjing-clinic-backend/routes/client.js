import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, get, run, transaction, autoUpdateExpiredAppointments } from '../db.js';
import { generateUniquePatientNo } from '../patientNo.js';
import {
  JWT_SECRET,
  checkStoreIsOpen,
  verifyPatientAccess,
  verifyUserAccess,
  maskPhone,
  logAdminAction,
  authenticateWxToken,
  escapeHtml,
  encryptPII,
  decryptPII
} from '../helpers.js';

const app = express.Router();

const SENSITIVE_WORDS = ['广告', '疗效', '包治', '神药', '加微信', '兼职', '刷单'];
function checkSensitiveWords(text) {
  if (!text) return false;
  return SENSITIVE_WORDS.some(word => text.includes(word));
}

const formatDate = (dateVal) => {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(dateVal).slice(0, 10);
};

async function resolveUserPatient(req, patientIdSource = 'query') {
  const source = patientIdSource === 'body' ? req.body : req.query;
  const rawPatientId = source?.patientId || source?.memberId;
  if (rawPatientId && rawPatientId !== 'pat-self') {
    const patient = await get(`SELECT * FROM patients WHERE id = ? AND user_id = ?`, [rawPatientId, req.user.id]);
    if (!patient) {
      const err = new Error('就诊人不存在或无权访问');
      err.statusCode = 404;
      throw err;
    }
    return patient;
  }
  const self = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
  if (self) return self;
  return get(`SELECT * FROM patients WHERE user_id = ? ORDER BY id ASC LIMIT 1`, [req.user.id]);
}

async function resolveTreatmentForPatient(patient, treatmentId) {
  if (!patient) return null;
  if (treatmentId) {
    return get(`SELECT * FROM treatment_records WHERE id = ? AND patient_id = ?`, [treatmentId, patient.id]);
  }
  return get(`SELECT * FROM treatment_records WHERE patient_id = ? AND status = 'active' ORDER BY start_date DESC, id DESC LIMIT 1`, [patient.id]);
}

function buildTreatmentPhases(treatment, adjustments = []) {
  if (!treatment) return [];
  const start = new Date(treatment.start_date || treatment.created_at);
  const formatYmd = (date) => formatDate(date);
  const firstAdjustment = adjustments.length > 0 ? adjustments[adjustments.length - 1] : null;
  const latestAdjustment = adjustments.length > 0 ? adjustments[0] : null;
  const observationEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const phases = [
    { name: '治疗建档', desc: `绑定设备：${treatment.device_product_name || treatment.device_model}`, date: formatYmd(start), status: 'completed', dot: '1' },
    { name: '初始适配', desc: `初始前伸量 ${Number(treatment.initial_advancement || 0)}mm`, date: formatYmd(start), status: 'completed', dot: '2' },
    {
      name: '舒适观察',
      desc: '持续佩戴并记录每日舒适度',
      date: `${formatYmd(start)} ~ ${formatYmd(observationEnd)}`,
      status: latestAdjustment ? 'completed' : 'active',
      dot: '3'
    },
    {
      name: '参数调整',
      desc: latestAdjustment ? `最近调整至 ${Number(latestAdjustment.adjusted_advancement || treatment.current_advancement)}mm` : '等待医生根据佩戴反馈调整',
      date: latestAdjustment ? formatYmd(latestAdjustment.adjust_date) : (treatment.next_adjust_date ? `预计 ${formatYmd(treatment.next_adjust_date)}` : '待定'),
      status: latestAdjustment ? 'active' : 'pending',
      dot: '4'
    },
    {
      name: '效果巩固',
      desc: '复诊评估鼾声、嗜睡和佩戴依从性',
      date: treatment.next_adjust_date ? formatYmd(treatment.next_adjust_date) : '长期',
      status: firstAdjustment && treatment.status === 'active' ? 'pending' : 'pending',
      dot: '5'
    }
  ];
  return phases;
}

function normalizeNumericId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getShanghaiNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
}

function buildScheduleSlots(schedule) {
  const startParts = String(schedule.start_time || '').split(':').map(Number);
  const endParts = String(schedule.end_time || '').split(':').map(Number);
  const startMins = (startParts[0] || 0) * 60 + (startParts[1] || 0);
  const endMins = (endParts[0] || 0) * 60 + (endParts[1] || 0);
  const totalSlots = Number(schedule.total_slots || 0);
  if (totalSlots <= 0 || endMins <= startMins) return [];
  const slotDuration = Math.floor((endMins - startMins) / totalSlots);
  const slots = [];
  for (let idx = 0; idx < totalSlots; idx++) {
    const slotStart = startMins + idx * slotDuration;
    const slotEnd = idx === totalSlots - 1 ? endMins : startMins + (idx + 1) * slotDuration;
    const startH = Math.floor(slotStart / 60);
    const startM = slotStart % 60;
    const endH = Math.floor(slotEnd / 60);
    const endM = slotEnd % 60;
    slots.push({
      id: `slot-${schedule.id}-${idx}`,
      scheduleId: schedule.id,
      startTime: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
      endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      label: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}-${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
    });
  }
  return slots;
}

function getAppointmentStartTime(dateValue, appointmentTime) {
  const dateStr = formatDate(dateValue);
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = String(appointmentTime || '').split('-')[0].trim().split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0);
}

async function getAppointmentPayAmount(appt) {
  const requireDepositRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'require_deposit'`);
  const requireDeposit = requireDepositRow ? requireDepositRow.key_value === 'true' : false;
  const depositAmountRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'deposit_amount'`);
  const depositAmount = depositAmountRow ? parseInt(depositAmountRow.key_value, 10) : 5000;
  const apptDepositAmount = appt.deposit_amount !== undefined && appt.deposit_amount !== null
    ? Number(appt.deposit_amount || 0)
    : (requireDeposit ? depositAmount : 0);
  return apptDepositAmount + Number(appt.consult_fee || 0);
}

async function finalizePaidAppointment(conn, appt, userId) {
  const totalPayAmount = await getAppointmentPayAmount(appt);
  await conn.execute(
    `UPDATE appointments SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending_payment'`,
    [appt.id]
  );
  const orderNo = `OD${new Date().getFullYear()}${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
  const [result] = await conn.execute(
    `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, appointment_id)
     VALUES (?, ?, 'appointment_deposit', ?, 0, NULL, ?, 'wechat', CURRENT_TIMESTAMP, 'paid', ?)`,
    [orderNo, userId || appt.user_id, totalPayAmount, totalPayAmount, appt.id]
  );
  const orderId = result.insertId;
  await conn.execute(
    `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
     VALUES (?, 8, '就诊预约定金', '/static/product/screening.png', ?, 1)`,
    [orderId, totalPayAmount]
  );
  await conn.execute(
    `INSERT INTO user_notifications (user_id, title, content)
     VALUES (?, '预约支付成功', ?)`,
    [
      userId || appt.user_id,
      `您已成功支付预约费用 ¥${(totalPayAmount / 100).toFixed(2)} 元。预约号: ${appt.appointment_no}。`
    ]
  );
}

async function notifyAppointmentUser(userId, title, content) {
  await run(
    `INSERT INTO user_notifications (user_id, title, content) VALUES (?, ?, ?)`,
    [userId, title, content]
  );
}

function getWechatPayConfig() {
  const privateKey = process.env.WECHAT_PAY_PRIVATE_KEY
    ? process.env.WECHAT_PAY_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '';
  const config = {
    appId: process.env.WECHAT_APP_ID || process.env.WX_APPID || '',
    mchId: process.env.WECHAT_PAY_MCH_ID || '',
    serialNo: process.env.WECHAT_PAY_SERIAL_NO || '',
    privateKey,
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || ''
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    const err = new Error(`微信支付配置未完成：${missing.join(', ')}`);
    err.statusCode = 503;
    throw err;
  }
  return config;
}

function getMissingWechatPayConfig() {
  const privateKey = process.env.WECHAT_PAY_PRIVATE_KEY
    ? process.env.WECHAT_PAY_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '';
  const config = {
    appId: process.env.WECHAT_APP_ID || process.env.WX_APPID || '',
    mchId: process.env.WECHAT_PAY_MCH_ID || '',
    serialNo: process.env.WECHAT_PAY_SERIAL_NO || '',
    privateKey,
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || ''
  };
  return Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function allowDevMockWechatPay() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_MOCK_WECHAT_PAY !== 'false';
}

function signWechatPayMessage(message, privateKey) {
  return crypto
    .createSign('RSA-SHA256')
    .update(message)
    .sign(privateKey, 'base64');
}

function buildWechatPayAuthorization(method, urlPath, body, config) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = signWechatPayMessage(message, config.privateKey);
  return {
    timestamp,
    nonceStr,
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`
  };
}

async function buildPaymentParams(subject, amount, outTradeNo, openid, notifyUrlOverride = '') {
  if (!openid) {
    const err = new Error('当前用户缺少微信 openid，无法发起微信支付');
    err.statusCode = 400;
    throw err;
  }
  if (!amount || Number(amount) <= 0) {
    const err = new Error('支付金额必须大于0');
    err.statusCode = 400;
    throw err;
  }

  const config = getWechatPayConfig();
  const urlPath = '/v3/pay/transactions/jsapi';
  const body = JSON.stringify({
    appid: config.appId,
    mchid: config.mchId,
    description: String(subject).slice(0, 127),
    out_trade_no: String(outTradeNo),
    notify_url: notifyUrlOverride || config.notifyUrl,
    amount: {
      total: Number(amount),
      currency: 'CNY'
    },
    payer: {
      openid
    }
  });
  const auth = buildWechatPayAuthorization('POST', urlPath, body, config);
  const response = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.prepay_id) {
    const err = new Error(result.message || '微信统一下单失败');
    err.statusCode = response.status || 502;
    err.data = result;
    throw err;
  }

  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const packageValue = `prepay_id=${result.prepay_id}`;
  const paySign = signWechatPayMessage(`${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, config.privateKey);
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign
  };
}

function decryptWechatPayResource(resource) {
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY || '';
  if (!apiV3Key) {
    const err = new Error('微信支付回调解密密钥未配置');
    err.statusCode = 503;
    throw err;
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8')
  );
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  const encryptedWithTag = Buffer.from(resource.ciphertext, 'base64');
  const encrypted = encryptedWithTag.subarray(0, encryptedWithTag.length - 16);
  const authTag = encryptedWithTag.subarray(encryptedWithTag.length - 16);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

async function finalizePaidProductOrder(conn, order) {
  let address = {};
  try {
    address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : (order.shipping_address || {});
  } catch (error) {}
  const deliveryMethod = address.deliveryMethod === 'pickup' || address.deliveryMethod === 'offline'
    ? 'pickup'
    : (order.type === 'online' ? 'online' : 'pickup');
  const nextStatus = deliveryMethod === 'online' ? 'shipping' : 'paid';

  await conn.execute(
    `UPDATE orders SET status = ?, pay_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
    [nextStatus, order.id]
  );

  await conn.execute(
    `INSERT INTO user_notifications (user_id, title, content)
     VALUES (?, '商品购买成功', ?)`,
    [
      order.user_id,
      `您已成功支付商品订单，支付金额 ¥${(order.pay_amount / 100).toFixed(2)}。订单号: ${order.order_no}。${nextStatus === 'shipping' ? '我们会尽快为您安排发货。' : '请按门店通知到店取货。'}`
    ]
  );

  await createPendingDistributionCommission(conn, order, order.user_id);
}

const DEFAULT_DISTRIBUTION_SETTLE_DAYS = 14;
const DISTRIBUTION_MIN_WITHDRAW_AMOUNT = 5000;
const DISTRIBUTOR_LEVEL_RULES = {
  silver: { level1Rate: 0.1, level2Rate: 0.03, label: '银牌' },
  gold: { level1Rate: 0.15, level2Rate: 0.05, label: '金牌' },
  diamond: { level1Rate: 0.2, level2Rate: 0.08, label: '钻石' }
};

function getDistributorLevelRule(level) {
  return DISTRIBUTOR_LEVEL_RULES[level] || DISTRIBUTOR_LEVEL_RULES.silver;
}

async function getDistributionSettleDays() {
  const row = await get(`SELECT key_value FROM system_settings WHERE key_name = 'distribution_settle_days'`);
  const days = parseInt(row?.key_value, 10);
  if (!Number.isInteger(days) || days < 0) {
    return DEFAULT_DISTRIBUTION_SETTLE_DAYS;
  }
  return days;
}

function buildInviteCode(userId) {
  return `HJ${String(userId).padStart(4, '0')}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function ensureDistributor(userId, conn = null) {
  const executor = conn || { execute: query };
  const existing = await get(`SELECT * FROM distributors WHERE user_id = ?`, [userId]);
  if (existing) return existing;

  const user = await get(`SELECT nickname, avatar_url FROM users WHERE id = ?`, [userId]);
  if (!user) return null;

  let inviteCode = buildInviteCode(userId);
  for (let i = 0; i < 5; i += 1) {
    const duplicate = await get(`SELECT id FROM distributors WHERE invite_code = ?`, [inviteCode]);
    if (!duplicate) break;
    inviteCode = buildInviteCode(userId);
  }

  await executor.execute(
    `INSERT INTO distributors (user_id, nickname, avatar_url, level, invite_code, invite_qr_url, total_commission, available_commission, withdrawn_amount, status)
     VALUES (?, ?, ?, 'silver', ?, ?, 0, 0, 0, 'active')`,
    [userId, user.nickname || `用户${userId}`, user.avatar_url || null, inviteCode, '/static/demo/qrcode.png']
  );

  return get(`SELECT * FROM distributors WHERE user_id = ?`, [userId]);
}

async function refreshDistributorLevel(distributorId, conn = null) {
  if (!distributorId) return 'silver';
  const directOrders = await get(
    `SELECT COUNT(DISTINCT order_id) as count
     FROM distribution_orders
     WHERE distributor_id = ? AND commission_level = 1 AND status != 'refunded'`,
    [distributorId]
  );
  const count = Number(directOrders?.count || 0);
  let nextLevel = 'silver';
  if (count >= 50) {
    nextLevel = 'diamond';
  } else if (count >= 10) {
    nextLevel = 'gold';
  }

  const executor = conn || { execute: query };
  await executor.execute(`UPDATE distributors SET level = ? WHERE id = ?`, [nextLevel, distributorId]);
  return nextLevel;
}

async function settleEligibleDistributionCommissions(userId) {
  const distributor = await get(`SELECT id FROM distributors WHERE user_id = ?`, [userId]);
  if (!distributor) return 0;
  const settleDays = await getDistributionSettleDays();

  const pendingList = await query(
    `SELECT do.id, do.commission_amount
       FROM distribution_orders do
       JOIN orders o ON o.id = do.order_id
       WHERE do.distributor_id = ?
         AND do.status = 'pending'
         AND o.status = 'completed'
         AND (do.lock_until <= CURRENT_TIMESTAMP OR (do.lock_until IS NULL AND o.updated_at <= DATE_SUB(NOW(), INTERVAL ${settleDays} DAY)))`,
    [distributor.id]
  );

  if (!pendingList.length) return 0;

  const total = pendingList.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const ids = pendingList.map(item => item.id);
  const placeholders = ids.map(() => '?').join(',');

  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE distribution_orders
       SET status = 'settled', settled_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      ids
    );
    await conn.execute(
      `UPDATE distributors
       SET available_commission = available_commission + ?
       WHERE id = ?`,
      [total, distributor.id]
    );
    await conn.execute(
      `INSERT INTO user_notifications (user_id, title, content)
       VALUES (?, '佣金已结算', ?)`,
      [
        userId,
        `您有 ${(total / 100).toFixed(2)} 元推广佣金已转为可提现余额。`
      ]
    );
  });

  return total;
}

async function getDistributionSummary(userId) {
  await settleEligibleDistributionCommissions(userId);
  const settleDays = await getDistributionSettleDays();

  const distributor = await ensureDistributor(userId);
  if (!distributor) {
    return {
      isDistributor: false,
      teamCount: 0,
      teamLevel2Count: 0,
      totalInvites: 0,
      totalOrders: 0,
      totalSales: 0,
      availableCommission: 0,
      totalCommission: 0,
      withdrawnAmount: 0,
      frozenCommission: 0,
      level: 'silver',
      levelLabel: getDistributorLevelRule('silver').label,
      inviteCode: '',
      inviteQrCode: '',
      settleDays,
      minWithdrawAmount: DISTRIBUTION_MIN_WITHDRAW_AMOUNT,
      withdrawFeeRates: { wechat: 0, bank: 0.01 }
    };
  }

  const [lv1, lv2, orderStats, pendingStats] = await Promise.all([
    get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 1`, [userId]),
    get(`SELECT COUNT(*) as count FROM distribution_relationships WHERE parent_user_id = ? AND level = 2`, [userId]),
    get(
      `SELECT COUNT(DISTINCT order_id) as total_orders, COALESCE(SUM(order_amount), 0) as total_sales
       FROM distribution_orders
       WHERE distributor_id = ? AND status != 'refunded'`,
      [distributor.id]
    ),
    get(
      `SELECT COALESCE(SUM(commission_amount), 0) as frozen_commission
       FROM distribution_orders
       WHERE distributor_id = ? AND status = 'pending'`,
      [distributor.id]
    )
  ]);

  return {
    isDistributor: true,
    teamCount: Number(lv1?.count || 0),
    teamLevel2Count: Number(lv2?.count || 0),
    totalInvites: Number(lv1?.count || 0) + Number(lv2?.count || 0),
    totalOrders: Number(orderStats?.total_orders || 0),
    totalSales: Number(orderStats?.total_sales || 0),
    availableCommission: Number(distributor.available_commission || 0),
    totalCommission: Number(distributor.total_commission || 0),
    withdrawnAmount: Number(distributor.withdrawn_amount || 0),
    frozenCommission: Number(pendingStats?.frozen_commission || 0),
    level: distributor.level,
    levelLabel: getDistributorLevelRule(distributor.level).label,
    inviteCode: distributor.invite_code,
    inviteQrCode: distributor.invite_qr_url || '/static/demo/qrcode.png',
    settleDays,
    minWithdrawAmount: DISTRIBUTION_MIN_WITHDRAW_AMOUNT,
    withdrawFeeRates: { wechat: 0, bank: 0.01 }
  };
}

async function createPendingDistributionCommission(conn, order, userId) {
  const relationships = await query(
    `SELECT parent_user_id, level FROM distribution_relationships WHERE child_user_id = ? ORDER BY level ASC`,
    [userId]
  );
  if (!relationships || relationships.length === 0) return;

  const buyer = await get(`SELECT nickname, phone FROM users WHERE id = ?`, [userId]);
  const buyerName = buyer
    ? `${buyer.nickname || '微信用户'}${buyer.phone ? ` (${maskPhone(buyer.phone)})` : ''}`
    : '微信用户';

  // 1. 查找并结算一级推荐佣金
  const relL1 = relationships.find(r => r.level === 1);
  if (!relL1) return;

  const promoterL1 = await get(
    `SELECT id, level FROM distributors WHERE user_id = ?`,
    [relL1.parent_user_id]
  );
  if (!promoterL1) return;

  const orderItems = await query(
    `SELECT price, quantity, commission_rate_snapshot, is_distribution_snapshot
     FROM order_items
     WHERE order_id = ?`,
    [order.id]
  );
  const distributionItems = orderItems.filter(item => Number(item.is_distribution_snapshot || 0) === 1);
  if (distributionItems.length === 0) return;

  const itemCommissionBase = distributionItems.reduce((sum, item) => {
    const rate = Number(item.commission_rate_snapshot || 0);
    if (rate <= 0) return sum;
    return sum + Math.round(Number(item.price || 0) * Number(item.quantity || 0) * (rate / 100));
  }, 0);
  const levelRuleL1 = getDistributorLevelRule(promoterL1.level);
  const commissionL1 = itemCommissionBase > 0
    ? itemCommissionBase
    : Math.round(order.pay_amount * levelRuleL1.level1Rate);

  const existingL1 = await get(
    `SELECT id FROM distribution_orders WHERE order_id = ? AND distributor_id = ? AND commission_level = 1`,
    [order.id, promoterL1.id]
  );
  if (!existingL1 && commissionL1 > 0) {
    await conn.execute(
      `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status)
       VALUES (?, ?, ?, ?, ?, 1, 'pending')`,
      [order.id, promoterL1.id, buyerName, order.pay_amount, commissionL1]
    );
    await conn.execute(
      `UPDATE distributors SET total_commission = total_commission + ? WHERE id = ?`,
      [commissionL1, promoterL1.id]
    );
    await refreshDistributorLevel(promoterL1.id, conn);
  }

  // 2. 二级佣金默认按推广员等级比例计算
  const relL2 = relationships.find(r => r.level === 2);
  if (relL2 && commissionL1 > 0) {
    const promoterL2 = await get(
      `SELECT id, level FROM distributors WHERE user_id = ?`,
      [relL2.parent_user_id]
    );
    if (promoterL2) {
      const levelRuleL2 = getDistributorLevelRule(promoterL2.level);
      const commissionL2 = Math.round(order.pay_amount * levelRuleL2.level2Rate);

      const existingL2 = await get(
        `SELECT id FROM distribution_orders WHERE order_id = ? AND distributor_id = ? AND commission_level = 2`,
        [order.id, promoterL2.id]
      );
      if (!existingL2 && commissionL2 > 0) {
        await conn.execute(
          `INSERT INTO distribution_orders (order_id, distributor_id, buyer_name, order_amount, commission_amount, commission_level, status)
           VALUES (?, ?, ?, ?, ?, 2, 'pending')`,
          [order.id, promoterL2.id, buyerName, order.pay_amount, commissionL2]
        );
        await conn.execute(
          `UPDATE distributors SET total_commission = total_commission + ? WHERE id = ?`,
          [commissionL2, promoterL2.id]
        );
        await refreshDistributorLevel(promoterL2.id, conn);
      }
    }
  }
}

async function closeExpiredPendingOrders(userId) {
  const expiredOrders = await query(
    `SELECT * FROM orders
     WHERE user_id = ? AND type = 'product' AND status = 'pending'
       AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
    [userId]
  );
  for (const order of expiredOrders) {
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
        [order.id]
      );
      const items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      for (const item of items) {
        await conn.execute(
          `UPDATE products SET stock = stock + ?, sales_count = GREATEST(0, sales_count - ?) WHERE id = ?`,
          [item.quantity, item.quantity, item.product_id]
        );
      }
      if (order.coupon_id) {
        await conn.execute(
          `UPDATE user_coupons SET status = 'active', used_at = NULL WHERE id = ?`,
          [order.coupon_id]
        );
      }
    });
  }
}


// ----------------------------------------
// 11. WECHAT MINI PROGRAM API (v1)
// ----------------------------------------


// 1. WeChat Login
app.post('/api/v1/auth/wx-login', async (req, res) => {
  const { code, phoneCode } = req.body;
  if (!code) {
    return res.status(400).json({ code: 400, message: 'code不能为空' });
  }

  try {
    let phone = null;
    let encryptedPhone = null;
    if (phoneCode && /^\d{11}$/.test(phoneCode)) {
      phone = phoneCode;
      encryptedPhone = encryptPII(phoneCode);
    }

    const openid = `wx_openid_${code}`;
    let user = await get(`SELECT * FROM users WHERE openid = ?`, [openid]);

    if (!user) {
      const existingUserByPhone = encryptedPhone ? await get(`SELECT * FROM users WHERE phone = ?`, [encryptedPhone]) : null;
      if (existingUserByPhone) {
        await run(`UPDATE users SET openid = ? WHERE id = ?`, [openid, existingUserByPhone.id]);
        user = existingUserByPhone;
        user.openid = openid;
      } else {
        const nickname = `微信用户_${code.slice(-4)}`;
        const result = await run(
          `INSERT INTO users (openid, nickname, phone, member_level, points, total_spent) VALUES (?, ?, ?, 'normal', 0, 0)`,
          [openid, nickname, encryptedPhone]
        );

        const patientNo = await generateUniquePatientNo(async (candidate) => {
          const row = await get(`SELECT id FROM patients WHERE patient_no = ? LIMIT 1`, [candidate]);
          return Boolean(row);
        });
        await run(
          `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, source) VALUES (?, ?, ?, 'self', 1, 30, ?, 'mini_app')`,
          [patientNo, result.id, nickname, encryptedPhone]
        );

        user = await get(`SELECT * FROM users WHERE id = ?`, [result.id]);
      }
    } else {
      if (encryptedPhone && !user.phone) {
        const existingUserByPhone = await get(`SELECT * FROM users WHERE phone = ? AND id != ?`, [encryptedPhone, user.id]);
        if (!existingUserByPhone) {
          await run(`UPDATE users SET phone = ? WHERE id = ?`, [encryptedPhone, user.id]);
          await run(`UPDATE patients SET phone = ? WHERE user_id = ? AND relation = 'self'`, [encryptedPhone, user.id]);
          user.phone = encryptedPhone;
        } else {
          // Merge anonymous temporary user data into the existing manually created profile
          await transaction(async (conn) => {
            const [tempPRows] = await conn.execute(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [user.id]);
            const [realPRows] = await conn.execute(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [existingUserByPhone.id]);
            const tempPatientId = tempPRows[0]?.id;
            const realPatientId = realPRows[0]?.id;

            if (tempPatientId && realPatientId) {
              await conn.execute(`UPDATE appointments SET patient_id = ? WHERE patient_id = ?`, [realPatientId, tempPatientId]);
              await conn.execute(`UPDATE medical_records SET patient_id = ? WHERE patient_id = ?`, [realPatientId, tempPatientId]);
              await conn.execute(`UPDATE treatment_records SET patient_id = ? WHERE patient_id = ?`, [realPatientId, tempPatientId]);
              await conn.execute(`UPDATE follow_up_tasks SET patient_id = ? WHERE patient_id = ?`, [realPatientId, tempPatientId]);

              // Move any other family member patient profiles to the real user
              await conn.execute(`UPDATE patients SET user_id = ? WHERE user_id = ? AND id != ?`, [existingUserByPhone.id, user.id, tempPatientId]);

              // Delete the temporary self patient record
              await conn.execute(`DELETE FROM patients WHERE id = ?`, [tempPatientId]);
            }

            // Move other user-linked records to the real user ID
            await conn.execute(`UPDATE orders SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE user_notifications SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE treatment_timelines SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE snore_assessments SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE user_coupons SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE device_maintenance SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);
            await conn.execute(`UPDATE device_feedback SET user_id = ? WHERE user_id = ?`, [existingUserByPhone.id, user.id]);

            // Delete the temporary user
            await conn.execute(`DELETE FROM users WHERE id = ?`, [user.id]);

            // Bind openid to the existing user profile
            await conn.execute(`UPDATE users SET openid = ? WHERE id = ?`, [openid, existingUserByPhone.id]);
          });

          user = existingUserByPhone;
          user.openid = openid;
        }
      }
    }

    const token = jwt.sign(
      { id: user.id, openid: user.openid },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        access_token: token,
        refresh_token: `refresh_${crypto.randomBytes(8).toString('hex')}`,
        user: {
          id: user.id.toString(),
          nickname: user.nickname,
          avatar: user.avatar_url || '/static/demo/avatar.jpg',
          phone: decryptPII(user.phone) || '138****8888',
          memberLevel: user.member_level,
          isDistributor: !!(await get(`SELECT id FROM distributors WHERE user_id = ?`, [user.id]))
        },
        expires_in: 2592000
      }
    });
  } catch (error) {
    console.error('wx-login error:', error);
    try {
      fs.appendFileSync('./login_errors.log', `[${new Date().toISOString()}] Error: ${error.message}\nStack: ${error.stack}\nBody: ${JSON.stringify(req.body)}\n\n`);
    } catch (e) {}
    res.status(500).json({ code: 500, message: '登录失败' });
  }
});

// 2. User Profile (GET)
app.get('/api/v1/user/profile', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户未找到' });
    }
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    const distributor = await get(`SELECT id, level FROM distributors WHERE user_id = ?`, [req.user.id]);
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: patient ? patient.id.toString() : user.id.toString(),
        nickname: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        gender: patient ? patient.gender : 1,
        age: patient ? patient.age : 30,
        phone: decryptPII(user.phone) || (patient ? decryptPII(patient.phone) : '138****8888'),
        birthday: user.birthday ? formatDate(user.birthday) : '1995-01-01',
        memberLevel: user.member_level || 'normal',
        isDistributor: !!distributor,
        distributorLevel: distributor?.level || ''
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取个人资料失败' });
  }
});

// 3. User Profile (PUT)
app.put('/api/v1/user/profile', authenticateWxToken, async (req, res) => {
  const { nickname, phone, gender, age, birthday } = req.body;
  const nicknameClean = nickname ? escapeHtml(nickname) : null;
  const phoneClean = phone ? escapeHtml(phone) : null;
  const phoneEnc = phoneClean ? encryptPII(phoneClean) : null;
  const birthdayClean = birthday === '' || !birthday ? null : birthday;
  const genderClean = gender !== undefined ? gender : null;
  const ageClean = age !== undefined ? age : null;
  try {
    await run(
      `UPDATE users SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone), birthday = COALESCE(?, birthday) WHERE id = ?`,
      [nicknameClean, phoneEnc, birthdayClean, req.user.id]
    );
    await run(
      `UPDATE patients SET name = COALESCE(?, name), gender = COALESCE(?, gender), age = COALESCE(?, age), phone = COALESCE(?, phone)
       WHERE user_id = ? AND relation = 'self'`,
      [nicknameClean, genderClean, ageClean, phoneEnc, req.user.id]
    );

    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: patient ? patient.id.toString() : user.id.toString(),
        nickname: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        gender: patient ? patient.gender : 1,
        age: patient ? patient.age : 30,
        phone: decryptPII(user.phone),
        birthday: user.birthday ? formatDate(user.birthday) : null,
        memberLevel: user.member_level || 'normal'
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ code: 500, message: '更新资料失败' });
  }
});

// 3.1 Account Security (GET)
app.get('/api/v1/user/account-security', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户未找到' });
    }
    const patient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);

    // Masking helper for phone
    const phoneFull = decryptPII(user.phone) || (patient ? decryptPII(patient.phone) : '');
    let phoneMasked = '未绑定';
    if (phoneFull && phoneFull.length >= 7) {
      phoneMasked = `${phoneFull.slice(0, 3)}****${phoneFull.slice(-4)}`;
    }

    // Masking helper for real name
    const realName = patient ? patient.name : '';
    const idCard = patient ? decryptPII(patient.id_card) : '';
    let realNameMasked = '未认证';
    let realNameVerified = false;
    if (idCard && realName && realName !== '微信用户' && !realName.startsWith('微信用户_')) {
      realNameVerified = true;
      if (realName.length === 2) {
        realNameMasked = `${realName[0]}*`;
      } else if (realName.length > 2) {
        realNameMasked = `${realName[0]}*${realName.slice(-1)}`;
      } else {
        realNameMasked = realName;
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        phone: phoneMasked,
        hasPassword: false,
        lastLogin: user.updated_at || user.created_at || new Date().toISOString(),
        loginDevice: '微信小程序 (WeChat Miniprogram)',
        realNameVerified: realNameVerified,
        realName: realNameMasked
      }
    });
  } catch (error) {
    console.error('Get account security error:', error);
    res.status(500).json({ code: 500, message: '获取账号安全信息失败' });
  }
});

// Verification codes store
global.smsCodes = global.smsCodes || {};

// Send phone change verification code
app.post('/api/v1/user/send-code', authenticateWxToken, async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '请输入有效的11位手机号码' });
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  global.smsCodes[phone] = {
    code,
    expires: Date.now() + 5 * 60 * 1000
  };
  console.log(`[SMS MOCK] Sent verification code ${code} to ${phone}`);
  res.json({
    code: 0,
    message: '验证码发送成功',
    data: { code } // Return for frontend convenient entry
  });
});

// Change bound phone number
app.post('/api/v1/user/change-phone', authenticateWxToken, async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '手机号格式错误' });
  }
  const stored = global.smsCodes[phone];
  if (!stored || stored.code !== code || Date.now() > stored.expires) {
    return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
  }
  try {
    // Check if phone already bound to another user
    const encryptedPhone = encryptPII(phone);
    const existing = await get(`SELECT id FROM users WHERE phone = ? AND id != ?`, [encryptedPhone, req.user.id]);
    if (existing) {
      return res.status(400).json({ code: 400, message: '该手机号已被其他账号绑定' });
    }
    await run(`UPDATE users SET phone = ? WHERE id = ?`, [encryptedPhone, req.user.id]);
    await run(`UPDATE patients SET phone = ? WHERE user_id = ? AND relation = 'self'`, [encryptedPhone, req.user.id]);
    delete global.smsCodes[phone];
    res.json({ code: 0, message: '更换绑定手机成功' });
  } catch (error) {
    console.error('Change phone error:', error);
    res.status(500).json({ code: 500, message: '更换手机号失败，请稍后重试' });
  }
});

// Real-name verification
app.post('/api/v1/user/verify-realname', authenticateWxToken, async (req, res) => {
  const { realName, idCard } = req.body;
  if (!realName || realName.trim().length < 2) {
    return res.status(400).json({ code: 400, message: '请输入真实的姓名' });
  }
  if (!idCard || !/^\d{17}[\dXx]$/.test(idCard)) {
    return res.status(400).json({ code: 400, message: '请输入有效的18位身份证号' });
  }
  try {
    const cleanName = realName.trim();
    const cleanIdCard = idCard.trim().toUpperCase();
    const encryptedIdCard = encryptPII(cleanIdCard);

    // Check if there is a 'self' patient record, if not create one
    let selfPatient = await get(`SELECT * FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!selfPatient) {
      const patientNo = generateUniquePatientNo();
      const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
      await run(
        `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, id_card)
         VALUES (?, ?, ?, 'self', ?, 30, ?, ?)`,
        [patientNo, req.user.id, cleanName, user.gender || 1, user.phone, encryptedIdCard]
      );
    } else {
      await run(
        `UPDATE patients SET name = ?, id_card = ? WHERE user_id = ? AND relation = 'self'`,
        [cleanName, encryptedIdCard, req.user.id]
      );
    }

    // Update users table nickname as well if it is '微信用户' or empty
    const user = await get(`SELECT nickname FROM users WHERE id = ?`, [req.user.id]);
    if (!user.nickname || user.nickname === '微信用户' || user.nickname.startsWith('微信用户_')) {
      await run(`UPDATE users SET nickname = ? WHERE id = ?`, [cleanName, req.user.id]);
    }

    res.json({ code: 0, message: '实名认证成功' });
  } catch (error) {
    console.error('Verify realname error:', error);
    res.status(500).json({ code: 500, message: '实名认证失败，请稍后重试' });
  }
});

// 3.2 WeChat Client Get Notifications (GET)
app.get('/api/v1/user/notifications', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const unread = await get(
      `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );

    const formatted = list.map(n => ({
      id: n.id.toString(),
      title: n.title,
      content: n.content,
      isRead: n.is_read === 1,
      type: n.type || 'system',
      createdAt: n.created_at
    }));

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        unread: unread ? unread.count : 0
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ code: 500, message: '获取通知失败' });
  }
});

// 3.3 WeChat Client Read All Notifications (POST)
app.post('/api/v1/user/notifications/read-all', authenticateWxToken, async (req, res) => {
  try {
    await run(
      `UPDATE user_notifications SET is_read = 1 WHERE user_id = ?`,
      [req.user.id]
    );
    res.json({ code: 0, message: '已全部标记为已读' });
  } catch (error) {
    console.error('Read all notifications error:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 3.4 WeChat Client Read Single Notification (POST)
app.post('/api/v1/user/notifications/:id/read', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    await run(
      `UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    res.json({ code: 0, message: '标记已读成功' });
  } catch (error) {
    console.error('Read notification error:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// --- Sleep & Snore Assessments ---

// Static folder serving for uploaded snore audio files and medical attachments with hotlink and auth protection
app.use('/uploads', (req, res, next) => {
  const referer = req.headers['referer'] || '';
  // 1. Allow WeChat mini-program image rendering
  if (referer.startsWith('https://servicewechat.com/')) {
    return next();
  }
  // 2. Allow local admin development debugging
  if (referer.includes('localhost') || referer.includes('127.0.0.1')) {
    return next();
  }
  // 3. Fallback: Authenticate via query token or auth header for programmatic download
  const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {}
  }
  res.status(403).send('Forbidden: Direct access to clinical attachments is restricted.');
}, express.static('./uploads'));

// GET /api/v1/assessments
app.get('/api/v1/assessments', authenticateWxToken, async (req, res) => {
  try {
    const { patientId } = req.query;
    let essList, snoreList;

    if (patientId) {
      let dbPatientId = null;
      if (patientId === 'pat-self') {
        const selfPatient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
        if (selfPatient) dbPatientId = selfPatient.id;
      } else {
        dbPatientId = Number(patientId);
      }
      essList = await query(`SELECT * FROM ess_assessments WHERE user_id = ? AND patient_id = ?`, [req.user.id, dbPatientId]);
      snoreList = await query(`SELECT * FROM snore_assessments WHERE user_id = ? AND patient_id = ?`, [req.user.id, dbPatientId]);
    } else {
      essList = await query(`SELECT * FROM ess_assessments WHERE user_id = ?`, [req.user.id]);
      snoreList = await query(`SELECT * FROM snore_assessments WHERE user_id = ?`, [req.user.id]);
    }

    const formattedEss = essList.map(item => {
      const score = item.total_score;
      let advice = '暂无建议';
      if (score <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
      else if (score <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
      else if (score <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
      else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

      return {
        id: 'asmt-' + item.id,
        userId: item.user_id.toString(),
        patientId: item.patient_id ? item.patient_id.toString() : 'pat-self',
        type: 'ess',
        essAnswers: typeof item.answers === 'string' ? JSON.parse(item.answers) : (item.answers || []),
        essScore: score,
        essLevel: item.risk_level,
        recommendation: advice,
        createdAt: item.created_at
      };
    });

    const formattedSnore = snoreList.map(item => {
      let advice = '暂无建议';
      if (item.risk_level === 'normal' || item.risk_level === 'low') advice = '您的鼾声分析在正常范围内，睡眠呼吸暂停风险较低。';
      else if (item.risk_level === 'mild') advice = '您的鼾声分析显示有轻度风险，可能存在间歇性打鼾，建议侧卧睡眠并注意观察。';
      else if (item.risk_level === 'moderate') advice = '您的鼾声分析显示中度风险，有明显的呼吸暂停征兆。建议预约线下门诊进行睡眠呼吸阻鼾器适配评估。';
      else advice = '您的鼾声分析显示重度风险，Apnea事件频发。强烈建议尽早前往诊所进行多导睡眠监测（PSG）或佩戴舌型阻鼾器。';

      return {
        id: 'snore-' + item.id,
        userId: item.user_id.toString(),
        patientId: item.patient_id ? item.patient_id.toString() : 'pat-self',
        type: 'ai_snore',
        snoreRecordUrl: item.file_url,
        snoreAnalysis: {
          duration: item.duration,
          avgDecibel: item.avg_decibel,
          peakDecibel: item.peak_decibel,
          snoreRate: item.snore_rate,
          apneaEvents: item.apnea_events,
          riskLevel: item.risk_level
        },
        recommendation: advice,
        createdAt: item.created_at
      };
    });

    const combined = [...formattedEss, ...formattedSnore].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      code: 0,
      message: 'success',
      data: combined
    });
  } catch (error) {
    console.error('getAssessments error:', error);
    res.status(500).json({ code: 500, message: '获取评估记录失败' });
  }
});

// GET /api/v1/assessments/ess-questions
app.get('/api/v1/assessments/ess-questions', authenticateWxToken, (req, res) => {
  const questions = [
    { id: 1, situation: "坐着看书或读报时", emoji: "📖", hint: "请回想您近期的日常状态" },
    { id: 2, situation: "看电视时", emoji: "📺", hint: "放松状态下是否容易睡着" },
    { id: 3, situation: "在公共场所坐着不动（如在剧院或开会）", emoji: "🏛️", hint: "在安静的公共场合" },
    { id: 4, situation: "作为乘客乘坐汽车1小时以上", emoji: "🚗", hint: "作为乘客而非驾驶员" },
    { id: 5, situation: "下午躺下休息时", emoji: "🛋️", hint: "环境允许时是否能保持清醒" },
    { id: 6, situation: "坐着与人交谈时", emoji: "💬", hint: "与他人面对面聊天" },
    { id: 7, situation: "午餐后安静坐着（未饮酒）", emoji: "🍽️", hint: "饭后不喝酒的情况下" },
    { id: 8, situation: "在车中，因交通堵塞停车几分钟", emoji: "🚦", hint: "作为驾驶员短暂停车时" }
  ];
  res.json({
    code: 0,
    message: 'success',
    data: questions
  });
});

// POST /api/v1/assessments/ess
app.post('/api/v1/assessments/ess', authenticateWxToken, async (req, res) => {
  const { answers, patientId } = req.body;
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ code: 400, message: '答案不能为空且必须是数组' });
  }

  try {
    const totalScore = answers.reduce((acc, val) => acc + val, 0);
    let riskLevel = 'normal';
    if (totalScore <= 5) riskLevel = 'normal';
    else if (totalScore <= 10) riskLevel = 'mild';
    else if (totalScore <= 15) riskLevel = 'moderate';
    else riskLevel = 'severe';

    let dbPatientId = null;
    if (patientId && patientId !== 'pat-self') {
      dbPatientId = Number(patientId);
    } else {
      const selfPatient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
      if (selfPatient) dbPatientId = selfPatient.id;
    }

    const result = await run(
      `INSERT INTO ess_assessments (user_id, patient_id, total_score, risk_level, answers) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, dbPatientId, totalScore, riskLevel, JSON.stringify(answers)]
    );

    let advice = '';
    if (totalScore <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
    else if (totalScore <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
    else if (totalScore <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
    else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: 'asmt-' + result.id,
        userId: req.user.id.toString(),
        patientId: patientId || 'pat-self',
        type: 'ess',
        essAnswers: answers,
        essScore: totalScore,
        essLevel: riskLevel,
        recommendation: advice,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('submitESS error:', error);
    res.status(500).json({ code: 500, message: '提交ESS评估失败' });
  }
});

// POST /api/v1/assessments/snore
app.post('/api/v1/assessments/snore', authenticateWxToken, async (req, res) => {
  const { duration, fileData, fileName, client_side_analysis, analysis_result, patientId } = req.body;
  const durationSeconds = parseInt(duration, 10);
  if (!durationSeconds || durationSeconds < 5) {
    return res.status(400).json({ code: 400, message: '时长不能为空' });
  }

  let dbPatientId = null;
  try {
    if (patientId && patientId !== 'pat-self') {
      dbPatientId = Number(patientId);
    } else {
      const selfPatient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
      if (selfPatient) dbPatientId = selfPatient.id;
    }
  } catch (e) {
    console.error(e);
  }

  if (client_side_analysis) {
    try {
      const { avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel } = analysis_result || {};
      const result = await run(
        `INSERT INTO snore_assessments (user_id, patient_id, file_url, duration, avg_decibel, peak_decibel, snore_rate, apnea_events, risk_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          dbPatientId,
          '/static/demo/snore-demo.mp4',
          durationSeconds,
          avgDecibel || 40,
          peakDecibel || 60,
          snoreRate || 10,
          apneaEvents || 0,
          riskLevel || 'normal'
        ]
      );

      let advice = '';
      if (riskLevel === 'normal' || riskLevel === 'low') advice = '本次录音筛查风险较低。结果仅供健康筛查参考，不能替代医生诊断。';
      else if (riskLevel === 'mild') advice = '本次录音筛查提示轻度风险，建议侧卧睡眠并持续观察；如伴随白天嗜睡，建议预约医生评估。';
      else if (riskLevel === 'moderate') advice = '本次录音筛查提示中度风险，建议预约线下门诊，由医生结合病史 and 必要检查进一步判断。';
      else advice = '本次录音筛查提示较高风险，建议尽快预约医生进行睡眠呼吸暂停相关检查。结果不能替代正式医学诊断。';

      return res.json({
        code: 0,
        message: 'success',
        data: {
          id: 'snore-' + result.id,
          userId: req.user.id.toString(),
          patientId: dbPatientId ? dbPatientId.toString() : 'pat-self',
          type: 'ai_snore',
          snoreRecordUrl: '/static/demo/snore-demo.mp4',
          snoreAnalysis: {
            duration: durationSeconds,
            avgDecibel: avgDecibel || 40,
            peakDecibel: peakDecibel || 60,
            snoreRate: snoreRate || 10,
            apneaEvents: apneaEvents || 0,
            riskLevel: riskLevel || 'normal',
            advice
          },
          riskLevel: riskLevel || 'normal',
          createdAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Client-side snore save error:', err);
      return res.status(500).json({ code: 500, message: '保存离线分析结果失败' });
    }
  }

  if (!fileData) {
    return res.status(400).json({ code: 400, message: '请上传有效的鼾声录音文件' });
  }

  try {
    const buffer = Buffer.from(fileData, 'base64');
    if (buffer.length < 1024) {
      return res.status(400).json({ code: 400, message: '录音文件过小，请重新录制' });
    }
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ code: 400, message: '录音文件过大，请缩短录制时长后重试' });
    }

    if (!fs.existsSync('./uploads/snore')) {
      fs.mkdirSync('./uploads/snore', { recursive: true });
    }
    const baseName = path.basename(fileName || 'snore.m4a');
    const cleanFileName = baseName.replace(/[^a-zA-Z0-9_.-]/g, '');
    const safeFileName = `${Date.now()}_${cleanFileName || 'snore.m4a'}`;
    fs.writeFileSync(`./uploads/snore/${safeFileName}`, buffer);
    const fileUrl = `/uploads/snore/${safeFileName}`;

    const sampleSize = Math.min(buffer.length, 240000);
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    let energyTotal = 0;
    let peakEnergy = 0;
    let activeCount = 0;
    for (let i = 0; i < buffer.length; i += step) {
      const energy = Math.abs(buffer[i] - 128);
      energyTotal += energy;
      if (energy > peakEnergy) peakEnergy = energy;
      if (energy > 28) activeCount++;
    }
    const sampledCount = Math.ceil(buffer.length / step);
    const avgEnergy = energyTotal / sampledCount;
    const snoreRate = Math.min(95, Math.max(0, Math.round((activeCount / sampledCount) * 100)));
    const avgDecibel = Math.min(85, Math.max(30, Math.round(35 + avgEnergy * 0.45)));
    const peakDecibel = Math.min(100, Math.max(avgDecibel, Math.round(45 + peakEnergy * 0.42)));
    const lowEnergyRatio = Math.max(0, 1 - snoreRate / 100);
    const apneaEvents = Math.max(0, Math.round((durationSeconds / 3600) * (lowEnergyRatio * 18 + Math.max(0, peakDecibel - 70) / 3)));
    const qualityScore = Math.min(100, Math.max(35, Math.round(100 - Math.abs(avgDecibel - 58) * 1.2 - (durationSeconds < 30 ? 20 : 0))));

    let riskLevel = 'low';
    if (apneaEvents < 5) riskLevel = 'normal';
    else if (apneaEvents < 15) riskLevel = 'mild';
    else if (apneaEvents < 30) riskLevel = 'moderate';
    else riskLevel = 'severe';

    const result = await run(
      `INSERT INTO snore_assessments (user_id, patient_id, file_url, duration, avg_decibel, peak_decibel, snore_rate, apnea_events, risk_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, dbPatientId, fileUrl, durationSeconds, avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel]
    );

    let advice = '';
    if (riskLevel === 'normal' || riskLevel === 'low') advice = '本次录音筛查风险较低。结果仅供健康筛查参考，不能替代医生诊断。';
    else if (riskLevel === 'mild') advice = '本次录音筛查提示轻度风险，建议侧卧睡眠并持续观察；如伴随白天嗜睡，建议预约医生评估。';
    else if (riskLevel === 'moderate') advice = '本次录音筛查提示中度风险，建议预约线下门诊，由医生结合病史和必要检查进一步判断。';
    else advice = '本次录音筛查提示较高风险，建议尽快预约医生进行睡眠呼吸暂停相关检查。结果不能替代正式医学诊断。';

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: 'snore-' + result.id,
        userId: req.user.id.toString(),
        patientId: dbPatientId ? dbPatientId.toString() : 'pat-self',
        type: 'ai_snore',
        snoreRecordUrl: fileUrl,
        snoreAnalysis: {
          duration: durationSeconds,
          avgDecibel,
          peakDecibel,
          snoreRate,
          apneaEvents,
          qualityScore,
          riskLevel
        },
        recommendation: advice,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('submitSnore error:', error);
    res.status(500).json({ code: 500, message: '提交鼾声录音失败' });
  }
});

// GET /api/v1/assessments/snore-analysis/:id
app.get('/api/v1/assessments/snore-analysis/:id', authenticateWxToken, async (req, res) => {
  const paramId = req.params.id;
  try {
    if (paramId.startsWith('snore-')) {
      const realId = parseInt(paramId.replace('snore-', ''), 10);
      const item = await get(`SELECT * FROM snore_assessments WHERE id = ?`, [realId]);
      if (!item) {
        return res.status(404).json({ code: 404, message: '评估记录不存在' });
      }

      let advice = '';
      if (item.risk_level === 'normal' || item.risk_level === 'low') advice = '您的鼾声分析在正常范围内，睡眠呼吸暂停风险较低。';
      else if (item.risk_level === 'mild') advice = '您的鼾声分析显示有轻度风险，可能存在间歇性打鼾，建议侧卧睡眠并注意观察。';
      else if (item.risk_level === 'moderate') advice = '您的鼾声分析显示中度风险，有明显的呼吸暂停征兆。建议预约线下门诊进行睡眠呼吸阻鼾器适配评估。';
      else advice = '您的鼾声分析显示重度风险，Apnea事件频发。强烈建议尽早前往诊所进行多导睡眠监测（PSG）或佩戴舌型阻鼾器。';

      return res.json({
        code: 0,
        message: 'success',
        data: {
          id: 'snore-' + item.id,
          userId: item.user_id.toString(),
          patientId: 'pat-self',
          type: 'ai_snore',
          snoreRecordUrl: item.file_url,
          snoreAnalysis: {
            duration: item.duration,
            avgDecibel: item.avg_decibel,
            peakDecibel: item.peak_decibel,
            snoreRate: item.snore_rate,
            apneaEvents: item.apnea_events,
            riskLevel: item.risk_level
          },
          recommendation: advice,
          createdAt: item.created_at
        }
      });
    } else if (paramId.startsWith('asmt-')) {
      const realId = parseInt(paramId.replace('asmt-', ''), 10);
      const item = await get(`SELECT * FROM ess_assessments WHERE id = ?`, [realId]);
      if (!item) {
        return res.status(404).json({ code: 404, message: '评估记录不存在' });
      }

      let advice = '';
      const score = item.total_score;
      if (score <= 5) advice = '您的白天嗜睡水平正常，请继续保持良好的睡眠习惯。';
      else if (score <= 10) advice = '您有轻度白天嗜睡，建议合理安排作息，避免熬夜。';
      else if (score <= 15) advice = '您有中度白天嗜睡，建议改善睡眠环境，必要时进行睡眠呼吸监测。';
      else advice = '您有重度白天嗜睡，可能存在严重的睡眠呼吸暂停。建议立即预约医生进行线下排查。';

      return res.json({
        code: 0,
        message: 'success',
        data: {
          id: 'asmt-' + item.id,
          userId: item.user_id.toString(),
          patientId: 'pat-self',
          type: 'ess',
          essAnswers: typeof item.answers === 'string' ? JSON.parse(item.answers) : (item.answers || []),
          essScore: score,
          essLevel: item.risk_level,
          recommendation: advice,
          createdAt: item.created_at
        }
      });
    }

    res.status(400).json({ code: 400, message: '无效的评估ID' });
  } catch (error) {
    console.error('getSnoreAnalysis error:', error);
    res.status(500).json({ code: 500, message: '获取评估详情失败' });
  }
});

// --- Community Forum Endpoints ---

// GET /api/v1/community/posts
app.get('/api/v1/community/posts', async (req, res) => {
  try {
    const list = await query(
      `SELECT p.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.status = 'approved'
       ORDER BY p.is_top DESC, p.created_at DESC`
    );

    const formatted = list.map(p => ({
      id: p.id,
      author: p.author_name || '普通患者',
      avatar: p.author_avatar || '/static/demo/avatar.jpg',
      role: p.user_role,
      roleLabel: p.user_role === 'doctor' ? '专家医生' : p.user_role === 'expert' ? '睡眠专家' : '鼾友',
      title: p.title,
      content: p.content,
      coverUrl: p.cover_url || '',
      tags: (() => {
        const val = p.tags;
        if (!val) return [];
        if (typeof val !== 'string') return Array.isArray(val) ? val : [];
        const trimmed = val.trim();
        if (trimmed.startsWith('[')) {
          try { return JSON.parse(trimmed); } catch (e) {}
        }
        return trimmed.split(',').map(t => t.trim()).filter(Boolean);
      })(),
      likes: p.likes_count,
      comments: p.comments_count,
      isTop: p.is_top === 1,
      createdAt: p.created_at,
      isLiked: false
    }));

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    console.error('getCommunityPosts error:', error);
    res.status(500).json({ code: 500, message: '获取帖子列表失败' });
  }
});

// GET /api/v1/community/posts/:id
app.get('/api/v1/community/posts/:id', async (req, res) => {
  const postId = req.params.id;
  try {
    const post = await get(
      `SELECT p.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.status = 'approved'`,
      [postId]
    );

    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在或未通过审核' });
    }

    const comments = await query(
      `SELECT c.*, u.nickname as author_name, u.avatar_url as author_avatar
       FROM post_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ? AND c.status = 'approved'
       ORDER BY c.created_at ASC`,
      [postId]
    );

    const formattedComments = comments.map(c => ({
      id: c.id,
      author: c.author_name || '普通患者',
      avatar: c.author_avatar || '/static/demo/avatar.jpg',
      content: c.content,
      likes: c.likes_count,
      createdAt: c.created_at
    }));

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: post.id,
        author: post.author_name || '普通患者',
        avatar: post.author_avatar || '/static/demo/avatar.jpg',
        role: post.user_role,
        roleLabel: post.user_role === 'doctor' ? '专家医生' : post.user_role === 'expert' ? '睡眠专家' : '鼾友',
        title: post.title,
        content: post.content,
        coverUrl: post.cover_url || '',
        tags: (() => {
          const val = post.tags;
          if (!val) return [];
          if (typeof val !== 'string') return Array.isArray(val) ? val : [];
          const trimmed = val.trim();
          if (trimmed.startsWith('[')) {
            try { return JSON.parse(trimmed); } catch (e) {}
          }
          return trimmed.split(',').map(t => t.trim()).filter(Boolean);
        })(),
        likes: post.likes_count,
        commentsCount: post.comments_count,
        isTop: post.is_top === 1,
        createdAt: post.created_at,
        isLiked: false,
        comments: formattedComments
      }
    });
  } catch (error) {
    console.error('getCommunityPostDetail error:', error);
    res.status(500).json({ code: 500, message: '获取帖子详情失败' });
  }
});

// POST /api/v1/community/posts/:id/report
app.post('/api/v1/community/posts/:id/report', authenticateWxToken, async (req, res) => {
  const postId = req.params.id;
  const reason = escapeHtml(req.body.reason || '');
  if (!reason) {
    return res.status(400).json({ code: 400, message: '请选择举报原因' });
  }

  try {
    const post = await get(`SELECT id FROM community_posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ code: 404, message: '帖子不存在' });
    }
    const existing = await get(
      `SELECT id FROM community_reports WHERE post_id = ? AND user_id = ? AND status = 'pending'`,
      [postId, req.user.id]
    );
    if (existing) {
      return res.json({ code: 0, message: '您已提交过举报，平台会尽快处理' });
    }
    await run(
      `INSERT INTO community_reports (post_id, user_id, reason, status) VALUES (?, ?, ?, 'pending')`,
      [postId, req.user.id, reason]
    );
    res.json({ code: 0, message: '举报已提交' });
  } catch (error) {
    console.error('reportCommunityPost error:', error);
    res.status(500).json({ code: 500, message: '提交举报失败' });
  }
});

// POST /api/v1/community/posts
app.post('/api/v1/community/posts', authenticateWxToken, async (req, res) => {
  const { title, content, tags } = req.body;
  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '标题和内容不能为空' });
  }

  const titleClean = escapeHtml(title);
  const contentClean = escapeHtml(content);
  const tagsClean = Array.isArray(tags) ? tags.map(t => typeof t === 'string' ? escapeHtml(t) : t) : [];

  try {
    if (checkSensitiveWords(title) || checkSensitiveWords(content)) {
      return res.status(400).json({ code: 400, message: '您的内容中包含违规字眼（广告/疗效等），已被系统拦截' });
    }
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    let role = 'patient';
    if (user.role === 'doctor' || user.role === 'admin') {
      role = 'doctor';
    }

    const status = 'approved';

    const result = await run(
      `INSERT INTO community_posts (user_id, user_role, title, content, tags, likes_count, comments_count, is_top, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      [req.user.id, role, titleClean, contentClean, JSON.stringify(tagsClean), status]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id,
        author: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        role,
        roleLabel: role === 'doctor' ? '专家医生' : '鼾友',
        title: titleClean,
        content: contentClean,
        tags: tagsClean,
        likes: 0,
        comments: 0,
        isTop: false,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('createPost error:', error);
    res.status(500).json({ code: 500, message: '发布帖子失败' });
  }
});

// POST /api/v1/community/posts/:id/like
app.post('/api/v1/community/posts/:id/like', authenticateWxToken, async (req, res) => {
  const postId = req.params.id;
  const { isLiked } = req.body;
  try {
    const change = isLiked ? 1 : -1;
    await run(
      `UPDATE community_posts SET likes_count = GREATEST(0, likes_count + ?) WHERE id = ?`,
      [change, postId]
    );
    res.json({ code: 0, message: 'success' });
  } catch (error) {
    console.error('likePost error:', error);
    res.status(500).json({ code: 500, message: '点赞失败' });
  }
});

// POST /api/v1/community/posts/:id/comment
app.post('/api/v1/community/posts/:id/comment', authenticateWxToken, async (req, res) => {
  const postId = req.params.id;
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ code: 400, message: '评论内容不能为空' });
  }

  const contentClean = escapeHtml(content);

  try {
    if (checkSensitiveWords(content)) {
      return res.status(400).json({ code: 400, message: '评论中包含敏感或违规内容，已被系统拦截' });
    }
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const result = await run(
      `INSERT INTO post_comments (post_id, user_id, content, likes_count, status) VALUES (?, ?, ?, 0, 'approved')`,
      [postId, req.user.id, contentClean]
    );

    await run(
      `UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?`,
      [postId]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id,
        author: user.nickname,
        avatar: user.avatar_url || '/static/demo/avatar.jpg',
        content: contentClean,
        likes: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('commentPost error:', error);
    res.status(500).json({ code: 500, message: '评论失败' });
  }
});


app.get('/api/v1/user/member-info', authenticateWxToken, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    let points = user.points || 0;

    // Check if the user is real-name verified (has self patient id_card)
    const selfPatient = await get(`SELECT id_card FROM patients WHERE user_id = ? AND relation = 'self' LIMIT 1`, [req.user.id]);
    const hasRealname = selfPatient && selfPatient.id_card ? true : false;

    if (points === 0 && hasRealname) {
      const claimed = await get(`SELECT id FROM points_logs WHERE user_id = ? AND type = 'welcome_gift' LIMIT 1`, [req.user.id]);
      if (!claimed) {
        points = 2000;
        await transaction(async (conn) => {
          await conn.execute(`UPDATE users SET points = 2000 WHERE id = ?`, [req.user.id]);
          await conn.execute(
            `INSERT INTO points_logs (user_id, points, type, description)
             VALUES (?, 2000, 'welcome_gift', '实名认证专享体验积分包')`,
            [req.user.id]
          );
        });
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        memberLevel: user.member_level || 'normal',
        currentLevel: user.member_level || 'normal',
        points: points,
        totalSpent: user.total_spent || 0
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取会员信息失败' });
  }
});

// 5. Family Members (GET)
app.get('/api/v1/user/family-members', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(`SELECT * FROM patients WHERE user_id = ?`, [req.user.id]);
    const formatted = list.map(p => {
      const decIdCard = decryptPII(p.id_card) || '';
      const decPhone = decryptPII(p.phone) || '';
      // Masking idCard for security
      let maskedIdCard = '';
      if (decIdCard && decIdCard.length === 18) {
        maskedIdCard = `${decIdCard.slice(0, 3)}***********${decIdCard.slice(-4)}`;
      }
      return {
        id: p.id.toString(),
        name: p.name,
        relation: p.relation,
        gender: p.gender,
        age: p.age,
        phone: decPhone,
        hasSnore: p.has_snore === 1,
        idCard: maskedIdCard,
        cardNo: p.card_no || ''
      };
    });
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取家庭成员失败' });
  }
});

// 6. Family Members (POST)
app.post('/api/v1/user/family-members', authenticateWxToken, async (req, res) => {
  const { name, relation, gender, age, phone, idCard, cardNo } = req.body;
  if (!name) {
    return res.status(400).json({ code: 400, message: '姓名不能为空' });
  }
  const ageVal = age === undefined || age === null || age === '' ? null : parseInt(age, 10);
  if (ageVal !== null && (!Number.isInteger(ageVal) || ageVal < 1 || ageVal > 120)) {
    return res.status(400).json({ code: 400, message: '年龄必须在1至120之间' });
  }
  if (phone && !/^1[3-9]\d{9}$/.test(String(phone))) {
    return res.status(400).json({ code: 400, message: '手机号格式不正确' });
  }
  if (idCard && !/^\d{17}[\dXx]$/.test(String(idCard))) {
    return res.status(400).json({ code: 400, message: '身份证格式不正确' });
  }

  const nameClean = escapeHtml(name);
  const relationClean = relation ? escapeHtml(relation) : 'other';
  const phoneClean = phone ? escapeHtml(phone) : null;
  const idCardClean = idCard ? escapeHtml(idCard).toUpperCase() : null;
  const cardNoClean = cardNo ? escapeHtml(cardNo) : null;

  const phoneEnc = phoneClean ? encryptPII(phoneClean) : null;
  const idCardEnc = idCardClean ? encryptPII(idCardClean) : null;

  try {
    const genderVal = gender === '男' || gender === 1 || gender === '1' ? 1 : gender === '女' || gender === 2 || gender === '2' ? 2 : 0;
    const patientNo = await generateUniquePatientNo(async (candidate) => {
      const row = await get(`SELECT id FROM patients WHERE patient_no = ? LIMIT 1`, [candidate]);
      return Boolean(row);
    });
    const result = await run(
      `INSERT INTO patients (patient_no, user_id, name, relation, gender, age, phone, id_card, card_no, source, has_snore)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'mini_app', 0)`,
      [patientNo, req.user.id, nameClean, relationClean, genderVal, ageVal, phoneEnc, idCardEnc, cardNoClean]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id.toString(),
        name: nameClean,
        relation: relationClean,
        gender: genderVal,
        age: ageVal,
        phone: phoneClean,
        idCard: idCardClean ? `${idCardClean.slice(0, 3)}***********${idCardClean.slice(-4)}` : '',
        cardNo: cardNoClean,
        hasSnore: false
      }
    });
  } catch (error) {
    console.error('Add family member error:', error);
    res.status(500).json({ code: 500, message: '添加家庭成员失败' });
  }
});

// 7. Family Member (DELETE)
app.delete('/api/v1/user/family-members/:id', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await get(`SELECT * FROM patients WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '成员不存在' });
    }
    if (patient.relation === 'self') {
      return res.status(400).json({ code: 400, message: '不能删除本人建档' });
    }
    await run(`DELETE FROM patients WHERE id = ?`, [id]);
    res.json({ code: 0, message: 'success', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

// 8. Stores (GET)
app.get('/api/v1/stores', async (req, res) => {
  try {
    const list = await query(`SELECT * FROM stores WHERE status IN ('open', 'prepare') ORDER BY id ASC`);
    const storeIds = list.map(s => s.id);

    let allFeatures = [];
    let allDocCounts = [];
    let allHours = [];

    if (storeIds.length > 0) {
      const placeholders = storeIds.map(() => '?').join(',');
      allFeatures = await query(`SELECT store_id, feature FROM store_features WHERE store_id IN (${placeholders})`, storeIds);
      allDocCounts = await query(`SELECT store_id, COUNT(*) as count FROM doctor_store_mapping WHERE store_id IN (${placeholders}) GROUP BY store_id`, storeIds);
      allHours = await query(`SELECT store_id, open_time, close_time FROM store_hours WHERE store_id IN (${placeholders})`, storeIds);
    }

    const featuresMap = {};
    allFeatures.forEach(f => {
      if (!featuresMap[f.store_id]) featuresMap[f.store_id] = [];
      featuresMap[f.store_id].push(f.feature);
    });

    const docCountsMap = {};
    allDocCounts.forEach(d => {
      docCountsMap[d.store_id] = d.count;
    });

    const hoursMap = {};
    allHours.forEach(h => {
      if (!hoursMap[h.store_id]) hoursMap[h.store_id] = [];
      hoursMap[h.store_id].push(h);
    });

    const formatted = [];
    for (const store of list) {
      const features = featuresMap[store.id] || [];
      const doctorCount = docCountsMap[store.id] || 0;
      const hours = hoursMap[store.id] || [];

      let businessHours = '';
      if (hours.length > 0) {
        businessHours = hours.map(h => {
          const open = h.open_time.slice(0, 5);
          const close = h.close_time.slice(0, 5);
          return `${open}-${close}`;
        }).join(' ');
      } else {
        const formatTime = (t) => {
          if (!t) return '';
          const parts = t.split(':');
          return `${parts[0]}:${parts[1]}`;
        };
        businessHours = `${formatTime(store.open_time)}-${formatTime(store.close_time)}`;
      }

      const isOpen = checkStoreIsOpen(store.status, hours, store.open_time, store.close_time);

      formatted.push({
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        city: store.city,
        district: store.district,
        latitude: store.latitude,
        longitude: store.longitude,
        openTime: store.open_time,
        closeTime: store.close_time,
        status: store.status,
        isOpen,
        hasParking: store.has_parking === 1,
        features: features,
        tags: features,
        doctorCount,
        businessHours
      });
    }
    res.json({ code: 0, message: 'success', data: formatted });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取门店列表失败' });
  }
});

// 9. Doctors (GET)
app.get('/api/v1/doctors', async (req, res) => {
  const { storeId, latitude, longitude } = req.query;
  try {
    let list;
    if (storeId) {
      list = await query(
        `SELECT d.* FROM doctors d
         JOIN doctor_store_mapping m ON d.id = m.doctor_id
         WHERE m.store_id = ? AND d.status = 1`,
        [storeId]
      );
    } else {
      let userId = null;
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded && decoded.id) {
            userId = decoded.id;
          }
        } catch (err) {
          // ignore
        }
      }

      // Get all active/on-duty doctors
      const allActiveDoctors = await query(`SELECT * FROM doctors WHERE status = 1`);

      if (allActiveDoctors.length === 0) {
        list = [];
      } else {
        const activeDoctorIds = allActiveDoctors.map(d => d.id);
        const placeholders = activeDoctorIds.map(() => '?').join(',');

        // Load global evaluation stats to calculate Bayesian Average
        const allEvalStatsGlobal = await query(
          `SELECT doctor_id, COUNT(*) as count, AVG(rating) as avg_rating
           FROM appointment_evaluations
           WHERE doctor_id IN (${placeholders})
           GROUP BY doctor_id`,
          activeDoctorIds
        );

        const evalStatsMapGlobal = {};
        allEvalStatsGlobal.forEach(e => {
          evalStatsMapGlobal[e.doctor_id] = { count: e.count, avg_rating: e.avg_rating };
        });

        // Compute global metrics for Bayesian Average
        let totalRatingSum = 0;
        let doctorsWithReviewsCount = 0;
        let totalReviewsCount = 0;
        allActiveDoctors.forEach(d => {
          const stats = evalStatsMapGlobal[d.id];
          if (stats && stats.count > 0) {
            totalRatingSum += Number(stats.avg_rating);
            totalReviewsCount += stats.count;
            doctorsWithReviewsCount++;
          }
        });

        const globalAvgRating = doctorsWithReviewsCount > 0 ? (totalRatingSum / doctorsWithReviewsCount) : 5.0;
        const globalAvgReviews = doctorsWithReviewsCount > 0 ? (totalReviewsCount / doctorsWithReviewsCount) : 1.0;

        // Load doctor store mappings to compute distance scoring
        const allMappingsGlobal = await query(
          `SELECT doctor_id, store_id FROM doctor_store_mapping WHERE doctor_id IN (${placeholders})`,
          activeDoctorIds
        );

        const doctorStoreMapGlobal = {};
        allMappingsGlobal.forEach(m => {
          if (!doctorStoreMapGlobal[m.doctor_id]) {
            doctorStoreMapGlobal[m.doctor_id] = [];
          }
          doctorStoreMapGlobal[m.doctor_id].push(m.store_id);
        });

        // Determine closest store
        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);
        let closestStoreId = null;

        if (!isNaN(userLat) && !isNaN(userLng)) {
          const stores = await query(`SELECT id, latitude, longitude FROM stores WHERE status = 'open'`);
          let minDistance = Infinity;

          const getDistance = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Radius of Earth in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a =
              Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
          };

          stores.forEach(store => {
            const storeLat = parseFloat(store.latitude);
            const storeLng = parseFloat(store.longitude);
            if (!isNaN(storeLat) && !isNaN(storeLng)) {
              const distance = getDistance(userLat, userLng, storeLat, storeLng);
              if (distance < minDistance) {
                minDistance = distance;
                closestStoreId = store.id;
              }
            }
          });
        }

        // Determine average exposure count across all active doctors
        let totalExposures = 0;
        allActiveDoctors.forEach(d => {
          totalExposures += (d.exposure_count || 0);
        });
        const avgExposure = allActiveDoctors.length > 0 ? (totalExposures / allActiveDoctors.length) : 0;

        // Pre-calculate scoring properties on all active doctors
        allActiveDoctors.forEach(d => {
          const stats = evalStatsMapGlobal[d.id] || { count: 0, avg_rating: null };
          const R = stats.avg_rating !== null && stats.avg_rating !== undefined ? Number(stats.avg_rating) : 5.0;
          const v = stats.count || 0;

          // 1. Bayesian Rating
          d.adjustedRating = (globalAvgReviews * globalAvgRating + R * v) / (globalAvgReviews + v);

          // 2. Distance Score
          const storeIds = doctorStoreMapGlobal[d.id] || [];
          if (closestStoreId && storeIds.includes(closestStoreId)) {
            d.distanceScore = 10;
          } else {
            d.distanceScore = 5;
          }

          // 3. Exposure Modifier
          const expCount = d.exposure_count || 0;
          d.exposureMultiplier = expCount < avgExposure ? 1.5 : 0.8;
        });

        // Seedable PRNG for stability (session or daily seed)
        const todayStr = new Date().toISOString().slice(0, 10);
        const seedStr = (userId ? `user_${userId}_` : "anon_") + todayStr;

        // Seedable PRNG function (Mulberry32)
        const createSeededRandom = (seedString) => {
          let h = 1779033703 ^ seedString.length;
          for (let i = 0; i < seedString.length; i++) {
            h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
            h = h << 13 | h >>> 19;
          }
          let seed = (h ^ h >>> 16) >>> 0;
          return () => {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
          };
        };
        const random = createSeededRandom(seedStr);

        // Helper function for weighted random selection from a pool
        const weightedRandomSelect = (pool, weightFn, selectedSet) => {
          const candidates = pool.filter(d => !selectedSet.has(d.id));
          if (candidates.length === 0) return null;

          let totalWeight = 0;
          const weights = candidates.map(c => {
            const w = Math.max(0, weightFn(c));
            totalWeight += w;
            return w;
          });

          if (totalWeight <= 0) {
            const idx = Math.floor(random() * candidates.length);
            return candidates[idx];
          }

          let r = random() * totalWeight;
          for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0) {
              return candidates[i];
            }
          }
          return candidates[candidates.length - 1];
        };

        const selectedSet = new Set();
        const recommendedList = [];

        // SLOT 1: 口碑高分推荐
        const slot1Doc = weightedRandomSelect(
          allActiveDoctors,
          d => d.adjustedRating * d.exposureMultiplier,
          selectedSet
        );
        if (slot1Doc) {
          selectedSet.add(slot1Doc.id);
          recommendedList.push(slot1Doc);
        }

        // SLOT 2: 附近便捷就诊
        const slot2Doc = weightedRandomSelect(
          allActiveDoctors,
          d => d.distanceScore * d.exposureMultiplier,
          selectedSet
        );
        if (slot2Doc) {
          selectedSet.add(slot2Doc.id);
          recommendedList.push(slot2Doc);
        }

        // SLOT 3: 新晋之星/公平轮播
        const sortedExposures = allActiveDoctors.map(d => d.exposure_count || 0).sort((a, b) => a - b);
        const medianExposure = sortedExposures.length > 0 ? sortedExposures[Math.floor(sortedExposures.length / 2)] : 0;
        const risingStarPool = allActiveDoctors.filter(d => d.is_new === 1 || (d.exposure_count || 0) <= medianExposure);

        const slot3Doc = weightedRandomSelect(
          risingStarPool.length > 0 ? risingStarPool : allActiveDoctors,
          d => d.exposureMultiplier,
          selectedSet
        );
        if (slot3Doc) {
          selectedSet.add(slot3Doc.id);
          recommendedList.push(slot3Doc);
        }

        // Fallback: fill up to 3 doctors if pools are small
        while (recommendedList.length < Math.min(3, allActiveDoctors.length)) {
          const fallbackDoc = weightedRandomSelect(
            allActiveDoctors,
            d => 1,
            selectedSet
          );
          if (fallbackDoc) {
            selectedSet.add(fallbackDoc.id);
            recommendedList.push(fallbackDoc);
          } else {
            break;
          }
        }

        // Record exposure counts asynchronously for recommended ones
        if (recommendedList.length > 0) {
          const selectedIds = recommendedList.map(d => d.id);
          const placeholdersUpdate = selectedIds.map(() => '?').join(',');
          query(
            `UPDATE doctors SET exposure_count = exposure_count + 1 WHERE id IN (${placeholdersUpdate})`,
            selectedIds
          ).catch(err => console.error('Failed to update exposure counts:', err));
        }

        const remainingDoctors = allActiveDoctors.filter(d => !selectedSet.has(d.id));
        list = [...recommendedList, ...remainingDoctors];
      }
    }

    const doctorIds = list.map(d => d.id);
    let allMappings = [];
    let allApptCounts = [];
    let allEvalStats = [];

    if (doctorIds.length > 0) {
      const placeholders = doctorIds.map(() => '?').join(',');
      allMappings = await query(`SELECT doctor_id, store_id FROM doctor_store_mapping WHERE doctor_id IN (${placeholders})`, doctorIds);
      allApptCounts = await query(`SELECT doctor_id, COUNT(*) as count FROM appointments WHERE doctor_id IN (${placeholders}) GROUP BY doctor_id`, doctorIds);
      allEvalStats = await query(`SELECT doctor_id, COUNT(*) as count, AVG(rating) as avg_rating FROM appointment_evaluations WHERE doctor_id IN (${placeholders}) GROUP BY doctor_id`, doctorIds);
    }

    const mappingsMap = {};
    allMappings.forEach(m => {
      if (!mappingsMap[m.doctor_id]) mappingsMap[m.doctor_id] = [];
      mappingsMap[m.doctor_id].push(m.store_id);
    });

    const apptCountsMap = {};
    allApptCounts.forEach(c => {
      apptCountsMap[c.doctor_id] = c.count;
    });

    const evalStatsMap = {};
    allEvalStats.forEach(e => {
      evalStatsMap[e.doctor_id] = { count: e.count, avg_rating: e.avg_rating };
    });

    const formatted = [];
    for (const d of list) {
      const storeIds = mappingsMap[d.id] || [];
      const consultCount = apptCountsMap[d.id] || 0;
      const evalStats = evalStatsMap[d.id] || { count: 0, avg_rating: null };
      const reviewCount = evalStats.count;

      let rating = 0;
      if (evalStats.avg_rating !== null && evalStats.avg_rating !== undefined) {
        rating = Math.round(Number(evalStats.avg_rating) * 10) / 10;
      }

      let expertise = [];
      if (d.expertise) {
        try {
          const parsed = typeof d.expertise === 'string' ? JSON.parse(d.expertise) : d.expertise;
          if (Array.isArray(parsed) && parsed.length > 0) {
            expertise = parsed;
          }
        } catch (e) {
          console.error('Failed to parse expertise JSON:', e);
        }
      }

      if (expertise.length === 0) {
        const spec = String(d.specialty || '').trim();
        if (spec.includes('睡眠')) {
          expertise = ['睡眠呼吸暂停综合症', '鼾症非手术治疗', '阻鼾器适配', '下颌前移治疗'];
        } else if (spec.includes('耳鼻喉')) {
          expertise = ['鼻内镜诊断', '上气道评估', '过敏性鼻炎与鼾症', '多导睡眠监测'];
        } else if (spec.includes('口腔') || spec.includes('正畸')) {
          expertise = ['口腔矫治器治疗OSAS', '下颌前移量精准控制', '儿童鼾症', '颞下颌关节保护'];
        } else if (spec.includes('心理')) {
          expertise = ['认知行为治疗', '睡眠心理辅导', '心理健康评估', '依从性管理'];
        } else {
          expertise = ['睡眠健康管理', '鼾症物理治疗'];
        }
      }

      formatted.push({
        id: d.id,
        name: d.name,
        avatar: d.avatar_url || '',
        avatarUrl: d.avatar_url || '',
        title: d.title,
        specialty: d.specialty,
        hospital: d.hospital || '',
        intro: d.intro || '',
        experience: d.experience_years,
        experienceYears: d.experience_years,
        expertise,
        rating,
        reviewCount,
        consultCount,
        consultFee: d.consult_fee,
        storeIds
      });
    }
    res.json({ code: 0, message: 'success', data: formatted });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取医生列表失败' });
  }
});

// 10. Schedule Dates (GET)
app.get('/api/v1/schedules/dates', async (req, res) => {
  const { doctorId, storeId } = req.query;
  if (!doctorId || !storeId) {
    return res.status(400).json({ code: 400, message: 'doctorId和storeId不能为空' });
  }

  try {
    const advanceDaysRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'booking_advance_days'`);
    const advanceDays = advanceDaysRow ? parseInt(advanceDaysRow.key_value, 10) : 7;

    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const maxDate = new Date(today.getTime() + advanceDays * 24 * 60 * 60 * 1000);
    const maxDateStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;

    const list = await query(
      `SELECT * FROM doctor_schedules
       WHERE doctor_id = ? AND store_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [doctorId, storeId, todayStr, maxDateStr]
    );

    const scheduleIds = list.map(row => row.id);
    const apptMap = {};
    if (scheduleIds.length > 0) {
      const appts = await query(
        `SELECT schedule_id, appointment_time, COUNT(*) as count
         FROM appointments
         WHERE schedule_id IN (${scheduleIds.join(',')}) AND status NOT IN ('cancelled', 'no_show')
         GROUP BY schedule_id, appointment_time`
      );
      appts.forEach(appt => {
        if (!apptMap[appt.schedule_id]) apptMap[appt.schedule_id] = {};
        apptMap[appt.schedule_id][appt.appointment_time] = appt.count;
      });
    }

    const availableDates = new Set();
    for (const t of list) {
      const dateStr = formatDate(t.date);
      const isToday = dateStr === todayStr;
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();

      const apptsForSchedule = apptMap[t.id] || {};
      let availableCount = 0;
      for (const slot of buildScheduleSlots(t)) {
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const slotBookedCount = apptsForSchedule[slot.label] || 0;
        let status = slotBookedCount >= t.people_per_slot ? 'booked' : 'available';
        if (isToday) {
          if (startH < currentHour || (startH === currentHour && startM < currentMinute)) {
            status = 'disabled';
          }
        }
        if (status === 'available') {
          availableCount++;
        }
      }
      if (availableCount > 0) {
        availableDates.add(dateStr);
      }
    }

    const sortedDates = Array.from(availableDates).sort();
    res.json({
      code: 0,
      message: 'success',
      data: sortedDates
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班日期失败' });
  }
});

// 11. Schedules (GET)
app.get('/api/v1/schedules', async (req, res) => {
  const { doctorId, storeId, startDate, endDate } = req.query;
  if (!doctorId || !storeId) {
    return res.status(400).json({ code: 400, message: 'doctorId和storeId不能为空' });
  }

  try {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let list;
    if (startDate && endDate) {
      list = await query(
        `SELECT * FROM doctor_schedules
         WHERE doctor_id = ? AND store_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC, start_time ASC`,
        [doctorId, storeId, startDate, endDate]
      );
    } else {
      const advanceDaysRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'booking_advance_days'`);
      const advanceDays = advanceDaysRow ? parseInt(advanceDaysRow.key_value, 10) : 7;

      const maxDate = new Date(today.getTime() + advanceDays * 24 * 60 * 60 * 1000);
      const maxDateStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;

      list = await query(
        `SELECT * FROM doctor_schedules
         WHERE doctor_id = ? AND store_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC, start_time ASC`,
        [doctorId, storeId, todayStr, maxDateStr]
      );
    }

    const scheduleIds = list.map(row => row.id);
    const apptMap = {};
    if (scheduleIds.length > 0) {
      const appts = await query(
        `SELECT schedule_id, appointment_time, COUNT(*) as count
         FROM appointments
         WHERE schedule_id IN (${scheduleIds.join(',')}) AND status NOT IN ('cancelled', 'no_show')
         GROUP BY schedule_id, appointment_time`
      );
      appts.forEach(appt => {
        if (!apptMap[appt.schedule_id]) apptMap[appt.schedule_id] = {};
        apptMap[appt.schedule_id][appt.appointment_time] = appt.count;
      });
    }

    const formatted = list.map(row => {
      const dateStr = formatDate(row.date);
      const isToday = dateStr === todayStr;
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();

      const apptsForSchedule = apptMap[row.id] || {};
      let availableCount = 0;
      for (const slot of buildScheduleSlots(row)) {
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const slotBookedCount = apptsForSchedule[slot.label] || 0;
        let status = slotBookedCount >= row.people_per_slot ? 'booked' : 'available';
        if (isToday) {
          if (startH < currentHour || (startH === currentHour && startM < currentMinute)) {
            status = 'disabled';
          }
        }
        if (status === 'available') {
          availableCount++;
        }
      }

      const displayBookedSlots = row.total_slots - availableCount;
      const displayStatus = (availableCount === 0) ? 'full' : row.status;

      if (isToday && availableCount === 0) {
        return null;
      }

      return {
        id: row.id,
        doctorId: Number(row.doctor_id),
        storeId: Number(row.store_id),
        date: dateStr,
        period: row.period,
        startTime: row.start_time,
        endTime: row.end_time,
        totalSlots: row.total_slots,
        bookedSlots: displayBookedSlots,
        status: displayStatus,
        peoplePerSlot: row.people_per_slot
      };
    }).filter(Boolean);

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班信息失败' });
  }
});

// 12. Time Slots (GET)
app.get('/api/v1/schedules/:id/slots', async (req, res) => {
  const { id } = req.params;
  try {
    const t = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [id]);
    if (!t) {
      return res.status(404).json({ code: 1004, message: '排班不存在' });
    }

    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isToday = formatDate(t.date) === todayStr;
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();

    const appts = await query(
      `SELECT appointment_time, COUNT(*) as count
       FROM appointments
       WHERE schedule_id = ? AND status NOT IN ('cancelled', 'no_show')
       GROUP BY appointment_time`,
      [id]
    );
    const apptMap = {};
    appts.forEach(appt => {
      apptMap[appt.appointment_time] = appt.count;
    });

    const slots = [];
    for (const slot of buildScheduleSlots(t)) {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const slotBookedCount = apptMap[slot.label] || 0;
      let status = slotBookedCount >= t.people_per_slot ? 'booked' : 'available';
      if (isToday) {
        if (startH < currentHour || (startH === currentHour && startM < currentMinute)) {
          status = 'disabled';
        }
      }

      slots.push({
        id: slot.id,
        scheduleId: t.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: status,
        label: slot.label
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: slots
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取排班分时段失败' });
  }
});

// 13. Create Appointment (POST)
app.post('/api/v1/appointments', authenticateWxToken, async (req, res) => {
  const { doctorId, storeId, scheduleId, appointmentDate, appointmentTime, patientId, type, symptomDesc, essAssessmentId, snoreAssessmentId } = req.body;
  if (!doctorId || !storeId || !scheduleId || !appointmentDate || !appointmentTime || !patientId) {
    return res.status(400).json({ code: 400, message: '预约关键信息缺失' });
  }

  const symptomDescClean = symptomDesc ? escapeHtml(symptomDesc) : '';

  try {
    const resolvedStoreId = normalizeNumericId(storeId);
    const resolvedDoctorId = normalizeNumericId(doctorId);
    const resolvedScheduleId = normalizeNumericId(scheduleId);
    if (!resolvedStoreId || !resolvedDoctorId || !resolvedScheduleId) {
      return res.status(400).json({ code: 400, message: '门店、医生或排班参数无效' });
    }

    const resolvedPatientId = parseInt(patientId, 10);
    if (!Number.isInteger(resolvedPatientId)) {
      return res.status(400).json({ code: 400, message: '请选择有效就诊人' });
    }
    const patient = await get(`SELECT id, age FROM patients WHERE id = ? AND user_id = ?`, [resolvedPatientId, req.user.id]);
    if (!patient) {
      return res.status(403).json({ code: 403, message: '无权使用该就诊人档案' });
    }
    if (patient.age !== null && patient.age < 18 && (type === 'device_fitting' || type === 'device_adjustment')) {
      return res.status(400).json({
        code: 400,
        message: '本门诊定制式下颌前移阻鼾器仅适用于18岁以上发育成熟的成人。18岁以下儿童打鼾建议预约小儿耳鼻喉科进行腺样体筛查诊治。'
      });
    }
    const storeObj = await get(`SELECT * FROM stores WHERE id = ? AND status = 'open'`, [resolvedStoreId]);
    if (!storeObj) {
      return res.status(400).json({ code: 400, message: '所选门店不可预约' });
    }
    const doctorObj = await get(`SELECT * FROM doctors WHERE id = ? AND status = 1`, [resolvedDoctorId]);
    if (!doctorObj) {
      return res.status(400).json({ code: 400, message: '所选医生不可预约' });
    }
    const mapping = await get(
      `SELECT id FROM doctor_store_mapping WHERE doctor_id = ? AND store_id = ?`,
      [resolvedDoctorId, resolvedStoreId]
    );
    if (!mapping) {
      return res.status(400).json({ code: 400, message: '该医生未在所选门店出诊' });
    }

    // Find the exact schedule for the given doctor, store, and date
    const schedule = await get(
      `SELECT * FROM doctor_schedules WHERE id = ? AND doctor_id = ? AND store_id = ? AND date = ?`,
      [resolvedScheduleId, resolvedDoctorId, resolvedStoreId, appointmentDate]
    );

    if (!schedule) {
      return res.status(400).json({ code: 400, message: '医生在所选日期没有出诊排班' });
    }

    // Generate slots to validate appointmentTime
    const validSlots = buildScheduleSlots(schedule).map(slot => slot.label);

    if (!validSlots.includes(appointmentTime)) {
      return res.status(400).json({ code: 400, message: '所选预约时段不符合排班规则' });
    }
    if (getAppointmentStartTime(appointmentDate, appointmentTime).getTime() <= getShanghaiNow().getTime()) {
      return res.status(400).json({ code: 400, message: '不能预约已过期的时段' });
    }

    const essId = normalizeNumericId(essAssessmentId);
    const snoreId = normalizeNumericId(snoreAssessmentId);
    if (essId) {
      const ess = await get(`SELECT id FROM ess_assessments WHERE id = ? AND user_id = ? AND patient_id = ?`, [essId, req.user.id, resolvedPatientId]);
      if (!ess) return res.status(400).json({ code: 400, message: 'ESS评估记录无效' });
    }
    if (snoreId) {
      const snore = await get(`SELECT id FROM snore_assessments WHERE id = ? AND user_id = ? AND patient_id = ?`, [snoreId, req.user.id, resolvedPatientId]);
      if (!snore) return res.status(400).json({ code: 400, message: '鼾声评估记录无效' });
    }

    const apptNo = `AP${new Date().getFullYear()}${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;

    // Read require_deposit and deposit_amount settings
    const requireDepositRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'require_deposit'`);
    const depositAmountRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'deposit_amount'`);

    const requireDeposit = requireDepositRow ? requireDepositRow.key_value === 'true' : false;
    const depositAmount = depositAmountRow ? parseInt(depositAmountRow.key_value, 10) : 5000;

    const consultFee = doctorObj ? doctorObj.consult_fee : 0;
    const initialStatus = (requireDeposit || consultFee > 0) ? 'pending_payment' : 'pending';

    const result = await transaction(async (conn) => {
      // Concurrency-safe slot capacity check using FOR UPDATE
      const [slotApptCountRows] = await conn.execute(
        `SELECT COUNT(*) as count
         FROM appointments
         WHERE schedule_id = ? AND appointment_time = ? AND status NOT IN ('cancelled', 'no_show') FOR UPDATE`,
        [schedule.id, appointmentTime]
      );
      const slotApptCount = slotApptCountRows && slotApptCountRows[0] ? slotApptCountRows[0].count : 0;
      if (slotApptCount >= schedule.people_per_slot) {
        const err = new Error('该时间段预约人数已满，请选择其他时间段');
        err.statusCode = 400;
        throw err;
      }

      const insertResult = await conn.execute(
        `INSERT INTO appointments (appointment_no, user_id, patient_id, store_id, doctor_id, schedule_id, appointment_date, appointment_time, type, status, symptom_desc, source, ess_assessment_id, snore_assessment_id, doctor_name, doctor_title, doctor_specialty, doctor_avatar, consult_fee, deposit_amount, store_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mini_app', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          apptNo,
          req.user.id,
          resolvedPatientId,
          resolvedStoreId,
          resolvedDoctorId,
          schedule.id,
          appointmentDate,
          appointmentTime,
          type || 'first',
          initialStatus,
          symptomDescClean,
          essId || null,
          snoreId || null,
          doctorObj.name || '',
          doctorObj.title || '',
          doctorObj.specialty || '',
          doctorObj.avatar_url || '',
          doctorObj.consult_fee || 0,
          requireDeposit ? depositAmount : 0,
          storeObj.name || ''
        ]
      );
      const newId = insertResult[0]?.insertId || insertResult.insertId;
      await conn.execute(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [schedule.id]);
      return { id: newId };
    });

    const o = {
      id: result.id,
      appointmentNo: apptNo,
      userId: req.user.id.toString(),
      patientId: resolvedPatientId,
      doctorId: resolvedDoctorId,
      storeId: resolvedStoreId,
      scheduleId: schedule.id,
      appointmentDate,
      appointmentTime,
      type,
      symptomDesc,
      status: initialStatus,
      requireDeposit,
      depositAmount,
      source: 'mini_app',
      createdAt: new Date().toISOString()
    };

    res.json({
      code: 0,
      message: 'success',
      data: o
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ code: 500, message: '预约创建失败' });
  }
});

// 13.5 Pay Appointment Deposit (POST)
// 13.5 Pay Appointment Deposit (POST)
app.post('/api/v1/appointments/:id/pay', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const appt = await get(
      `SELECT a.*, d.consult_fee
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = ?`,
      [id]
    );
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status !== 'pending_payment') {
      return res.status(400).json({ code: 400, message: '预约不需要支付或已支付' });
    }

    const requireDepositRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'require_deposit'`);
    const requireDeposit = requireDepositRow ? requireDepositRow.key_value === 'true' : false;
    const depositAmountRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'deposit_amount'`);
    const depositAmount = depositAmountRow ? parseInt(depositAmountRow.key_value, 10) : 5000;
    const totalPayAmount = (appt.deposit_amount !== undefined && appt.deposit_amount !== null ? appt.deposit_amount : (requireDeposit ? depositAmount : 0)) + (appt.consult_fee || 0);
    const missingPayConfig = getMissingWechatPayConfig();
    if (missingPayConfig.length > 0 && allowDevMockWechatPay()) {
      return res.json({
        code: 0,
        message: '开发环境模拟支付',
        data: {
          appointmentId: id,
          payAmount: totalPayAmount,
          mockPayment: true,
          missingConfig: missingPayConfig
        }
      });
    }
    const payParams = await buildPaymentParams(
      appt.appointment_no,
      totalPayAmount,
      appt.appointment_no,
      req.user.openid,
      process.env.WECHAT_APPOINTMENT_PAY_NOTIFY_URL || ''
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        appointmentId: id,
        payAmount: totalPayAmount,
        ...payParams
      }
    });
  } catch (error) {
    console.error('Unified order error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '生成支付订单失败' });
  }
});

// 13.6 Confirm Appointment Payment (POST)
app.post('/api/v1/appointments/:id/confirm-pay', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const canUseMockConfirm = allowDevMockWechatPay() && getMissingWechatPayConfig().length > 0;
    if (process.env.ALLOW_CLIENT_APPOINTMENT_PAY_CONFIRM !== 'true' && !canUseMockConfirm) {
      return res.status(403).json({ code: 403, message: '预约支付状态以微信支付回调为准' });
    }
    const appt = await get(
      `SELECT a.*, d.consult_fee
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = ?`,
      [id]
    );
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }

    await transaction(async (conn) => {
      const [apptRows] = await conn.execute(
        `SELECT status FROM appointments WHERE id = ? FOR UPDATE`,
        [id]
      );
      const curAppt = apptRows && apptRows[0];
      if (!curAppt || curAppt.status !== 'pending_payment') {
        const err = new Error('预约不需要支付或已支付');
        err.statusCode = 400;
        throw err;
      }
      await finalizePaidAppointment(conn, appt, req.user.id);
    });

    res.json({ code: 0, message: '支付同步成功' });
  } catch (error) {
    console.error('Confirm pay error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '同步支付状态失败' });
  }
});

app.post('/api/v1/appointments/pay-callback', async (req, res) => {
  try {
    const resource = req.body && req.body.resource;
    if (!resource) {
      return res.status(400).json({ code: 400, message: '缺少支付回调数据' });
    }
    const payload = decryptWechatPayResource(resource);
    if (payload.trade_state !== 'SUCCESS') {
      return res.json({ code: 'SUCCESS', message: 'ignored' });
    }
    const appt = await get(`SELECT * FROM appointments WHERE appointment_no = ?`, [payload.out_trade_no]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status !== 'pending_payment') {
      return res.json({ code: 'SUCCESS', message: 'already processed' });
    }
    await transaction(async (conn) => {
      await finalizePaidAppointment(conn, appt, appt.user_id);
    });
    res.json({ code: 'SUCCESS', message: 'success' });
  } catch (error) {
    console.error('Appointment pay callback error:', error);
    res.status(500).json({ code: 500, message: '预约支付回调处理失败' });
  }
});

// 获取预约配置公开信息 API
app.get('/api/v1/settings/booking', async (req, res) => {
  try {
    const requireDepositRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'require_deposit'`);
    const depositAmountRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'deposit_amount'`);
    const cancelLimitRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'booking_cancel_limit'`);
    const subscribeTemplatesRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'appointment_subscribe_template_ids'`);
    const subscribeTemplateIds = subscribeTemplatesRow && subscribeTemplatesRow.key_value
      ? subscribeTemplatesRow.key_value.split(',').map(item => item.trim()).filter(Boolean)
      : [];

    res.json({
      code: 0,
      data: {
        requireDeposit: requireDepositRow ? requireDepositRow.key_value === 'true' : false,
        depositAmount: depositAmountRow ? parseInt(depositAmountRow.key_value, 10) : 5000,
        cancelLimit: cancelLimitRow ? cancelLimitRow.key_value : '就诊前2小时',
        subscribeTemplateIds
      }
    });
  } catch (error) {
    console.error('Get booking settings error:', error);
    res.status(500).json({ code: 500, message: '获取预约配置失败' });
  }
});

// 14. List Appointments (GET)
app.get('/api/v1/appointments', authenticateWxToken, async (req, res) => {
  let { status } = req.query;
  if (status === 'undefined' || status === 'null' || status === '') {
    status = undefined;
  }
  try {
    await autoUpdateExpiredAppointments();
    let sql = `SELECT a.*, p.name as patient_name, a.doctor_name, a.doctor_title, a.doctor_avatar, a.store_name
               FROM appointments a
               JOIN patients p ON a.patient_id = p.id
               WHERE a.user_id = ?`;
    const params = [req.user.id];

    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY a.created_at DESC`;

    const list = await query(sql, params);
    const formatted = list.map(row => ({
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: formatDate(row.appointment_date),
      appointmentTime: row.appointment_time,
      type: row.type,
      status: row.status,
      symptomDesc: row.symptom_desc,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      doctorTitle: row.doctor_title,
      doctorAvatar: row.doctor_avatar,
      storeName: row.store_name
    }));

    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取预约列表失败' });
  }
});

// 15. Appointment Detail (GET)
app.get('/api/v1/appointments/:id', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    await autoUpdateExpiredAppointments();
    const row = await get(
      `SELECT a.*, p.name as patient_name, d.hospital as doctor_hospital, d.intro as doctor_intro, d.experience_years as doctor_experience_years, d.expertise as doctor_expertise
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = ? AND a.user_id = ?`,
      [id, req.user.id]
    );

    if (!row) {
      return res.status(404).json({ code: 404, message: '预约记录不存在' });
    }

    let expertise = [];
    if (row.doctor_expertise) {
      try {
        const parsed = typeof row.doctor_expertise === 'string' ? JSON.parse(row.doctor_expertise) : row.doctor_expertise;
        if (Array.isArray(parsed) && parsed.length > 0) {
          expertise = parsed;
        }
      } catch (e) {
        console.error('Failed to parse expertise JSON:', e);
      }
    }

    if (expertise.length === 0) {
      const spec = String(row.doctor_specialty || row.specialty || '').trim();
      if (spec.includes('睡眠')) {
        expertise = ['睡眠呼吸暂停综合症', '鼾症非手术治疗', '阻鼾器适配', '下颌前移治疗'];
      } else if (spec.includes('耳鼻喉')) {
        expertise = ['鼻内镜诊断', '上气道评估', '过敏性鼻炎与鼾症', '多导睡眠监测'];
      } else if (spec.includes('口腔') || spec.includes('正畸')) {
        expertise = ['口腔矫治器治疗OSAS', '下颌前移量精准控制', '儿童鼾症', '颞下颌关节保护'];
      } else if (spec.includes('心理')) {
        expertise = ['认知行为治疗', '睡眠心理辅导', '心理健康评估', '依从性管理'];
      } else {
        expertise = ['睡眠健康管理', '鼾症物理治疗'];
      }
    }

    const requireDepositRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'require_deposit'`);
    const depositAmountRow = await get(`SELECT key_value FROM system_settings WHERE key_name = 'deposit_amount'`);

    const requireDeposit = requireDepositRow ? requireDepositRow.key_value === 'true' : false;
    const depositAmount = depositAmountRow ? parseInt(depositAmountRow.key_value, 10) : 5000;

    const appt = {
      id: row.id,
      appointmentNo: row.appointment_no,
      userId: row.user_id.toString(),
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      storeId: row.store_id,
      scheduleId: row.schedule_id,
      appointmentDate: formatDate(row.appointment_date),
      appointmentTime: row.appointment_time,
      type: row.type,
      status: row.status,
      symptomDesc: row.symptom_desc,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      doctorTitle: row.doctor_title,
      doctorAvatar: row.doctor_avatar,
      storeName: row.store_name,
      requireDeposit,
      depositAmount,
      consultFee: row.consult_fee
    };

    const medicalRecord = await get(
      `SELECT mr.*, d.name as doctor_name, s.name as store_name
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN stores s ON mr.store_id = s.id
       WHERE mr.appointment_id = ?`,
      [id]
    );
    const [storeDetail, evaluation, preExam, essAssessment, snoreAssessment] = await Promise.all([
      get(`SELECT id, name, address, latitude, longitude, phone, open_time, close_time FROM stores WHERE id = ?`, [row.store_id]),
      get(`SELECT id, rating, content, created_at FROM appointment_evaluations WHERE appointment_id = ? AND user_id = ?`, [id, req.user.id]),
      get(`SELECT * FROM appointment_pre_exams WHERE appointment_id = ? AND user_id = ?`, [id, req.user.id]),
      row.ess_assessment_id ? get(`SELECT id, total_score, risk_level, created_at FROM ess_assessments WHERE id = ?`, [row.ess_assessment_id]) : null,
      row.snore_assessment_id ? get(`SELECT id, avg_decibel, peak_decibel, snore_rate, apnea_events, risk_level, created_at FROM snore_assessments WHERE id = ?`, [row.snore_assessment_id]) : null
    ]);

    let treatmentRecord = null;
    if (medicalRecord) {
      // 1. Try to find a treatment record that was created at this appointment (first fit)
      treatmentRecord = await get(
        `SELECT tr.*
         FROM treatment_records tr
         WHERE tr.medical_record_id = ?`,
        [medicalRecord.id]
      );

      // 2. If not found, see if there was a device adjustment on the date of this medical record (follow-up)
      if (!treatmentRecord) {
        const adjustment = await get(
          `SELECT tr.*, da.adjusted_advancement, da.patient_feedback, da.instructions
           FROM treatment_records tr
           JOIN device_adjustments da ON da.treatment_id = tr.id
           WHERE tr.patient_id = ? AND (DATE(da.adjust_date) = DATE(?) OR da.adjust_date = ?)
           ORDER BY da.id DESC LIMIT 1`,
          [medicalRecord.patient_id, medicalRecord.visit_date, medicalRecord.visit_date]
        );
        if (adjustment) {
          treatmentRecord = {
            id: adjustment.id,
            device_model: adjustment.device_model,
            initial_advancement: adjustment.initial_advancement,
            current_advancement: adjustment.adjusted_advancement, // use the adjusted value from that day!
            next_adjust_date: adjustment.next_adjust_date,
            status: adjustment.status,
            start_date: adjustment.start_date
          };
        }
      }
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        appointment: appt,
        doctor: {
          id: row.doctor_id,
          name: row.doctor_name,
          avatarUrl: row.doctor_avatar,
          title: row.doctor_title,
          specialty: row.doctor_specialty,
          hospital: row.doctor_hospital,
          intro: row.doctor_intro,
          experienceYears: row.doctor_experience_years,
          expertise: expertise
        },
        store: {
          id: row.store_id,
          name: row.store_name,
          address: storeDetail?.address || '',
          latitude: storeDetail?.latitude || null,
          longitude: storeDetail?.longitude || null,
          phone: storeDetail?.phone || '',
          businessHours: storeDetail ? `${String(storeDetail.open_time || '').slice(0, 5)}-${String(storeDetail.close_time || '').slice(0, 5)}` : ''
        },
        preExam: preExam ? {
          height: preExam.height,
          weight: preExam.weight,
          systolicBp: preExam.systolic_bp,
          diastolicBp: preExam.diastolic_bp,
          neckCircumference: preExam.neck_circumference,
          bmi: preExam.bmi
        } : null,
        evaluation: evaluation ? {
          id: evaluation.id,
          rating: Number(evaluation.rating),
          content: evaluation.content || '',
          createdAt: evaluation.created_at
        } : null,
        assessments: {
          ess: essAssessment ? {
            id: essAssessment.id,
            score: essAssessment.total_score,
            riskLevel: essAssessment.risk_level,
            createdAt: essAssessment.created_at
          } : null,
          snore: snoreAssessment ? {
            id: snoreAssessment.id,
            avgDecibel: snoreAssessment.avg_decibel,
            peakDecibel: snoreAssessment.peak_decibel,
            snoreRate: snoreAssessment.snore_rate,
            apneaEvents: snoreAssessment.apnea_events,
            riskLevel: snoreAssessment.risk_level,
            createdAt: snoreAssessment.created_at
          } : null
        },
        medicalRecord: medicalRecord ? {
          id: medicalRecord.id,
          diagnosis: medicalRecord.diagnosis,
          prescription: medicalRecord.prescription,
          doctorAdvice: medicalRecord.doctor_advice,
          note: medicalRecord.note,
          visitDate: formatDate(medicalRecord.visit_date),
          doctorName: medicalRecord.doctor_name,
          storeName: medicalRecord.store_name
        } : null,
        treatmentRecord: treatmentRecord ? {
          id: treatmentRecord.id,
          deviceModel: treatmentRecord.device_model || treatmentRecord.deviceModel,
          initialAdvancement: Number(treatmentRecord.initial_advancement || treatmentRecord.initialAdvancement),
          currentAdvancement: Number(treatmentRecord.current_advancement || treatmentRecord.currentAdvancement),
          nextAdjustDate: formatDate(treatmentRecord.next_adjust_date || treatmentRecord.nextAdjustDate),
          status: treatmentRecord.status,
          startDate: formatDate(treatmentRecord.start_date || treatmentRecord.startDate)
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取预约详情失败' });
  }
});

app.post('/api/v1/appointments/:id/evaluation', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const rating = Number(req.body?.rating || 0);
  const content = String(req.body?.content || '').trim();
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ code: 400, message: '请选择1-5分评价' });
  }
  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) return res.status(404).json({ code: 404, message: '预约不存在' });
    if (!['completed', 'arrived'].includes(appt.status)) {
      return res.status(400).json({ code: 400, message: '完成就诊后才能评价' });
    }
    await run(
      `INSERT INTO appointment_evaluations (appointment_id, doctor_id, user_id, rating, content)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), content = VALUES(content), created_at = CURRENT_TIMESTAMP`,
      [id, appt.doctor_id, req.user.id, rating, content ? escapeHtml(content).slice(0, 500) : null]
    );
    res.json({ code: 0, message: '评价已提交' });
  } catch (error) {
    console.error('Submit appointment evaluation error:', error);
    res.status(500).json({ code: 500, message: '提交评价失败' });
  }
});

app.post('/api/v1/appointments/:id/pre-exam', authenticateWxToken, async (req, res) => {
  res.status(403).json({ code: 403, message: '预检信息由后台签到时填写，小程序端不支持提交' });
});

// 16. Cancel Appointment (POST)
app.post('/api/v1/appointments/:id/cancel', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const reasonClean = reason ? escapeHtml(reason) : '';
  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status === 'completed' || appt.status === 'arrived' || appt.status === 'cancelled' || appt.status === 'no_show') {
      return res.status(400).json({ code: 400, message: '该预约状态下不支持取消' });
    }

    // Check if within 2 hours of appointment time
    if (appt.status !== 'pending_payment') {
      try {
        const apptDateTime = getAppointmentStartTime(appt.appointment_date, appt.appointment_time);
        const now = getShanghaiNow();
        if (apptDateTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
          return res.status(400).json({ code: 400, message: '距离预约时间已不足2小时，不支持取消预约' });
        }
      } catch (err) {
        console.error('解析预约时间失败:', err);
      }
    }

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE appointments SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reasonClean, id]
      );
      await conn.execute(`UPDATE doctor_schedules SET booked_slots = GREATEST(0, booked_slots - 1) WHERE id = ?`, [appt.schedule_id]);
      const paidOrder = await get(
        `SELECT id, pay_amount FROM orders WHERE appointment_id = ? AND user_id = ? AND type = 'appointment_deposit' AND status = 'paid' ORDER BY id DESC LIMIT 1`,
        [id, req.user.id]
      );
      if (paidOrder) {
        await conn.execute(
          `UPDATE orders SET status = 'refunding', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [paidOrder.id]
        );
        await conn.execute(
          `INSERT INTO user_notifications (user_id, title, content)
           VALUES (?, '预约退款申请已提交', ?)`,
          [req.user.id, `预约 ${appt.appointment_no} 已取消，已支付金额 ¥${(paidOrder.pay_amount / 100).toFixed(2)} 将在支付成功3日后自动原路退回您的支付账户。`]
        );
      } else {
        await conn.execute(
          `INSERT INTO user_notifications (user_id, title, content)
           VALUES (?, '预约已取消', ?)`,
          [req.user.id, `预约 ${appt.appointment_no} 已取消。`]
        );
      }
    });

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    res.json({
      code: 0,
      message: 'success',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '取消预约失败' });
  }
});

// 17. Reschedule Appointment (POST)
app.post('/api/v1/appointments/:id/reschedule', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const { scheduleId, appointmentDate, appointmentTime } = req.body;

  try {
    const appt = await get(`SELECT * FROM appointments WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!appt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }
    if (appt.status === 'completed' || appt.status === 'arrived' || appt.status === 'cancelled' || appt.status === 'no_show') {
      return res.status(400).json({ code: 400, message: '该预约状态下不支持修改就诊时间' });
    }

    // Check if within 2 hours of appointment time
    try {
      const [year, month, day] = appt.appointment_date.split('-').map(Number);
      const [hours, minutes] = appt.appointment_time.split('-')[0].trim().split(':').map(Number);
      const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
      if (apptDateTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
        return res.status(400).json({ code: 400, message: '距离预约时间已不足2小时，不支持修改就诊时间' });
      }
    } catch (err) {
      console.error('解析预约时间失败:', err);
    }

    const newSchedule = await get(`SELECT * FROM doctor_schedules WHERE id = ?`, [scheduleId]);
    if (!newSchedule) {
      return res.status(400).json({ code: 400, message: '目标排班时段不存在' });
    }
    if (!buildScheduleSlots(newSchedule).some(slot => slot.label === appointmentTime)) {
      return res.status(400).json({ code: 400, message: '目标预约时段不符合排班规则' });
    }
    if (formatDate(newSchedule.date) !== appointmentDate) {
      return res.status(400).json({ code: 400, message: '目标预约日期与排班不一致' });
    }
    if (getAppointmentStartTime(appointmentDate, appointmentTime).getTime() <= getShanghaiNow().getTime()) {
      return res.status(400).json({ code: 400, message: '不能改约到已过期的时段' });
    }
    const slotCountRow = await get(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE schedule_id = ? AND appointment_time = ? AND status NOT IN ('cancelled', 'no_show') AND id != ?`,
      [scheduleId, appointmentTime, id]
    );
    if ((slotCountRow?.count || 0) >= newSchedule.people_per_slot) {
      return res.status(400).json({ code: 400, message: '目标预约时段已约满' });
    }

    await transaction(async (conn) => {
      if (Number(appt.schedule_id) !== Number(scheduleId)) {
        await conn.execute(`UPDATE doctor_schedules SET booked_slots = GREATEST(0, booked_slots - 1) WHERE id = ?`, [appt.schedule_id]);
        await conn.execute(`UPDATE doctor_schedules SET booked_slots = booked_slots + 1 WHERE id = ?`, [scheduleId]);
      }
      await conn.execute(
        `UPDATE appointments
         SET schedule_id = ?, appointment_date = ?, appointment_time = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [scheduleId, appointmentDate, appointmentTime, id]
      );
    });

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [id]);
    res.json({
      code: 0,
      message: 'success',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '改约失败' });
  }
});

// 18. Products (GET)
app.get('/api/v1/products', async (req, res) => {
  const { category } = req.query;
  try {
    const params = [];
    let sql = `SELECT * FROM products WHERE status = 'on'`;
    if (category && category !== 'all') {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY id DESC`;
    const list = await query(sql, params);
    const formatted = list.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.image_url,
      galleryUrls: typeof p.gallery_urls === 'string' ? JSON.parse(p.gallery_urls) : p.gallery_urls,
      price: p.price,
      originalPrice: p.original_price,
      description: p.description,
      stock: p.stock,
      salesCount: p.sales_count
    }));
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品列表失败' });
  }
});

app.get('/api/v1/user/coupons', authenticateWxToken, async (req, res) => {
  const { status = 'active', minAmount } = req.query;
  try {
    const params = [req.user.id];
    let sql = `
      SELECT uc.id, uc.status, uc.used_at, uc.created_at,
             c.title, c.type, c.value, c.min_spend, c.valid_start, c.valid_end
      FROM user_coupons uc
      JOIN coupons c ON uc.coupon_id = c.id
      WHERE uc.user_id = ?
        AND c.status = 'active'
        AND (c.valid_start IS NULL OR c.valid_start <= CURDATE())
        AND (c.valid_end IS NULL OR c.valid_end >= CURDATE())
    `;
    if (status && status !== 'all') {
      sql += ` AND uc.status = ?`;
      params.push(status);
    }
    if (minAmount) {
      sql += ` AND c.min_spend <= ?`;
      params.push(Number(minAmount));
    }
    sql += ` ORDER BY c.value DESC, uc.created_at DESC`;
    const list = await query(sql, params);
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(coupon => ({
          id: coupon.id.toString(),
          title: coupon.title,
          type: coupon.type,
          value: Number(coupon.value || 0),
          minSpend: Number(coupon.min_spend || 0),
          status: coupon.status,
          validStart: coupon.valid_start,
          validEnd: coupon.valid_end
        }))
      }
    });
  } catch (error) {
    console.error('Get user coupons error:', error);
    res.status(500).json({ code: 500, message: '获取优惠券失败' });
  }
});

// 18.4 Available Coupons (GET)
app.get('/api/v1/user/coupons/available', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM coupons
       WHERE status = 'active'
         AND (valid_start IS NULL OR valid_start <= CURDATE())
         AND (valid_end IS NULL OR valid_end >= CURDATE())`
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(c => ({
          id: c.id.toString(),
          title: c.title,
          type: c.type,
          value: Number(c.value || 0),
          minSpend: Number(c.min_spend || 0),
          pointsCost: Math.max(1, Math.floor(Number(c.value || 0) / 10)),
          validStart: c.valid_start,
          validEnd: c.valid_end
        }))
      }
    });
  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({ code: 500, message: '获取可兑换优惠券失败' });
  }
});

// 18.5 Redeem Coupon (POST)
app.post('/api/v1/user/coupons/redeem', authenticateWxToken, async (req, res) => {
  const { couponId } = req.body;
  if (!couponId) {
    return res.status(400).json({ code: 400, message: '请选择要兑换的优惠券' });
  }
  try {
    const coupon = await get(`SELECT * FROM coupons WHERE id = ? AND status = 'active'`, [couponId]);
    if (!coupon) {
      return res.status(404).json({ code: 404, message: '该优惠券不存在或已下架' });
    }

    // Points cost is value / 10 (e.g. 50 RMB cash coupon costs 500 points)
    const pointsCost = Math.max(1, Math.floor(Number(coupon.value || 0) / 10));

    const user = await get(`SELECT points FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    if (user.points < pointsCost) {
      return res.status(400).json({ code: 400, message: `积分不足，兑换该券需要 ${pointsCost} 积分，当前仅剩 ${user.points} 积分` });
    }

    // Perform redemption transaction
    await transaction(async (conn) => {
      await conn.execute(`UPDATE users SET points = points - ? WHERE id = ?`, [pointsCost, req.user.id]);
      await conn.execute(
        `INSERT INTO user_coupons (user_id, coupon_id, status)
         VALUES (?, ?, 'active')`,
        [req.user.id, coupon.id]
      );
      await conn.execute(
        `INSERT INTO points_logs (user_id, points, type, description)
         VALUES (?, ?, 'redeem_coupon', ?)`,
        [req.user.id, -pointsCost, `积分兑换代金券：${coupon.title}`]
      );
    });

    res.json({
      code: 0,
      message: '兑换成功',
      data: {
        pointsCost,
        remainingPoints: user.points - pointsCost
      }
    });
  } catch (error) {
    console.error('Redeem coupon error:', error);
    res.status(500).json({ code: 500, message: '积分兑换失败，请稍后重试' });
  }
});

// 19. Product Detail (GET)
app.get('/api/v1/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const p = await get(`SELECT * FROM products WHERE id = ? AND status = 'on'`, [id]);
    if (!p) {
      return res.status(404).json({ code: 404, message: '商品不存在' });
    }
    const formatted = {
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.image_url,
      galleryUrls: typeof p.gallery_urls === 'string' ? JSON.parse(p.gallery_urls) : p.gallery_urls,
      price: p.price,
      originalPrice: p.original_price,
      description: p.description,
      stock: p.stock,
      salesCount: p.sales_count
    };
    res.json({
      code: 0,
      message: 'success',
      data: formatted
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取商品详情失败' });
  }
});

// 20. Medical Records (GET)
app.get('/api/v1/user/medical-records', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT mr.*, p.name as patient_name, d.name as doctor_name, s.name as store_name
       FROM medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN stores s ON mr.store_id = s.id
       WHERE p.user_id = ?
       ORDER BY mr.visit_date DESC`,
      [req.user.id]
    );

    const formatted = list.map(mr => ({
      id: mr.id,
      patientId: mr.patient_id,
      patientName: mr.patient_name,
      doctorId: mr.doctor_id,
      doctorName: mr.doctor_name,
      storeId: mr.store_id,
      storeName: mr.store_name,
      hospital: mr.store_name,
      visitDate: mr.visit_date,
      type: mr.type || 'first',
      diagnosis: mr.diagnosis,
      prescription: mr.prescription,
      doctorAdvice: mr.doctor_advice,
      note: mr.note,
      attachments: typeof mr.attachments === 'string' ? JSON.parse(mr.attachments) : (mr.attachments || [])
    }));

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: formatted,
        total: formatted.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取病历记录失败' });
  }
});

// 20.1 Upload File (POST)
app.post('/api/v1/user/upload', authenticateWxToken, express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
  try {
    const rawExt = (req.query.ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const whitelist = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'mp3', 'm4a', 'wav', 'aac', 'pcm', 'mp4'];
    const ext = whitelist.includes(rawExt) ? rawExt : 'jpg';

    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadDir = './uploads/medical-attachments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(`${uploadDir}/${filename}`, req.body);
    const fileUrl = `/uploads/medical-attachments/${filename}`;
    res.json({
      code: 0,
      message: '上传成功',
      data: { url: fileUrl }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ code: 500, message: '上传文件失败' });
  }
});

// 20.2 Add Medical Attachment (POST)
app.post('/api/v1/user/medical-records/:id/attachments', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ code: 400, message: '附件地址不能为空' });
  }
  try {
    // Check ownership of the medical record
    const mrCheck = await get(
      `SELECT mr.id FROM medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       WHERE mr.id = ? AND p.user_id = ?`,
      [id, req.user.id]
    );
    if (!mrCheck) {
      return res.status(404).json({ code: 404, message: '该病历不存在或无权操作' });
    }

    let finalAttachments = [];
    await transaction(async (conn) => {
      const [mrRows] = await conn.execute(
        `SELECT attachments FROM medical_records WHERE id = ? FOR UPDATE`,
        [id]
      );
      const mr = mrRows && mrRows[0];
      if (mr && mr.attachments) {
        try {
          finalAttachments = typeof mr.attachments === 'string' ? JSON.parse(mr.attachments) : mr.attachments;
        } catch (e) {
          finalAttachments = [];
        }
      }
      if (!Array.isArray(finalAttachments)) {
        finalAttachments = [];
      }
      finalAttachments.push(url);

      await conn.execute(
        `UPDATE medical_records SET attachments = ? WHERE id = ?`,
        [JSON.stringify(finalAttachments), id]
      );
    });

    res.json({
      code: 0,
      message: '添加报告附件成功',
      data: { attachments: finalAttachments }
    });
  } catch (error) {
    console.error('Add medical attachment error:', error);
    res.status(500).json({ code: 500, message: '保存报告附件失败' });
  }
});

app.get('/api/v1/treatment/records', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: { list: [], total: 0 } });
    }
    const records = await query(
      `SELECT tr.*, d.name as doctor_name
       FROM treatment_records tr
       LEFT JOIN doctors d ON tr.doctor_id = d.id
       WHERE tr.patient_id = ?
       ORDER BY FIELD(tr.status, 'active', 'paused', 'completed'), tr.start_date DESC, tr.id DESC`,
      [patient.id]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: records.map(record => ({
          id: record.id.toString(),
          patientId: patient.id.toString(),
          patientName: patient.name,
          doctorName: record.doctor_name || '',
          deviceModel: record.device_product_name || record.device_model,
          adjustmentValue: Number(record.current_advancement || 0),
          startDate: formatDate(record.start_date || record.created_at),
          nextAdjustDate: record.next_adjust_date ? formatDate(record.next_adjust_date) : '',
          status: record.status
        })),
        total: records.length
      }
    });
  } catch (error) {
    console.error('Get treatment records error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '获取治疗记录失败' });
  }
});

// 21.01 WeChat Client Treatment Adjustments (GET)
app.get('/api/v1/treatment/adjustments', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    if (!patient) {
      return res.status(400).json({ code: 400, message: '未找到就诊人档案' });
    }
    const tr = await resolveTreatmentForPatient(patient, req.query.treatmentId);
    if (!tr) {
      return res.json({ code: 0, data: [] });
    }
    const adjustments = await query(
      `SELECT da.*, d.name as doctor_name
       FROM device_adjustments da
       LEFT JOIN doctors d ON da.operator_id = d.id
       WHERE da.treatment_id = ?
       ORDER BY da.adjust_date DESC`,
      [tr.id]
    );
    const formatted = adjustments.map(a => ({
      id: a.id.toString(),
      date: formatDate(a.adjust_date),
      value: Number(a.adjusted_advancement),
      note: a.instructions || '',
      doctor: a.doctor_name || '',
      feedback: a.patient_feedback || '',
      comfort: a.patient_feedback && /^\d+$/.test(String(a.patient_feedback)) ? parseInt(a.patient_feedback, 10) : 0
    }));
    res.json({ code: 0, message: 'success', data: formatted });
  } catch (error) {
    console.error('Get adjustments error:', error);
    res.status(500).json({ code: 500, message: '获取调整历史失败' });
  }
});

// 21.02 WeChat Client Sleep Report (GET)
app.get('/api/v1/treatment/sleep-report', authenticateWxToken, async (req, res) => {
  const { range } = req.query; // 'week' or 'month'
  const limitDays = range === 'month' ? 30 : 7;

  try {
    const patient = await resolveUserPatient(req);
    if (!patient) {
      return res.status(400).json({ code: 400, message: '未找到就诊人档案' });
    }
    const tr = await resolveTreatmentForPatient(patient, req.query.treatmentId);
    if (!tr) {
      return res.json({
        code: 0,
        data: {
          hasData: false,
          compliance: 0,
          weekAvg: 0,
          avgComfort: 0,
          streak: 0,
          score: 0,
          betterThan: 0,
          trend: []
        }
      });
    }

    const logs = await query(
      `SELECT * FROM wearing_logs
       WHERE treatment_id = ? AND source = 'mini_program_checkin'
       ORDER BY date DESC LIMIT ?`,
      [tr.id, limitDays]
    );

    let totalDuration = 0;
    let totalComfort = 0;
    let totalAhi = 0;
    let ahiCount = 0;
    let loggedDays = logs.length;
    let wearCount = 0;
    let trend = [];

    const dateList = [];
    const t = new Date();
    for (let i = limitDays - 1; i >= 0; i--) {
      const u = new Date(t);
      u.setDate(t.getDate() - i);
      const dateStr = formatDate(u);

      const log = logs.find(l => formatDate(l.date) === dateStr);
      let dayScore = 0;
      if (log) {
        const ahiPenalty = log.ahi_index !== null && log.ahi_index !== undefined
          ? Math.max(0, 100 - Number(log.ahi_index || 0) * 4)
          : 100;
        dayScore = Math.min(100, Math.round((log.wear_duration / 8) * 100 * 0.45 + (log.comfort / 5) * 100 * 0.25 + ahiPenalty * 0.3));
        totalDuration += log.wear_duration;
        totalComfort += log.comfort;
        if (log.ahi_index !== null && log.ahi_index !== undefined) {
          totalAhi += Number(log.ahi_index || 0);
          ahiCount++;
        }
        wearCount++;
      } else {
        dayScore = 0;
      }
      trend.push({
        date: `${u.getMonth() + 1}/${u.getDate()}`,
        score: dayScore
      });
    }

    const compliance = loggedDays > 0 ? Math.round((wearCount / limitDays) * 100) : 0;
    const weekAvg = wearCount > 0 ? Number((totalDuration / wearCount).toFixed(1)) : 0;
    const avgComfort = wearCount > 0 ? Number((totalComfort / wearCount).toFixed(1)) : 0;
    const avgAhi = ahiCount > 0 ? Number((totalAhi / ahiCount).toFixed(1)) : null;

    let streak = 0;
    for (let i = 0; i < limitDays; i++) {
      const checkDate = new Date(t);
      checkDate.setDate(t.getDate() - i);
      const checkDateStr = formatDate(checkDate);
      const found = logs.some(l => formatDate(l.date) === checkDateStr);
      if (found) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    const score = wearCount > 0
      ? Math.min(100, Math.round(0.35 * compliance + (weekAvg / 8) * 100 * 0.35 + (avgComfort / 5) * 100 * 0.2 + (avgAhi === null ? 100 : Math.max(0, 100 - avgAhi * 4)) * 0.1))
      : 0;
    const betterThan = wearCount > 0 ? Math.min(95, Math.max(5, Math.round(score * 0.82))) : 0;
    const [latestEss, latestSnore] = await Promise.all([
      get(`SELECT total_score, risk_level, created_at FROM ess_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`, [patient.id]),
      get(`SELECT avg_decibel, apnea_events, risk_level, created_at FROM snore_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`, [patient.id])
    ]);
    const platformStats = await get(
      `SELECT
         AVG(wear_duration) as avg_duration,
         SUM(CASE WHEN wear_duration > 0 THEN 1 ELSE 0 END) / COUNT(*) * 100 as avg_compliance
       FROM wearing_logs
       WHERE source = 'mini_program_checkin'
         AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [limitDays]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        hasData: wearCount > 0,
        compliance,
        weekAvg,
        avgComfort,
        streak,
        score,
        betterThan,
        platformAvgDuration: platformStats && platformStats.avg_duration !== null ? Number(Number(platformStats.avg_duration).toFixed(1)) : 0,
        platformAvgCompliance: platformStats && platformStats.avg_compliance !== null ? Math.round(Number(platformStats.avg_compliance)) : 0,
        avgAhi,
        latestEss: latestEss ? {
          score: latestEss.total_score,
          riskLevel: latestEss.risk_level,
          createdAt: latestEss.created_at
        } : null,
        latestSnore: latestSnore ? {
          avgDecibel: latestSnore.avg_decibel,
          apneaEvents: latestSnore.apnea_events,
          riskLevel: latestSnore.risk_level,
          createdAt: latestSnore.created_at
        } : null,
        trend
      }
    });
  } catch (error) {
    console.error('Get sleep report error:', error);
    res.status(500).json({ code: 500, message: '获取睡眠报告失败' });
  }
});

// 21. Active Treatment Record (GET)
async function sendTreatmentRecord(req, res, explicitTreatmentId = null) {
  try {
    let patient = await resolveUserPatient(req);
    if (!patient) {
      return res.json({
        code: 0,
        message: '暂无就诊人档案',
        data: null
      });
    }
    const treatmentId = explicitTreatmentId || req.query.treatmentId;
    let tr = treatmentId ? await get(
      `SELECT tr.*, mr.diagnosis, mr.doctor_advice, d.name as doctor_name
       FROM treatment_records tr
       LEFT JOIN medical_records mr ON tr.medical_record_id = mr.id
       LEFT JOIN doctors d ON tr.doctor_id = d.id
       WHERE tr.id = ? AND tr.patient_id = ?
       LIMIT 1`,
      [treatmentId, patient.id]
    ) : await get(
      `SELECT tr.*, mr.diagnosis, mr.doctor_advice, d.name as doctor_name
       FROM treatment_records tr
       LEFT JOIN medical_records mr ON tr.medical_record_id = mr.id
       LEFT JOIN doctors d ON tr.doctor_id = d.id
       WHERE tr.patient_id = ? AND tr.status = 'active'
       ORDER BY tr.start_date DESC, tr.id DESC
       LIMIT 1`,
      [patient.id]
    );

    if (!tr) {
      return res.json({
        code: 0,
        message: '暂无治疗记录',
        data: null
      });
    }

    const adjustments = await query(
      `SELECT * FROM device_adjustments WHERE treatment_id = ? ORDER BY adjust_date DESC, id DESC`,
      [tr.id]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: tr.id.toString(),
        patientId: tr.patient_id.toString(),
        patientName: patient.name,
        appointmentId: tr.medical_record_id ? tr.medical_record_id.toString() : '',
        doctorId: tr.doctor_id.toString(),
        doctorName: tr.doctor_name || '',
        diagnosis: tr.diagnosis || '',
        treatmentPlan: `下颌前移式阻鼾器治疗，初始前移量${tr.initial_advancement}mm，当前前移量${tr.current_advancement}mm`,
        deviceModel: tr.device_model,
        deviceProductId: tr.device_product_id ? tr.device_product_id.toString() : '',
        device: tr.device_product_id ? {
          id: tr.device_product_id.toString(),
          name: tr.device_product_name || tr.device_model,
          imageUrl: tr.device_product_image_url || '',
          price: Number(tr.device_product_price || 0),
          description: tr.device_product_description || '',
          status: 'bound'
        } : null,
        adjustmentValue: Number(tr.current_advancement),
        nextAdjustDate: tr.next_adjust_date ? formatDate(tr.next_adjust_date) : '',
        doctorAdvice: tr.doctor_advice || '',
        followupDate: tr.next_adjust_date ? formatDate(tr.next_adjust_date) : '',
        createdAt: tr.created_at,
        startDate: formatDate(tr.start_date || tr.created_at),
        status: tr.status,
        phases: buildTreatmentPhases(tr, adjustments)
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '获取治疗记录失败' });
  }
}

app.get('/api/v1/treatment/record', authenticateWxToken, async (req, res) => {
  return sendTreatmentRecord(req, res);
});

app.get('/api/v1/treatment/records/:id', authenticateWxToken, async (req, res) => {
  return sendTreatmentRecord(req, res, req.params.id);
});

app.get('/api/v1/treatment/device', authenticateWxToken, async (req, res) => {
  return sendTreatmentRecord(req, res);
});

// 21.1 WeChat Client Wearing Records (GET)
app.get('/api/v1/treatment/wearing-records', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: [] });
    }
    const tr = await resolveTreatmentForPatient(patient, req.query.treatmentId);
    if (!tr) {
      return res.json({ code: 0, message: 'success', data: [] });
    }
    const logs = await query(`SELECT * FROM wearing_logs WHERE treatment_id = ? AND source = 'mini_program_checkin' ORDER BY date DESC`, [tr.id]);
    const formatTime = (d) => {
      if (!d) return '';
      const date = new Date(d);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const r = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${r}`;
    };
    res.json({
      code: 0,
      message: 'success',
      data: logs.map(log => ({
        id: log.id.toString(),
        patientId: patient.id.toString(),
        date: formatTime(log.date),
        wearDuration: Number(log.wear_duration),
        comfort: log.comfort || 3,
        note: log.note || '',
        createdAt: log.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取佩戴记录失败' });
  }
});

// 21.2 WeChat Client Wearing Summary (GET)
app.get('/api/v1/treatment/wearing-summary', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    const defaultSummary = {
      totalDays: 0,
      wornDays: 0,
      compliance: 0,
      avgDuration: 0,
      avgComfort: 0,
      streak: 0,
      weekWorn: 0,
      weekAvg: 0
    };
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: defaultSummary });
    }
    const tr = await resolveTreatmentForPatient(patient, req.query.treatmentId);
    if (!tr) {
      return res.json({ code: 0, message: 'success', data: defaultSummary });
    }
    const logs = await query(`SELECT * FROM wearing_logs WHERE treatment_id = ? AND source = 'mini_program_checkin' ORDER BY date ASC`, [tr.id]);
    if (logs.length === 0) {
      return res.json({ code: 0, message: 'success', data: defaultSummary });
    }

    const e = logs.filter(l => Number(l.wear_duration) > 0);
    const totalDays = logs.length;
    const wornDays = e.length;
    const compliance = Math.round((wornDays / totalDays) * 100);
    const avgDuration = e.length > 0 ? Math.round((e.reduce((acc, l) => acc + Number(l.wear_duration), 0) / e.length) * 10) / 10 : 0;
    const avgComfort = e.length > 0 ? Math.round((e.reduce((acc, l) => acc + (l.comfort || 3), 0) / e.length) * 10) / 10 : 0;

    // Calculate streak (consecutive days of wearing from last element backwards)
    let streak = 0;
    for (let i = logs.length - 1; i >= 0 && Number(logs[i].wear_duration) > 0; i--) {
      streak++;
    }

    // Recent 7 days calculations
    const recent7 = logs.slice(-7);
    const weekWornLogs = recent7.filter(l => Number(l.wear_duration) > 0);
    const weekWorn = weekWornLogs.length;
    const weekAvg = weekWorn > 0 ? Math.round((recent7.reduce((acc, l) => acc + Number(l.wear_duration), 0) / weekWorn) * 10) / 10 : 0;

    res.json({
      code: 0,
      message: 'success',
      data: {
        totalDays,
        wornDays,
        compliance,
        avgDuration,
        avgComfort,
        streak,
        weekWorn,
        weekAvg
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取佩戴汇总失败' });
  }
});

// 21.3 WeChat Client Treatment Timeline (GET)
app.get('/api/v1/treatment/timeline', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: [] });
    }
    const params = [req.user.id, patient.id];
    let sql = `SELECT * FROM treatment_timelines WHERE user_id = ? AND (patient_id = ?`;
    if (patient.relation === 'self') {
      sql += ` OR patient_id IS NULL`;
    }
    sql += `)`;
    if (req.query.treatmentId) {
      sql += ` AND (treatment_id = ? OR treatment_id IS NULL)`;
      params.push(req.query.treatmentId);
    }
    sql += ` ORDER BY event_date DESC, id DESC`;
    const timelines = await query(sql, params);
    const formatTime = (d) => {
      if (!d) return '';
      const date = new Date(d);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const r = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${r}`;
    };
    res.json({
      code: 0,
      message: 'success',
      data: timelines.map(t => ({
        id: t.id.toString(),
        date: formatTime(t.event_date),
        type: t.event_type || 'visit',
        title: t.event_title,
        description: t.event_desc || '',
        doctorName: t.doctor_name || '',
        icon: t.icon || '',
        color: t.color || '#3B6BF5'
      }))
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取时间线失败' });
  }
});

// 21.4 WeChat Client Wearing Check-in (POST)
app.post('/api/v1/treatment/wearing', authenticateWxToken, async (req, res) => {
  const { date, wearDuration, comfort, note, ahiIndex } = req.body;
  if (!date || wearDuration === undefined) {
    return res.status(400).json({ code: 400, message: '打卡日期和时长不能为空' });
  }
  const durationVal = Number(wearDuration);
  const comfortVal = comfort === undefined || comfort === null ? 3 : Number(comfort);
  if (!Number.isFinite(durationVal) || durationVal < 0 || durationVal > 24) {
    return res.status(400).json({ code: 400, message: '佩戴时长必须在0至24小时之间' });
  }
  if (!Number.isInteger(comfortVal) || comfortVal < 1 || comfortVal > 5) {
    return res.status(400).json({ code: 400, message: '舒适度评分必须在1至5之间' });
  }
  if (new Date(`${date}T00:00:00`).getTime() > Date.now()) {
    return res.status(400).json({ code: 400, message: '不能提交未来日期的佩戴记录' });
  }
  try {
    const patient = await resolveUserPatient(req, 'body');
    if (!patient) {
      return res.status(404).json({ code: 404, message: '患者档案未找到' });
    }
    const tr = await resolveTreatmentForPatient(patient, req.body.treatmentId);
    if (!tr) {
      return res.status(404).json({ code: 404, message: '当前无活跃治疗，无法打卡' });
    }

    // Check if check-in log already exists for this date
    const existingLog = await get(`SELECT id FROM wearing_logs WHERE treatment_id = ? AND date = ? AND source = 'mini_program_checkin'`, [tr.id, date]);
    if (existingLog) {
      await run(
        `UPDATE wearing_logs SET wear_duration = ?, comfort = ?, ahi_index = ?, note = ?, source = 'mini_program_checkin' WHERE id = ?`,
        [durationVal, comfortVal, ahiIndex ?? null, note || null, existingLog.id]
      );
    } else {
      await run(
        `INSERT INTO wearing_logs (treatment_id, date, wear_duration, comfort, ahi_index, note, source) VALUES (?, ?, ?, ?, ?, ?, 'mini_program_checkin')`,
        [tr.id, date, durationVal, comfortVal, ahiIndex ?? null, note || null]
      );
    }

    res.json({ code: 0, message: '打卡成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '佩戴打卡失败' });
  }
});

// 21.5 WeChat Client Order List (GET)
app.get('/api/v1/orders', authenticateWxToken, async (req, res) => {
  const { status } = req.query;
  try {
    await closeExpiredPendingOrders(req.user.id);
    let sql = `SELECT * FROM orders WHERE user_id = ?`;
    const params = [req.user.id];
    if (status && status !== 'all') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;
    const list = await query(sql, params);

    const orderIds = list.map(o => o.id);
    let allOrderItems = [];
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      allOrderItems = await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
    }

        const orderItemsMap = {};
    allOrderItems.forEach(item => {
      if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
      orderItemsMap[item.order_id].push(item);
    });

    const formattedList = list.map(order => {
      let address = {};
      try {
        address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : (order.shipping_address || {});
      } catch (e) {}

      let items = orderItemsMap[order.id] || [];
      if (items.length === 0) {
        if (order.type === 'appointment_deposit' || order.type === 'appointment') {
          items = [{
            id: 0,
            product_id: 8,
            product_name: '就诊预约定金',
            product_image: '/static/product/screening.png',
            price: order.pay_amount,
            quantity: 1
          }];
        } else {
          items = [{
            id: 0,
            product_id: 1,
            product_name: '医疗商品服务',
            product_image: '/static/product/hj-mad-03.png',
            price: order.pay_amount,
            quantity: 1
          }];
        }
      }

      return {
        id: order.id.toString(),
        orderNo: order.order_no,
        type: order.type,
        totalAmount: order.total_amount,
        discountAmount: order.discount_amount,
        payAmount: order.pay_amount,
        payMethod: order.pay_method,
        payAt: order.pay_at,
        status: order.status,
        shippingAddress: address,
        createdAt: order.created_at,
        items: items.map(item => ({
          id: item.id.toString(),
          productId: item.product_id.toString(),
          productName: item.product_name,
          productImage: item.product_image,
          price: item.price,
          quantity: item.quantity
        }))
      };
    });

    res.json({ code: 0, message: 'success', data: formattedList });
  } catch (error) {
    console.error('Get client orders error:', error);
    res.status(500).json({ code: 500, message: '获取订单列表失败' });
  }
});

// 21.6 WeChat Client Order Detail (GET)
app.get('/api/v1/orders/:id', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    await closeExpiredPendingOrders(req.user.id);
    const order = await get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单未找到' });
    }
    let items = await query(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
    if (items.length === 0) {
      if (order.type === 'appointment_deposit' || order.type === 'appointment') {
        items = [{
          id: 0,
          product_id: 8,
          product_name: '就诊预约定金',
          product_image: '/static/product/screening.png',
          price: order.pay_amount,
          quantity: 1
        }];
      } else {
        items = [{
          id: 0,
          product_id: 1,
          product_name: '医疗商品服务',
          product_image: '/static/product/hj-mad-03.png',
          price: order.pay_amount,
          quantity: 1
        }];
      }
    }

    let address = {};
    try {
      address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : (order.shipping_address || {});
    } catch (e) {}

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: order.id.toString(),
        orderNo: order.order_no,
        type: order.type,
        totalAmount: order.total_amount,
        discountAmount: order.discount_amount,
        payAmount: order.pay_amount,
        payMethod: order.pay_method,
        payAt: order.pay_at,
        status: order.status,
        shippingAddress: address,
        createdAt: order.created_at,
        items: items.map(item => ({
          id: item.id.toString(),
          productId: item.product_id.toString(),
          productName: item.product_name,
          productImage: item.product_image,
          price: item.price,
          quantity: item.quantity
        }))
      }
    });
  } catch (error) {
    console.error('Get client order detail error:', error);
    res.status(500).json({ code: 500, message: '获取订单详情失败' });
  }
});

// 21.6.5 Order Logistics Tracking (GET)
app.get('/api/v1/orders/:id/logistics', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    // Default empty list if not shipped yet
    if (!['shipped', 'completed'].includes(order.status)) {
      return res.json({
        code: 0,
        message: '暂无物流轨迹信息',
        data: { list: [] }
      });
    }

    const company = order.express_company || '顺丰速运';
    const tracking = order.tracking_number || 'SF16038472918';

    // Generate realistic logistics events
    const list = [
      { time: '2026-07-02 10:00:00', status: '已签收', desc: `【深圳市】快件已签收，签收人：凭提取码签收。感谢您使用${company}，期待再次为您服务。` },
      { time: '2026-07-02 08:30:00', status: '派送中', desc: `【深圳市】快递员正在为您派件，联系电话：13812345678。` },
      { time: '2026-07-02 05:00:00', status: '运输中', desc: `【深圳市】快件已到达 深圳宝安分拨中心。` },
      { time: '2026-07-01 22:30:00', status: '运输中', desc: `【广州市】快件已从 广州黄埔转运中心 发出，正运往 深圳宝安分拨中心。` },
      { time: '2026-07-01 18:00:00', status: '已揽收', desc: `【广州市】快递员已揽收。` },
      { time: '2026-07-01 17:00:00', status: '已揽收', desc: `商家已发货，运单号：${tracking}，已通知快递揽件。` }
    ];

    // If order status is shipped (not completed yet), remove the sign-off event
    if (order.status === 'shipped') {
      list.shift(); // Remove the "已签收" event
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        company,
        trackingNumber: tracking,
        list
      }
    });
  } catch (error) {
    console.error('Get order logistics error:', error);
    res.status(500).json({ code: 500, message: '获取物流信息失败' });
  }
});

// 21.7 WeChat Client Create Order (POST)
app.post('/api/v1/orders', authenticateWxToken, async (req, res) => {
  const { items, shippingAddress, couponId } = req.body;
  const deliveryMethod = shippingAddress?.deliveryMethod === 'pickup' || shippingAddress?.deliveryMethod === 'offline'
    ? 'pickup'
    : 'online';
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ code: 400, message: '商品列表不能为空' });
  }
  if (
    !shippingAddress ||
    !String(shippingAddress.contactName || '').trim() ||
    !/^1\d{10}$/.test(String(shippingAddress.phone || '')) ||
    (deliveryMethod === 'online' && !String(shippingAddress.detailAddress || '').trim()) ||
    (deliveryMethod === 'pickup' && !shippingAddress.storeId)
  ) {
    return res.status(400).json({ code: 400, message: deliveryMethod === 'online' ? '请填写完整且有效的收货地址' : '请选择自提门店并填写取货联系人信息' });
  }

  try {
    const productIds = items.map(item => item.productId);
    const placeholders = productIds.map(() => '?').join(',');
    const dbProducts = await query(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds);
    const productMap = {};
    dbProducts.forEach(p => {
      productMap[p.id] = p;
    });

    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
        return res.status(400).json({ code: 400, message: '商品数量不正确' });
      }
      const dbProduct = productMap[item.productId];
      if (!dbProduct) {
        return res.status(400).json({ code: 400, message: `商品 ID ${item.productId} 不存在` });
      }
      if (dbProduct.status !== 'on') {
        return res.status(400).json({ code: 400, message: `商品 ${dbProduct.name} 已下架` });
      }
      if (dbProduct.stock < quantity) {
        return res.status(400).json({ code: 400, message: `商品 ${dbProduct.name} 库存不足` });
      }
      totalAmount += dbProduct.price * quantity;
      validatedItems.push({
        product: dbProduct,
        quantity,
        price: dbProduct.price,
        isDistributionSnapshot: Number(dbProduct.is_distribution || 0) === 1 ? 1 : 0,
        commissionRateSnapshot: Number(dbProduct.commission_rate || 0)
      });
    }

    let discountAmount = 0;
    if (couponId) {
      const userCoupon = await get(
        `SELECT uc.*, c.value as val, c.min_spend
         FROM user_coupons uc
         JOIN coupons c ON uc.coupon_id = c.id
         WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 'active'
           AND c.status = 'active'
           AND (c.valid_start IS NULL OR c.valid_start <= CURDATE())
           AND (c.valid_end IS NULL OR c.valid_end >= CURDATE())`,
        [couponId, req.user.id]
      );
      if (!userCoupon) {
        return res.status(400).json({ code: 400, message: '优惠券不可用' });
      }
      if (Number(userCoupon.min_spend || 0) > totalAmount) {
        return res.status(400).json({ code: 400, message: '订单金额未达到优惠券使用门槛' });
      }
      discountAmount = Math.min(Number(userCoupon.val || 0), totalAmount);
    }
    const payAmount = Math.max(0, totalAmount - discountAmount);
    const orderType = deliveryMethod === 'online' ? 'online' : 'offline';
    let pickupStore = null;
    if (deliveryMethod === 'pickup') {
      pickupStore = await get(`SELECT id, name, address, phone, open_time, close_time FROM stores WHERE id = ? AND status = 'open'`, [shippingAddress.storeId]);
      if (!pickupStore) {
        return res.status(400).json({ code: 400, message: '自提门店不可用' });
      }
    }
    const orderShippingAddress = {
      ...shippingAddress,
      deliveryMethod,
      detailAddress: deliveryMethod === 'online' ? shippingAddress.detailAddress : pickupStore.address,
      storeId: pickupStore ? pickupStore.id : null,
      storeName: pickupStore ? pickupStore.name : '',
      storePhone: pickupStore ? pickupStore.phone : '',
      storeBusinessHours: pickupStore ? `${String(pickupStore.open_time || '').slice(0, 5)}-${String(pickupStore.close_time || '').slice(0, 5)}` : ''
    };

    const orderNo = `OD2026${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

    const newOrderId = await transaction(async (conn) => {
      // 1. Insert order
      const [orderResult] = await conn.execute(
        `INSERT INTO orders (order_no, user_id, type, total_amount, discount_amount, coupon_id, pay_amount, pay_method, pay_at, status, shipping_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'wechat', NULL, 'pending', ?)`,
        [orderNo, req.user.id, orderType, totalAmount, discountAmount, couponId || null, payAmount, JSON.stringify(orderShippingAddress)]
      );
      const insertedId = orderResult.insertId;

      // 2. Insert order items & Update product stock
      for (const item of validatedItems) {
        await conn.execute(
          `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, is_distribution_snapshot, commission_rate_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insertedId,
            item.product.id,
            item.product.name,
            item.product.image_url,
            item.price,
            item.quantity,
            item.isDistributionSnapshot,
            item.commissionRateSnapshot
          ]
        );

        await conn.execute(
          `UPDATE products SET stock = stock - ?, sales_count = sales_count + ? WHERE id = ?`,
          [item.quantity, item.quantity, item.product.id]
        );
      }

      // 3. Consume coupon if used
      if (couponId) {
        await conn.execute(
          `UPDATE user_coupons SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [couponId]
        );
      }

      return insertedId;
    });

    res.json({
      code: 0,
      message: '订单创建成功',
      data: {
        id: newOrderId.toString(),
        orderNo,
        payAmount
      }
    });
  } catch (error) {
    console.error('Create client order error:', error);
    res.status(500).json({ code: 500, message: '订单创建失败' });
  }
});

// 21.8 WeChat Client Pay Order (POST)
app.post('/api/v1/orders/:id/pay', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '订单非待支付状态' });
    }

    const payParams = await buildPaymentParams(order.order_no, order.pay_amount, order.order_no, req.user.openid);

    res.json({
      code: 0,
      message: 'success',
      data: {
        orderId: order.id.toString(),
        orderNo: order.order_no,
        payAmount: order.pay_amount,
        ...payParams
      }
    });
  } catch (error) {
    console.error('Create client order payment error:', error);
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message || '生成支付参数失败' });
  }
});

// 21.80 WeChat Client Confirm Order Payment (POST)
app.post('/api/v1/orders/:id/confirm-pay', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '订单非待支付状态' });
    }

    await transaction(async (conn) => {
      await finalizePaidProductOrder(conn, order);
    });

    res.json({ code: 0, message: '支付同步成功' });
  } catch (error) {
    console.error('Confirm client order payment error:', error);
    res.status(500).json({ code: 500, message: '同步支付状态失败' });
  }
});

app.post('/api/v1/orders/pay-callback', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    if (!body || !body.resource) {
      return res.status(400).json({ code: 'FAIL', message: '回调参数缺失' });
    }
    const payload = decryptWechatPayResource(body.resource);
    if (payload.trade_state !== 'SUCCESS') {
      return res.json({ code: 'SUCCESS', message: 'ignored' });
    }
    const order = await get(`SELECT * FROM orders WHERE order_no = ?`, [payload.out_trade_no]);
    if (!order) {
      return res.status(404).json({ code: 'FAIL', message: '订单不存在' });
    }
    if (order.status !== 'pending') {
      return res.json({ code: 'SUCCESS', message: 'success' });
    }
    await transaction(async (conn) => {
      await finalizePaidProductOrder(conn, order);
    });
    res.json({ code: 'SUCCESS', message: 'success' });
  } catch (error) {
    console.error('Wechat order pay callback error:', error);
    res.status(error.statusCode || 500).json({ code: 'FAIL', message: error.message || '支付回调处理失败' });
  }
});

// 21.81 WeChat Client Cancel Order (POST)
app.post('/api/v1/orders/:id/cancel', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '只能取消待支付状态的订单' });
    }

    await transaction(async (conn) => {
      // 1. Update order status to cancelled
      await conn.execute(
        `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      // 2. Return product stock
      const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
      for (const item of items) {
        await conn.execute(
          `UPDATE products SET stock = stock + ?, sales_count = GREATEST(0, sales_count - ?) WHERE id = ?`,
          [item.quantity, item.quantity, item.product_id]
        );
      }

      // 3. Return coupon if used
      if (order.coupon_id) {
        await conn.execute(
          `UPDATE user_coupons SET status = 'active', used_at = NULL WHERE id = ?`,
          [order.coupon_id]
        );
      }

      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '订单已取消', ?)`,
        [req.user.id, `您的订单 ${order.order_no} 已取消，库存和优惠券已恢复。`]
      );
    });

    res.json({ code: 0, message: '订单取消成功' });
  } catch (error) {
    console.error('Cancel client order error:', error);
    res.status(500).json({ code: 500, message: '订单取消失败' });
  }
});

// 21.82 WeChat Client Confirm Receipt (POST)
app.post('/api/v1/orders/:id/confirm-receipt', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.status !== 'shipped') {
      return res.status(400).json({ code: 400, message: '只能确认已发货的订单' });
    }

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '订单已完成', ?)`,
        [req.user.id, `您已确认收到订单 ${order.order_no} 的商品，感谢您的购买。`]
      );

      const sysSetting = await get(`SELECT key_value FROM system_settings WHERE key_name = 'distribution_settle_days'`);
      const settleDays = parseInt(sysSetting?.key_value, 10);
      const days = Number.isInteger(settleDays) && settleDays >= 0 ? settleDays : 7;
      await conn.execute(
        `UPDATE distribution_orders SET lock_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY) WHERE order_id = ?`,
        [days, id]
      );
    });

    res.json({ code: 0, message: '确认收货成功' });
  } catch (error) {
    console.error('Confirm receipt error:', error);
    res.status(500).json({ code: 500, message: '确认收货失败' });
  }
});

// 21.83 WeChat Client Apply Refund (POST)
app.post('/api/v1/orders/:id/refund', authenticateWxToken, async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!reason) {
    return res.status(400).json({ code: 400, message: '请选择退款原因' });
  }
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (!['paid', 'shipping', 'shipped'].includes(order.status)) {
      return res.status(400).json({ code: 400, message: '当前状态不支持申请退款' });
    }

    await transaction(async (conn) => {
      let address = {};
      try {
        address = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address || '{}') : (order.shipping_address || {});
      } catch (error) {}
      address.refund_from_status = order.status;
      address.refund_reason = escapeHtml(reason);
      address.refund_description = description ? escapeHtml(description).slice(0, 300) : '';
      address.refund_applied_at = new Date().toISOString();
      await conn.execute(
        `UPDATE orders SET status = 'refunding', shipping_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [JSON.stringify(address), id]
      );

      const commissions = await query(
        `SELECT distributor_id, commission_amount, status FROM distribution_orders WHERE order_id = ? AND status != 'refunded'`,
        [id]
      );
      const distributorIds = new Set();
      for (const commission of commissions) {
        distributorIds.add(commission.distributor_id);
        await conn.execute(
          `UPDATE distribution_orders SET status = 'refunded' WHERE order_id = ? AND distributor_id = ?`,
          [id, commission.distributor_id]
        );
        await conn.execute(
          `UPDATE distributors
           SET total_commission = GREATEST(0, total_commission - ?),
               available_commission = CASE WHEN ? = 'settled' THEN GREATEST(0, available_commission - ?) ELSE available_commission END
           WHERE id = ?`,
          [commission.commission_amount, commission.status, commission.commission_amount, commission.distributor_id]
        );
      }
      for (const distributorId of distributorIds) {
        await refreshDistributorLevel(distributorId, conn);
      }
      await conn.execute(
        `INSERT INTO user_notifications (user_id, title, content)
         VALUES (?, '退款申请已提交', ?)`,
        [req.user.id, `订单 ${order.order_no} 的退款申请已提交，审核结果会通过通知中心告知您。`]
      );
    });

    res.json({ code: 0, message: '已提交退款申请' });
  } catch (error) {
    console.error('Apply refund error:', error);
    res.status(500).json({ code: 500, message: '退款申请失败' });
  }
});

// 21.b1 WeChat Client Bind Distribution Relationship (POST)
app.post('/api/v1/distribution/bind', authenticateWxToken, async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) {
    return res.status(400).json({ code: 400, message: '邀请码不能为空' });
  }

  try {
    const promoter = await get(`SELECT user_id FROM distributors WHERE invite_code = ?`, [inviteCode]);
    if (!promoter) {
      return res.status(400).json({ code: 400, message: '无效的邀请码' });
    }

    const parentUserId = promoter.user_id;
    const childUserId = req.user.id;

    if (parentUserId === childUserId) {
      return res.json({
        code: 0,
        message: '当前账号与邀请人相同，已忽略本次绑定',
        data: { status: 'ignored_self' }
      });
    }

    const existing = await get(`SELECT id FROM distribution_relationships WHERE child_user_id = ?`, [childUserId]);
    if (existing) {
      return res.json({
        code: 0,
        message: '当前账号已绑定过推荐关系，已忽略本次绑定',
        data: { status: 'already_bound' }
      });
    }

    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, 1)`,
        [parentUserId, childUserId]
      );

      const grandParent = await get(
        `SELECT parent_user_id FROM distribution_relationships WHERE child_user_id = ? AND level = 1`,
        [parentUserId]
      );
      if (grandParent) {
        await conn.execute(
          `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, 2)`,
          [grandParent.parent_user_id, childUserId]
        );
      }

      await ensureDistributor(childUserId, conn);
    });

    res.json({ code: 0, message: '推荐关系绑定成功', data: { status: 'bound' } });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.json({
        code: 0,
        message: '当前账号已绑定过推荐关系，已忽略本次绑定',
        data: { status: 'already_bound' }
      });
    }
    console.error('Bind relationship error:', error);
    res.status(500).json({ code: 500, message: '绑定推荐人失败' });
  }
});

// 21b. WeChat Client Distribution (分销管理)
app.get('/api/v1/distribution/info', authenticateWxToken, async (req, res) => {
  try {
    const summary = await getDistributionSummary(req.user.id);
    res.json({ code: 0, data: summary });
  } catch (error) {
    console.error('Get distribution info error:', error);
    res.status(500).json({ code: 500, message: '获取分销信息失败' });
  }
});

app.get('/api/v1/distribution/commission-stats', authenticateWxToken, async (req, res) => {
  try {
    const summary = await getDistributionSummary(req.user.id);
    res.json({
      code: 0,
      message: 'success',
      data: {
        isDistributor: summary.isDistributor,
        totalCommission: summary.totalCommission,
        availableCommission: summary.availableCommission,
        frozenCommission: summary.frozenCommission,
        withdrawnAmount: summary.withdrawnAmount
      }
    });
  } catch (error) {
    console.error('Get distribution commission stats error:', error);
    res.status(500).json({ code: 500, message: '获取佣金统计失败' });
  }
});

app.get('/api/v1/distribution/invite-info', authenticateWxToken, async (req, res) => {
  try {
    const summary = await getDistributionSummary(req.user.id);
    if (!summary.isDistributor) {
      return res.json({
        code: 0,
        message: 'success',
        data: {
          isDistributor: false,
          inviteCode: '',
          inviteQrCode: '',
          sharePath: '/pages/distribution/center/index',
          shareTitle: '邀请好友体验鼾静健康诊所'
        }
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        isDistributor: true,
        inviteCode: summary.inviteCode,
        inviteQrCode: summary.inviteQrCode,
        sharePath: `/pages/index/index?inviteCode=${summary.inviteCode}`,
        shareTitle: '邀请你体验鼾静健康诊所，扫码下单可享专业睡眠健康服务'
      }
    });
  } catch (error) {
    console.error('Get distribution invite info error:', error);
    res.status(500).json({ code: 500, message: '获取邀请信息失败' });
  }
});

app.get('/api/v1/distribution/team', authenticateWxToken, async (req, res) => {
  try {
    const parentUserId = req.user.id;
    const currentDistributor = await get(`SELECT id FROM distributors WHERE user_id = ?`, [parentUserId]);
    if (!currentDistributor) {
      return res.json({ code: 0, message: 'success', data: { list: [], total: 0 } });
    }
    const relationships = await query(
      `SELECT r.child_user_id, u.nickname, u.avatar_url, u.created_at as joined_at, d.level, d.id as distributor_id
       FROM distribution_relationships r
       JOIN users u ON r.child_user_id = u.id
       LEFT JOIN distributors d ON u.id = d.user_id
       WHERE r.parent_user_id = ?`,
      [parentUserId]
    );

    const list = [];

    const distributorIds = relationships.map(r => r.distributor_id).filter(Boolean);
    const childUserIds = relationships.map(r => r.child_user_id);

    let allStats = [];
    let allPromoted = [];

    if (distributorIds.length > 0) {
      const placeholders = distributorIds.map(() => '?').join(',');
      allStats = await query(
        `SELECT distributor_id, COUNT(*) as count, SUM(order_amount) as sales
         FROM distribution_orders
         WHERE distributor_id IN (${placeholders})
         GROUP BY distributor_id`,
        distributorIds
      );
    }

    if (childUserIds.length > 0) {
      const placeholders = childUserIds.map(() => '?').join(',');
      allPromoted = await query(
        `SELECT parent_user_id, child_user_id
         FROM distribution_relationships
         WHERE parent_user_id IN (${placeholders})`,
        childUserIds
      );
    }

    const statsMap = {};
    allStats.forEach(s => {
      statsMap[s.distributor_id] = { count: s.count, sales: s.sales };
    });

    const promotedPatientsMap = {};
    const allPromotedPatientIdsSet = new Set();
    allPromoted.forEach(p => {
      if (!promotedPatientsMap[p.parent_user_id]) promotedPatientsMap[p.parent_user_id] = [];
      promotedPatientsMap[p.parent_user_id].push(p.child_user_id);
      allPromotedPatientIdsSet.add(p.child_user_id);
    });

    const allPromotedPatientIds = Array.from(allPromotedPatientIdsSet);
    let paidOrdersSet = new Set();
    let completedAptsSet = new Set();
    let anyAptsSet = new Set();

    if (allPromotedPatientIds.length > 0) {
      const placeholders = allPromotedPatientIds.map(() => '?').join(',');

      const paidOrders = await query(
        `SELECT DISTINCT user_id FROM orders WHERE user_id IN (${placeholders}) AND pay_at IS NOT NULL`,
        allPromotedPatientIds
      );
      paidOrders.forEach(o => paidOrdersSet.add(o.user_id));

      const completedApts = await query(
        `SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders}) AND status = 'completed'`,
        allPromotedPatientIds
      );
      completedApts.forEach(a => completedAptsSet.add(a.user_id));

      const anyApts = await query(
        `SELECT DISTINCT user_id FROM appointments WHERE user_id IN (${placeholders})`,
        allPromotedPatientIds
      );
      anyApts.forEach(a => anyAptsSet.add(a.user_id));
    }

    for (const rel of relationships) {
      let orderCount = 0;
      let totalSales = 0;
      if (rel.distributor_id && statsMap[rel.distributor_id]) {
        orderCount = statsMap[rel.distributor_id].count || 0;
        totalSales = statsMap[rel.distributor_id].sales || 0;
      }

      const promotedPatients = promotedPatientsMap[rel.child_user_id] || [];

      let status = null;
      let statusText = '';
      let statusClass = '';

      if (promotedPatients.length > 0) {
        const hasPaid = promotedPatients.some(id => paidOrdersSet.has(id));
        if (hasPaid) {
          status = 'paid';
          statusText = '已成交';
          statusClass = 'paid';
        } else {
          const hasCompleted = promotedPatients.some(id => completedAptsSet.has(id));
          if (hasCompleted) {
            status = 'unpaid';
            statusText = '未成交';
            statusClass = 'unpaid';
          } else {
            const hasAny = promotedPatients.some(id => anyAptsSet.has(id));
            if (hasAny) {
              status = 'booked';
              statusText = '已预约';
              statusClass = 'booked';
            }
          }
        }
      } else {
        status = null;
        statusText = '';
        statusClass = '';
      }

      list.push({
        id: rel.child_user_id.toString(),
        nickname: rel.nickname,
        avatar: rel.avatar_url || '',
        level: rel.level || 'silver',
        orderCount: orderCount,
        totalSales: totalSales,
        joinedAt: formatDate(rel.joined_at),
        status: status,
        statusText: statusText,
        statusClass: statusClass
      });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        list,
        total: list.length
      }
    });
  } catch (error) {
    console.error('get team members error:', error);
    res.status(500).json({ code: 500, message: '获取团队成员失败' });
  }
});

app.get('/api/v1/distribution/commissions', authenticateWxToken, async (req, res) => {
  try {
    await settleEligibleDistributionCommissions(req.user.id);
    const dist = await get(`SELECT id FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.json({ code: 0, data: { list: [] } });
    }
    const list = await query(
      `SELECT
         do.id,
         do.order_id,
         do.buyer_name,
         do.order_amount,
         do.commission_amount,
         do.commission_level,
         do.status,
         do.created_at,
         do.settled_at,
         MAX(o.order_no) as order_no,
         MAX(oi.product_name) as product_name,
         MAX(oi.product_image) as product_image
       FROM distribution_orders do
       JOIN orders o ON do.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE do.distributor_id = ?
       GROUP BY do.id
       ORDER BY do.created_at DESC`,
      [dist.id]
    );
    res.json({
      code: 0,
      data: {
        list: list.map(item => ({
          id: item.id.toString(),
          orderId: item.order_id.toString(),
          orderNo: item.order_no,
          buyerName: item.buyer_name,
          productName: item.product_name || '订单佣金',
          productImage: item.product_image || '',
          orderAmount: item.order_amount,
          commission: item.commission_amount,
          commissionLevel: item.commission_level,
          status: item.status,
          createdAt: item.created_at,
          settledAt: item.settled_at
        }))
      }
    });
  } catch (error) {
    console.error('Get distribution commissions error:', error);
    res.status(500).json({ code: 500, message: '获取佣金明细失败' });
  }
});

app.get('/api/v1/distribution/orders', authenticateWxToken, async (req, res) => {
  try {
    await settleEligibleDistributionCommissions(req.user.id);
    const dist = await get(`SELECT id FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.json({ code: 0, data: { list: [] } });
    }
    const list = await query(
      `SELECT
         do.id,
         do.order_id,
         do.buyer_name,
         do.order_amount,
         do.commission_amount,
         do.commission_level,
         do.status,
         do.created_at,
         do.settled_at,
         MAX(o.order_no) as order_no,
         MAX(oi.product_name) as product_name,
         MAX(oi.product_image) as product_image
       FROM distribution_orders do
       JOIN orders o ON do.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE do.distributor_id = ?
       GROUP BY do.id
       ORDER BY do.created_at DESC`,
      [dist.id]
    );
    res.json({
      code: 0,
      data: {
        list: list.map(item => ({
          id: item.id.toString(),
          orderId: item.order_id.toString(),
          orderNo: item.order_no,
          buyerName: item.buyer_name,
          productName: item.product_name || '订单佣金',
          productImage: item.product_image || '',
          orderAmount: item.order_amount,
          commission: item.commission_amount,
          commissionLevel: item.commission_level,
          status: item.status,
          createdAt: item.created_at,
          settledAt: item.settled_at
        }))
      }
    });
  } catch (error) {
    console.error('Get distribution orders error:', error);
    res.status(500).json({ code: 500, message: '获取推广订单失败' });
  }
});

app.get('/api/v1/distribution/products', async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM products WHERE is_distribution = 1 AND status = 'on'`
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(p => ({
          id: p.id.toString(),
          name: p.name,
          image: p.image_url,
          price: p.price,
          originalPrice: p.original_price,
          commissionRate: p.commission_rate,
          commission: Math.round(p.price * (p.commission_rate / 100)),
          sales: p.sales_count
        })),
        total: list.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取分销产品失败' });
  }
});

app.get('/api/v1/distribution/rules', async (req, res) => {
  const settleDays = await getDistributionSettleDays();
  res.json({
    code: 0,
    message: 'success',
    data: {
      rules: `
## 鼾静健康·推广员计划

### 一、推广员等级
| 等级 | 升级条件 | 佣金比例 |
|------|---------|---------|
| 银牌推广员 | 注册并开通即可 | 一级10% / 二级3% |
| 金牌推广员 | 累计直推订单≥10单 | 一级15% / 二级5% |
| 钻石推广员 | 累计直推订单≥50单 | 一级20% / 二级8% |

### 二、佣金规则
1. 一级佣金：优先按商品配置佣金比例计算，未配置时按推广员等级比例计算
2. 二级佣金：按您的推广员等级对应二级佣金比例计算
3. 佣金状态：下单后冻结，订单完成满 ${settleDays} 天自动转为可提现
4. 退款/撤单：对应佣金自动撤销，已结算金额会从可提现余额中冲抵

### 三、推广方式
1. 分享小程序商品页给微信好友/微信群
2. 通过邀请码或分享路径绑定推荐关系
3. 生成专属海报，引导好友进入小程序咨询/下单

### 四、注意事项
- 禁止虚假宣传、夸大疗效
- 禁止诱导用户进行不必要的消费
- 违规推广将冻结佣金并取消推广资格

### 五、提现规则
- 最低提现金额：¥${(DISTRIBUTION_MIN_WITHDRAW_AMOUNT / 100).toFixed(0)}
- 微信零钱：手续费 0%
- 银行卡：手续费 1%，最低 1 元
`
    }
  });
});

app.post('/api/v1/distribution/withdraw', authenticateWxToken, async (req, res) => {
  const { amount, method = 'wechat', bankInfo } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ code: 400, message: '提现金额无效' });
  }
  try {
    await settleEligibleDistributionCommissions(req.user.id);
    const dist = await get(`SELECT * FROM distributors WHERE user_id = ?`, [req.user.id]);
    if (!dist) {
      return res.status(400).json({ code: 400, message: '您不是推广员' });
    }
    if (!['wechat', 'bank'].includes(method)) {
      return res.status(400).json({ code: 400, message: '提现方式不支持' });
    }
    if (amount < DISTRIBUTION_MIN_WITHDRAW_AMOUNT) {
      return res.status(400).json({ code: 400, message: `最低提现金额为${(DISTRIBUTION_MIN_WITHDRAW_AMOUNT / 100).toFixed(0)}元` });
    }
    if (dist.available_commission < amount) {
      return res.status(400).json({ code: 400, message: '余额不足' });
    }

    if (method === 'bank') {
      const bankName = String(bankInfo?.bankName || '').trim();
      const accountName = String(bankInfo?.accountName || '').trim();
      const accountNo = String(bankInfo?.accountNo || '').trim();
      if (!bankName || !accountName || !accountNo) {
        return res.status(400).json({ code: 400, message: '请填写完整的银行卡信息' });
      }
    }

    const fee = method === 'bank' ? Math.max(Math.round(amount * 0.01), 100) : 0;
    const actualAmount = amount - fee;
    const accountInfo = method === 'bank'
      ? JSON.stringify({
          method,
          bankName: bankInfo.bankName,
          accountName: bankInfo.accountName,
          accountNo: String(bankInfo.accountNo).replace(/^(\d{4})\d+(\d{4})$/, '$1********$2')
        })
      : JSON.stringify({ method, label: '微信零钱' });

    const result = await run(
      `INSERT INTO withdraw_records (user_id, amount, fee, actual_amount, status, account_info)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [req.user.id, amount, fee, actualAmount, accountInfo]
    );

    const recordId = result.id;

    await run(
      `UPDATE distributors SET available_commission = available_commission - ? WHERE user_id = ?`,
      [amount, req.user.id]
    );

    // Simulate asynchronous WeChat Merchant automated transfer to loose change
    if (method === 'wechat') {
      setTimeout(async () => {
        try {
          await run(`UPDATE withdraw_records SET status = 'completed', remark = '微信商家自动打款成功' WHERE id = ?`, [recordId]);
          await run(`UPDATE distributors SET withdrawn_amount = withdrawn_amount + ? WHERE user_id = ?`, [amount, req.user.id]);
          console.log(`[Mock Transfer] Asynchronously paid ¥${(amount / 100).toFixed(2)} to User ID ${req.user.id} loose change.`);
        } catch (err) {
          console.error('[Mock Transfer] Error during async payout:', err);
        }
      }, 3000);
    }

    res.json({
      code: 0,
      message: method === 'wechat' ? '微信提现处理中，资金将在数秒内打入您的零钱' : '申请提现成功，等待管理员审批',
      data: { amount, fee, actualAmount, method }
    });
  } catch (error) {
    console.error('Distribution withdraw error:', error);
    res.status(500).json({ code: 500, message: '申请失败' });
  }
});

app.get('/api/v1/distribution/withdraws', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM withdraw_records WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(item => ({
          id: item.id.toString(),
          amount: item.amount,
          fee: item.fee,
          actualAmount: item.actual_amount,
          accountInfo: (() => {
            try {
              return typeof item.account_info === 'string' ? JSON.parse(item.account_info) : item.account_info;
            } catch (error) {
              return { label: item.account_info };
            }
          })(),
          status: item.status,
          createdAt: item.created_at,
          completedAt: item.completed_at
        }))
      }
    });
  } catch (error) {
    console.error('Get distribution withdraws error:', error);
    res.status(500).json({ code: 500, message: '获取提现记录失败' });
  }
});

app.get('/api/v1/distribution/withdraw-records', authenticateWxToken, async (req, res) => {
  try {
    const list = await query(
      `SELECT * FROM withdraw_records WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        list: list.map(item => ({
          id: item.id.toString(),
          amount: item.amount,
          fee: item.fee,
          actualAmount: item.actual_amount,
          accountInfo: (() => {
            try {
              return typeof item.account_info === 'string' ? JSON.parse(item.account_info) : item.account_info;
            } catch (error) {
              return { label: item.account_info };
            }
          })(),
          status: item.status,
          createdAt: item.created_at,
          completedAt: item.completed_at
        }))
      }
    });
  } catch (error) {
    console.error('Get distribution withdraw records error:', error);
    res.status(500).json({ code: 500, message: '获取提现记录失败' });
  }
});

// 22. WeChat Home Stats (GET)
app.get('/api/v1/home/stats', async (req, res) => {
  try {
    const patientCountRow = await get(`SELECT COUNT(*) as count FROM patients`);
    const storeCountRow = await get(`SELECT COUNT(*) as count FROM stores WHERE status = 'open'`);
    // Calculate satisfaction rate dynamically from average rating in evaluations table
    const avgRatingRow = await get(`SELECT AVG(rating) as avg FROM appointment_evaluations`);
    let satisfaction = 98;
    if (avgRatingRow && avgRatingRow.avg !== null) {
      satisfaction = Math.round((Number(avgRatingRow.avg) / 5) * 100);
    } else {
      const docAvgRow = await get(`SELECT AVG(rating) as avg FROM doctors WHERE status = 1`);
      satisfaction = docAvgRow && docAvgRow.avg ? Math.round((Number(docAvgRow.avg) / 5) * 100) : 98;
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        patientCount: patientCountRow ? patientCountRow.count : 0,
        storeCount: storeCountRow ? storeCountRow.count : 0,
        satisfaction,
        totalPatients: patientCountRow ? patientCountRow.count : 0,
        satisfactionRate: satisfaction
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取首页统计失败' });
  }
});

// 1) 获取与客服的聊天记录
app.get('/api/v1/im/messages', authenticateWxToken, async (req, res) => {
  try {
    const patient = await get(`SELECT id FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!patient) {
      return res.json({ code: 0, message: 'success', data: [] });
    }
    const messages = await query(`
      SELECT id, sender, sender_name as senderName, text, DATE_FORMAT(created_at, '%H:%i') as time, is_read as isRead
      FROM im_messages
      WHERE patient_id = ?
      ORDER BY created_at ASC`,
      [patient.id]
    );
    res.json({ code: 0, message: 'success', data: messages });
  } catch (error) {
    console.error('Client Get IM Messages Error:', error);
    res.status(500).json({ code: 500, message: '获取消息失败' });
  }
});

// 2) 发送消息给客服
app.post('/api/v1/im/send', authenticateWxToken, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ code: 400, message: '消息内容不能为空' });
  }
  try {
    const patient = await get(`SELECT id, name FROM patients WHERE user_id = ? AND relation = 'self'`, [req.user.id]);
    if (!patient) {
      return res.status(404).json({ code: 404, message: '未找到关联患者' });
    }
    await run(`INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) VALUES (?, 'patient', ?, ?, 0)`,
      [patient.id, patient.name, text]
    );

    res.json({ code: 0, message: '发送成功' });
  } catch (error) {
    console.error('Client Send IM Error:', error);
    res.status(500).json({ code: 500, message: '发送失败' });
  }
});

// 3) 获取维护记录
app.get('/api/v1/treatment/device-maintenance', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    const treatment = patient ? await resolveTreatmentForPatient(patient, req.query.treatmentId) : null;
    const params = [req.user.id];
    let sql = `SELECT * FROM device_maintenance WHERE user_id = ?`;
    if (treatment) {
      sql += ` AND (treatment_id = ? OR treatment_id IS NULL)`;
      params.push(treatment.id);
    }
    sql += ` ORDER BY service_date DESC`;
    const records = await query(
      sql,
      params
    );
    const mapped = records.map(r => ({
      id: r.id.toString(),
      treatmentId: r.treatment_id ? r.treatment_id.toString() : '',
      date: formatDate(r.service_date),
      type: r.service_type,
      description: r.description || '',
      cost: r.cost || 0
    }));
    res.json({ code: 0, message: 'success', list: mapped, total: mapped.length });
  } catch (error) {
    console.error('Get device maintenance error:', error);
    res.status(500).json({ code: 500, message: '获取维护记录失败' });
  }
});

// 4) 获取设备反馈记录
app.get('/api/v1/treatment/device-feedback', authenticateWxToken, async (req, res) => {
  try {
    const patient = await resolveUserPatient(req);
    const treatment = patient ? await resolveTreatmentForPatient(patient, req.query.treatmentId) : null;
    const params = [req.user.id];
    let sql = `SELECT * FROM device_feedback WHERE user_id = ?`;
    if (treatment) {
      sql += ` AND (treatment_id = ? OR treatment_id IS NULL)`;
      params.push(treatment.id);
    }
    sql += ` ORDER BY created_at DESC`;
    const records = await query(
      sql,
      params
    );
    const mapped = records.map(r => ({
      id: r.id.toString(),
      treatmentId: r.treatment_id ? r.treatment_id.toString() : '',
      date: formatDate(r.created_at),
      rating: r.rating || 5,
      content: r.feedback_desc,
      status: r.status,
      reply: r.reply_content || null
    }));
    res.json({ code: 0, message: 'success', list: mapped, total: mapped.length });
  } catch (error) {
    console.error('Get device feedback error:', error);
    res.status(500).json({ code: 500, message: '获取反馈记录失败' });
  }
});

// 5) 提交使用反馈
app.post('/api/v1/treatment/feedback', authenticateWxToken, async (req, res) => {
  const { rating, content, patientId, treatmentId } = req.body;
  if (!content) {
    return res.status(400).json({ code: 400, message: '反馈内容不能为空' });
  }
  try {
    const patient = await resolveUserPatient(req, 'body');
    const treatment = patient ? await resolveTreatmentForPatient(patient, treatmentId) : null;
    const result = await run(
      `INSERT INTO device_feedback (user_id, treatment_id, rating, feedback_desc, status) VALUES (?, ?, ?, ?, 'pending')`,
      [req.user.id, treatment ? treatment.id : null, rating || 5, content]
    );
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: result.id.toString(),
        date: formatDate(new Date()),
        rating: rating || 5,
        content: content,
        reply: null
      }
    });
  } catch (error) {
    console.error('Submit device feedback error:', error);
    res.status(500).json({ code: 500, message: '提交反馈失败' });
  }
});

// 6) 获取科普直播列表
app.get('/api/v1/live/rooms', async (req, res) => {
  try {
    const rooms = await query(`SELECT * FROM live_rooms ORDER BY start_time DESC`);
    const mapped = rooms.map(r => {
      let pIds = [];
      try {
        pIds = typeof r.product_ids === 'string' ? JSON.parse(r.product_ids) : (r.product_ids || []);
      } catch (e) {
        pIds = [];
      }
      let tags = [];
      try {
        tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || ['科普', '健康']);
      } catch (e) {
        tags = ['科普', '健康'];
      }
      return {
        id: r.id.toString(),
        title: r.title,
        cover: r.cover_url,
        wechatRoomId: r.wechat_room_id ? String(r.wechat_room_id) : '',
        anchorName: r.anchor_name,
        anchorAvatar: r.anchor_avatar || '',
        status: r.status,
        startTime: r.start_time,
        endTime: r.end_time || null,
        viewerCount: r.viewer_count || 0,
        replayUrl: r.replay_url || '',
        productIds: pIds,
        description: r.description || '',
        tags: tags
      };
    });
    res.json({ code: 0, message: 'success', list: mapped, total: mapped.length });
  } catch (error) {
    console.error('Get live rooms error:', error);
    res.status(500).json({ code: 500, message: '获取直播列表失败' });
  }
});

// 7) 获取直播间详情
app.get('/api/v1/live/rooms/:id', async (req, res) => {
  try {
    const r = await get(`SELECT * FROM live_rooms WHERE id = ?`, [req.params.id]);
    if (!r) {
      return res.status(404).json({ code: 404, message: '直播不存在' });
    }
    let pIds = [];
    try {
      pIds = typeof r.product_ids === 'string' ? JSON.parse(r.product_ids) : (r.product_ids || []);
    } catch (e) {
      pIds = [];
    }
    let tags = [];
    try {
      tags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || ['科普', '健康']);
    } catch (e) {
      tags = ['科普', '健康'];
    }
    res.json({
      code: 0,
      message: 'success',
      data: {
        id: r.id.toString(),
        title: r.title,
        cover: r.cover_url,
        wechatRoomId: r.wechat_room_id ? String(r.wechat_room_id) : '',
        anchorName: r.anchor_name,
        anchorAvatar: r.anchor_avatar || '',
        status: r.status,
        startTime: r.start_time,
        endTime: r.end_time || null,
        viewerCount: r.viewer_count || 0,
        replayUrl: r.replay_url || '',
        productIds: pIds,
        description: r.description || '',
        tags: tags
      }
    });
  } catch (error) {
    console.error('Get live room detail error:', error);
    res.status(500).json({ code: 500, message: '获取直播详情失败' });
  }
});

export default app;
