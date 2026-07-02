import fs from 'fs';
import { URL } from 'url';
import https from 'https';

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';

/**
 * Dispatch system warning/critical alerts to local logs and optional external webhooks.
 * @param {string} level 'warning' | 'error' | 'critical'
 * @param {string} title Alert Title
 * @param {string} message Description message
 * @param {Error} [error] Associated error object
 */
export function sendSystemAlert(level, title, message, error = null) {
  const timestamp = new Date().toISOString();
  const errorMsg = error ? `\nError: ${error.message}\nStack: ${error.stack}` : '';
  const logContent = `[${timestamp}] [${level.toUpperCase()}] ${title}: ${message}${errorMsg}\n\n`;

  // 1. Write locally to alerts.log file
  try {
    fs.appendFileSync('./alerts.log', logContent);
  } catch (err) {
    console.error('[Alert System] Failed to write to alerts.log:', err);
  }

  // 2. Dispatch to Feishu/DingTalk or custom webhook if URL is provided in env
  if (ALERT_WEBHOOK_URL) {
    try {
      const payload = JSON.stringify({
        msg_type: 'text',
        content: {
          text: `🚨【鼾静诊所系统告警 - ${level.toUpperCase()}】\n时间: ${timestamp}\n标题: ${title}\n详情: ${message}${error ? `\n报错原因: ${error.message}` : ''}`
        }
      });

      const urlObj = new URL(ALERT_WEBHOOK_URL);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options);
      req.on('error', (e) => {
        console.error('[Alert System] Webhook dispatch connection failed:', e.message);
      });
      req.write(payload);
      req.end();
    } catch (webhookErr) {
      console.error('[Alert System] Webhook preparation failed:', webhookErr.message);
    }
  }
}
