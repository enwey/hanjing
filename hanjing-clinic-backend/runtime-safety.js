import fs from 'node:fs/promises';
import path from 'node:path';

export function createRateLimiter({ limit = 150, windowMs = 60000, maxKeys = 10000, clock = Date.now } = {}) {
  const windows = new Map();
  let nextCleanup = 0;
  return (req, res, next) => {
    const now = clock();
    if (now >= nextCleanup || windows.size >= maxKeys) {
      for (const [key, value] of windows) if (value.until <= now) windows.delete(key);
      nextCleanup = now + windowMs;
    }
    // Express resolves req.ip using only the explicitly configured trusted proxies.
    const key = req.ip || req.socket.remoteAddress;
    let bucket = windows.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && windows.size >= maxKeys) return res.status(503).json({ code: 503, message: '服务繁忙，请稍后重试' });
      bucket = { count: 0, until: now + windowMs };
      windows.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000))));
      return res.status(429).json({ code: 429, message: '请求过于频繁，请稍后重试' });
    }
    next();
  };
}

export function createRotatingLog(file, { maxBytes = 50 * 1024 * 1024, copies = 5 } = {}) {
  let chain = Promise.resolve(), queued = 0;
  const absentOK = err => { if (err.code !== 'ENOENT') throw err; };
  return line => {
    if (queued >= 1000) { console.error('File log backlog exceeded; request remains in process stdout'); return chain; }
    queued++;
    chain = chain.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const size = await fs.stat(file).then(s => s.size, err => { absentOK(err); return 0; });
      if (size + Buffer.byteLength(line) > maxBytes) {
        await fs.unlink(file + '.' + copies).catch(absentOK);
        for (let i = copies - 1; i >= 1; i--) await fs.rename(file + '.' + i, file + '.' + (i + 1)).catch(absentOK);
        await fs.rename(file, file + '.1').catch(absentOK);
      }
      await fs.appendFile(file, line);
    }).catch(err => console.error('File log failed:', err.message)).finally(() => queued--);
    return chain;
  };
}
