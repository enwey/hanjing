const { apiBaseUrl, envVersion } = require('../config/env');

const MAX_QUEUE_SIZE = 20;
const MAX_FAILED_LOGS = 20;
let systemInfo = null;
let networkType = '';
let isSending = false;
const queue = [];

function readFailedLogs() {
  try {
    return wx.getStorageSync('mini_program_log_failures') || [];
  } catch (error) {
    return [];
  }
}

function rememberFailedLog(payload, error) {
  try {
    const failures = readFailedLogs();
    failures.push({
      time: Date.now(),
      event: payload && payload.event,
      traceId: payload && payload.traceId,
      apiUrl: payload && payload.apiUrl,
      error: normalizeMessage(error),
    });
    wx.setStorageSync('mini_program_log_failures', failures.slice(-MAX_FAILED_LOGS));
  } catch (storageError) {}
  try {
    console.warn('[mini-log] report failed', payload && payload.event, error);
  } catch (consoleError) {}
}

function readSystemInfo() {
  if (systemInfo) return systemInfo;
  try {
    systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
  } catch (error) {
    systemInfo = {};
  }
  return systemInfo;
}

function getCurrentRoute() {
  try {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    return currentPage && currentPage.route ? currentPage.route : '';
  } catch (error) {
    return '';
  }
}

function getToken() {
  try {
    return wx.getStorageSync('access_token') || '';
  } catch (error) {
    return '';
  }
}

function createTraceId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(message) {
  if (message === null || message === undefined) return '';
  if (message instanceof Error) return message.message || String(message);
  if (typeof message === 'object') {
    try {
      return JSON.stringify(message).slice(0, 255);
    } catch (error) {
      return String(message).slice(0, 255);
    }
  }
  return String(message).slice(0, 255);
}

function sanitizeExtra(extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return {};
  const blockedKeys = ['token', 'access_token', 'refresh_token', 'authorization', 'phone', 'phoneCode', 'code', 'password'];
  const output = {};
  Object.keys(extra).slice(0, 30).forEach((key) => {
    if (blockedKeys.indexOf(key) > -1) return;
    const value = extra[key];
    if (value === null || value === undefined) {
      output[key] = value;
    } else if (typeof value === 'object') {
      try {
        output[key] = JSON.stringify(value).slice(0, 500);
      } catch (error) {
        output[key] = String(value).slice(0, 500);
      }
    } else {
      output[key] = String(value).slice(0, 500);
    }
  });
  return output;
}

function buildPayload(entry) {
  const info = readSystemInfo();
  return {
    level: entry.level || 'info',
    event: entry.event || 'client_event',
    route: entry.route || getCurrentRoute(),
    message: normalizeMessage(entry.message),
    apiUrl: entry.apiUrl || '',
    method: entry.method || '',
    statusCode: entry.statusCode || null,
    traceId: entry.traceId || createTraceId(),
    envVersion,
    appVersion: info.version || '',
    platform: info.platform || '',
    deviceModel: info.model || '',
    sdkVersion: info.SDKVersion || '',
    networkType,
    extra: sanitizeExtra(entry.extra),
  };
}

function flush() {
  if (isSending || !queue.length) return;
  const payload = queue.shift();
  isSending = true;
  const token = getToken();
  const header = { 'content-type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  wx.request({
    url: `${apiBaseUrl}/logs/mini-program`,
    method: 'POST',
    data: payload,
    header,
    timeout: 5000,
    success(response) {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        rememberFailedLog(payload, {
          statusCode: response.statusCode,
          data: response.data,
        });
      }
    },
    fail(error) {
      rememberFailedLog(payload, error);
    },
    complete() {
      isSending = false;
      if (queue.length) {
        setTimeout(flush, 50);
      }
    },
  });
}

function sendPayloadNow(payload) {
  return new Promise((resolve) => {
    const token = getToken();
    const header = { 'content-type': 'application/json' };
    if (token) header.Authorization = `Bearer ${token}`;
    wx.request({
      url: `${apiBaseUrl}/logs/mini-program`,
      method: 'POST',
      data: payload,
      header,
      timeout: 8000,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rememberFailedLog(payload, {
            statusCode: response.statusCode,
            data: response.data,
          });
          resolve(false);
          return;
        }
        resolve(true);
      },
      fail(error) {
        rememberFailedLog(payload, error);
        resolve(false);
      },
    });
  });
}

function report(entry) {
  try {
    if (queue.length >= MAX_QUEUE_SIZE) {
      queue.shift();
    }
    queue.push(buildPayload(entry || {}));
    flush();
  } catch (error) {}
}

function reportNow(entry) {
  try {
    return sendPayloadNow(buildPayload(entry || {}));
  } catch (error) {
    return Promise.resolve(false);
  }
}

function init() {
  readSystemInfo();
  if (wx.getNetworkType) {
    wx.getNetworkType({
      success(result) {
        networkType = result.networkType || '';
      },
    });
  }
  if (wx.onNetworkStatusChange) {
    wx.onNetworkStatusChange((result) => {
      networkType = result.networkType || '';
      report({
        level: result.isConnected ? 'info' : 'warn',
        event: 'network_change',
        message: result.isConnected ? 'network connected' : 'network disconnected',
        extra: { networkType },
      });
    });
  }
}

module.exports = {
  init,
  report,
  reportNow,
  createTraceId,
  readFailedLogs,
};
