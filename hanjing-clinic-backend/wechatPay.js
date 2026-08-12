import crypto from 'crypto';
import fs from 'fs';
import { get } from './db.js';

const WECHAT_PAY_HOST = 'https://api.mch.weixin.qq.com';

function normalizePrivateKey(value) {
  if (!value) return '';
  const text = String(value).replace(/\\n/g, '\n').trim();
  if (fs.existsSync(text)) {
    return fs.readFileSync(text, 'utf8');
  }
  return text;
}

async function getSetting(key) {
  const row = await get(`SELECT key_value FROM system_settings WHERE key_name = ?`, [key]);
  return row?.key_value ? String(row.key_value) : '';
}

async function readPayConfig() {
  const [
    appIdSetting,
    mchIdSetting,
    serialNoSetting,
    privateKeySetting,
    apiV3KeySetting,
    apiV2KeySetting,
    notifyUrlSetting,
    appointmentNotifyUrlSetting,
    refundNotifyUrlSetting,
    platformCertSetting
  ] = await Promise.all([
    getSetting('wechat_pay_app_id'),
    getSetting('wechat_pay_mch_id'),
    getSetting('wechat_pay_serial_no'),
    getSetting('wechat_pay_private_key'),
    getSetting('wechat_pay_api_v3_key'),
    getSetting('wechat_pay_api_v2_key'),
    getSetting('wechat_pay_notify_url'),
    getSetting('wechat_pay_appointment_notify_url'),
    getSetting('wechat_pay_refund_notify_url'),
    getSetting('wechat_pay_platform_cert')
  ]);

  const appId = process.env.WECHAT_APP_ID || process.env.WX_APPID || process.env.WX_MINI_APP_ID || appIdSetting || '';
  return {
    appId,
    mchId: process.env.WECHAT_PAY_MCH_ID || mchIdSetting || '',
    serialNo: process.env.WECHAT_PAY_SERIAL_NO || serialNoSetting || '',
    privateKey: normalizePrivateKey(process.env.WECHAT_PAY_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY_PATH || privateKeySetting || ''),
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || apiV3KeySetting || '',
    apiV2Key: process.env.WECHAT_PAY_API_V2_KEY || apiV2KeySetting || '',
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || notifyUrlSetting || '',
    appointmentNotifyUrl: process.env.WECHAT_APPOINTMENT_PAY_NOTIFY_URL || appointmentNotifyUrlSetting || '',
    refundNotifyUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL || refundNotifyUrlSetting || '',
    platformCert: normalizePrivateKey(process.env.WECHAT_PAY_PLATFORM_CERT || process.env.WECHAT_PAY_PLATFORM_CERT_PATH || platformCertSetting || '')
  };
}

export async function getMissingWechatPayConfig(mode = 'v3') {
  const config = await readPayConfig();
  const requiredKeys = mode === 'micropay'
    ? ['appId', 'mchId', 'apiV2Key']
    : ['appId', 'mchId', 'serialNo', 'privateKey', 'apiV3Key', 'notifyUrl'];
  return requiredKeys
    .filter((key) => !config[key]);
}

export function allowDevMockWechatPay() {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const isDevEnv = ['development', 'dev', 'local', 'test'].includes(nodeEnv);
  return isDevEnv && String(process.env.ENABLE_MOCK_WECHAT_PAY || '').trim().toLowerCase() === 'true';
}

async function getWechatPayConfig() {
  const config = await readPayConfig();
  const missing = ['appId', 'mchId', 'serialNo', 'privateKey', 'apiV3Key', 'notifyUrl']
    .filter((key) => !config[key]);
  if (missing.length) {
    const err = new Error(`微信支付配置未完成：${missing.join(', ')}`);
    err.statusCode = 503;
    throw err;
  }
  return config;
}

async function getWechatMicroPayConfig() {
  const config = await readPayConfig();
  const missing = ['appId', 'mchId', 'apiV2Key'].filter((key) => !config[key]);
  if (missing.length) {
    const err = new Error(`微信付款码支付配置未完成：${missing.join(', ')}`);
    err.statusCode = 503;
    throw err;
  }
  return config;
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

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildWechatV2Sign(params, key) {
  const source = Object.keys(params)
    .filter((name) => name !== 'sign' && params[name] !== undefined && params[name] !== null && params[name] !== '')
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');
  return crypto
    .createHmac('sha256', key)
    .update(`${source}&key=${key}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function buildWechatXml(params) {
  const body = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('');
  return `<xml>${body}</xml>`;
}

function decodeWechatXmlValue(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseWechatXml(xml) {
  const result = {};
  const pattern = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    if (match[1] !== 'xml') {
      result[match[1]] = decodeWechatXmlValue(match[2]);
    }
  }
  return result;
}

async function requestWechatPayV2Xml(urlPath, params) {
  const config = await getWechatMicroPayConfig();
  const payload = {
    appid: config.appId,
    mch_id: config.mchId,
    nonce_str: crypto.randomBytes(16).toString('hex'),
    sign_type: 'HMAC-SHA256',
    ...params
  };
  payload.sign = buildWechatV2Sign(payload, config.apiV2Key);

  const response = await fetch(`${WECHAT_PAY_HOST}${urlPath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/xml',
      'Content-Type': 'application/xml'
    },
    body: buildWechatXml(payload)
  });
  const xml = await response.text();
  const result = parseWechatXml(xml);
  if (!response.ok || result.return_code !== 'SUCCESS') {
    const err = new Error(result.return_msg || '微信付款码支付接口请求失败');
    err.statusCode = response.status || 502;
    err.data = result;
    throw err;
  }
  if (result.result_code !== 'SUCCESS') {
    if (result.err_code === 'USERPAYING' || result.err_code === 'SYSTEMERROR') {
      return {
        ...result,
        trade_state: result.err_code,
        out_trade_no: result.out_trade_no || params.out_trade_no
      };
    }
    const err = new Error(result.err_code_des || result.err_code || '微信付款码支付失败');
    err.statusCode = 502;
    err.data = result;
    throw err;
  }
  return {
    ...result,
    trade_state: 'SUCCESS',
    transaction_id: result.transaction_id,
    out_trade_no: result.out_trade_no || params.out_trade_no
  };
}

async function requestWechatPay(method, urlPath, data) {
  const config = await getWechatPayConfig();
  const body = data ? JSON.stringify(data) : '';
  const auth = buildWechatPayAuthorization(method, urlPath, body, config);
  const response = await fetch(`${WECHAT_PAY_HOST}${urlPath}`, {
    method,
    headers: {
      Authorization: auth.authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: method === 'GET' ? undefined : body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(result.message || '微信支付接口请求失败');
    err.statusCode = response.status || 502;
    err.data = result;
    throw err;
  }
  return result;
}

export async function createNativePayment({ subject, amount, outTradeNo, notifyUrl }) {
  if (!amount || Number(amount) <= 0) {
    const err = new Error('支付金额必须大于0');
    err.statusCode = 400;
    throw err;
  }
  const config = await getWechatPayConfig();
  const result = await requestWechatPay('POST', '/v3/pay/transactions/native', {
    appid: config.appId,
    mchid: config.mchId,
    description: String(subject).slice(0, 127),
    out_trade_no: String(outTradeNo),
    notify_url: notifyUrl || config.notifyUrl,
    amount: {
      total: Number(amount),
      currency: 'CNY'
    }
  });
  if (!result.code_url) {
    const err = new Error('微信Native下单失败');
    err.statusCode = 502;
    err.data = result;
    throw err;
  }
  return result;
}

export async function createMicroPay({ subject, amount, outTradeNo, authCode }) {
  if (!authCode) {
    const err = new Error('缺少付款码');
    err.statusCode = 400;
    throw err;
  }
  if (!amount || Number(amount) <= 0) {
    const err = new Error('支付金额必须大于0');
    err.statusCode = 400;
    throw err;
  }
  return requestWechatPayV2Xml('/pay/micropay', {
    body: String(subject).slice(0, 127),
    out_trade_no: String(outTradeNo),
    total_fee: Number(amount),
    spbill_create_ip: process.env.WECHAT_PAY_SPBILL_CREATE_IP || '127.0.0.1',
    auth_code: String(authCode)
  });
}

export async function queryMicroPayOrderByOutTradeNo(outTradeNo) {
  if (!outTradeNo) {
    const err = new Error('缺少商户订单号');
    err.statusCode = 400;
    throw err;
  }
  return requestWechatPayV2Xml('/pay/orderquery', {
    out_trade_no: String(outTradeNo)
  });
}

export async function queryOrderByOutTradeNo(outTradeNo) {
  const config = await getWechatPayConfig();
  return requestWechatPay('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchId)}`);
}

export async function closeOrderByOutTradeNo(outTradeNo) {
  const config = await getWechatPayConfig();
  return requestWechatPay('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, {
    mchid: config.mchId
  });
}

export async function buildPaymentParams(subject, amount, outTradeNo, openid, notifyUrlOverride = '') {
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

  const config = await getWechatPayConfig();
  const urlPath = '/v3/pay/transactions/jsapi';
  const resolvedNotifyUrl = notifyUrlOverride === 'appointment'
    ? (config.appointmentNotifyUrl || config.notifyUrl)
    : (notifyUrlOverride || config.notifyUrl);
  const result = await requestWechatPay('POST', urlPath, {
    appid: config.appId,
    mchid: config.mchId,
    description: String(subject).slice(0, 127),
    out_trade_no: String(outTradeNo),
    notify_url: resolvedNotifyUrl,
    amount: {
      total: Number(amount),
      currency: 'CNY'
    },
    payer: {
      openid
    }
  });
  if (!result.prepay_id) {
    const err = new Error('微信统一下单失败');
    err.statusCode = 502;
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

export async function createWechatRefund({ outTradeNo, transactionId, outRefundNo, reason, refundAmount, totalAmount, notifyUrl }) {
  if (!outTradeNo && !transactionId) {
    const err = new Error('缺少微信支付交易号或商户订单号，无法发起退款');
    err.statusCode = 400;
    throw err;
  }
  const config = await getWechatPayConfig();
  const payload = {
    out_refund_no: String(outRefundNo),
    reason: String(reason || '用户申请退款').slice(0, 80),
    notify_url: notifyUrl || config.refundNotifyUrl || undefined,
    amount: {
      refund: Number(refundAmount),
      total: Number(totalAmount),
      currency: 'CNY'
    }
  };
  if (transactionId) {
    payload.transaction_id = String(transactionId);
  } else {
    payload.out_trade_no = String(outTradeNo);
  }
  return requestWechatPay('POST', '/v3/refund/domestic/refunds', payload);
}

export async function decryptWechatPayResource(resource) {
  const config = await getWechatPayConfig();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8')
  );
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  const encryptedWithTag = Buffer.from(resource.ciphertext, 'base64');
  const encrypted = encryptedWithTag.subarray(0, encryptedWithTag.length - 16);
  const authTag = encryptedWithTag.subarray(encryptedWithTag.length - 16);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

export async function verifyWechatPayCallback(req, rawBody) {
  const config = await readPayConfig();
  if (!config.platformCert) {
    return true;
  }
  const timestamp = req.get('Wechatpay-Timestamp') || '';
  const nonce = req.get('Wechatpay-Nonce') || '';
  const signature = req.get('Wechatpay-Signature') || '';
  if (!timestamp || !nonce || !signature) {
    return false;
  }
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  return crypto.verify(
    'RSA-SHA256',
    Buffer.from(message, 'utf8'),
    config.platformCert,
    Buffer.from(signature, 'base64')
  );
}
