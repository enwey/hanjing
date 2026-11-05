import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function isQrImage(bytes) {
  return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255,216,255]));
}

export function createInviteQrCache({ getToken, saveUrl, fetchImage = fetch, root = './uploads/distribution/qrcodes', config = () => ({ appId: process.env.WX_MINI_APP_ID || '', env: process.env.WX_MINI_QRCODE_ENV || (process.env.NODE_ENV === 'production' ? 'release' : 'trial') }) }) {
  const flights = new Map();
  return async function getQr(distributor) {
    if (!distributor?.id || !distributor.invite_code) return { url: '', reason: '缺少分销邀请码' };
    const { appId, env } = config();
    const key = crypto.createHash('sha256').update(JSON.stringify([appId, env, distributor.invite_code, 'pages/index/index'])).digest('hex');
    const filename = `${key}.png`;
    const file = path.resolve(root, filename);
    const url = `/uploads/distribution/qrcodes/${filename}`;
    if (!flights.has(key)) {
      const flight = (async () => {
        try {
          let cached = false;
          try { cached = isQrImage(await fs.readFile(file)); } catch {}
          if (!cached) {
            const signal = AbortSignal.timeout(8000);
            const token = await getToken({ signal });
            const response = await fetchImage(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`, {
              method: 'POST', signal, headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ page: 'pages/index/index', scene: `inviteCode=${distributor.invite_code}`, check_path: false, env_version: env, width: 430 })
            });
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!response.ok || !isQrImage(bytes)) throw new Error('微信小程序码生成失败');
            await fs.mkdir(root, { recursive: true });
            const temporary = `${file}.${crypto.randomUUID()}.tmp`;
            try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, file); }
            finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
          }
          if (distributor.invite_qr_url !== url) await saveUrl(url, distributor.id);
          return { url, reason: '' };
        } catch (error) {
          console.warn('[Distribution] invite qr unavailable:', error.message);
          return { url: '', reason: error.message || '生成邀请小程序码失败' };
        }
      })();
      flights.set(key, flight);
      flight.finally(() => { if (flights.get(key) === flight) flights.delete(key); });
    }
    return flights.get(key);
  };
}
