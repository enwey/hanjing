import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { initDB, get, closePool } from './db.js';
import { createRateLimiter, createRotatingLog } from './runtime-safety.js';
import adminRouter from './routes/admin.js';
import clientRouter from './routes/client.js';
import pcAuthRouter from './routes/pc-auth.js';
import promoterRouter from './routes/promoter.js';
import { sendSystemAlert } from './alert-notifier.js';
import { processVisitReminders } from './wechatSubscribe.js';

const app = express();
const PORT = process.env.PORT || 5005;

app.disable('x-powered-by');

const trustedProxies = String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').map(v => v.trim()).filter(Boolean);
app.set('trust proxy', trustedProxies.length ? trustedProxies : false);
const allowedOrigins = String(process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') }));
app.use('/api/', createRateLimiter());
app.use('/api/v1/appointments/pay-callback', express.raw({ type: 'application/json' }));
app.use('/api/v1/orders/pay-callback', express.raw({ type: 'application/json' }));
app.use('/api/v1/pay/refund-callback', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

const writeAccessLog = createRotatingLog(`./logs/requests-${process.pid}.log`);
let stopping = false, server, jobTimer, jobRunning = false, sockets;
app.get('/health/live', (req, res) => res.status(stopping ? 503 : 200).json({ ok: !stopping }));
app.get('/health/ready', async (req, res) => {
  try {
    if (stopping) throw new Error('stopping');
    await get('SELECT 1 AS ok');
    res.json({ ok: true });
  } catch { res.status(503).json({ ok: false }); }
});

// Set basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// High Performance HTTP Access Logger Middleware (Morgan-like)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.ip;
    const logMsg = `[${new Date().toISOString()}] ${ip} ${req.method} ${req.path} ${res.statusCode} - ${duration}ms\n`;
    
    console.log(logMsg.trim());
    writeAccessLog(logMsg);
  });
  next();
});

import { initWebSocket } from './im-socket.js';

// Register routers
// Public bundled demo portraits only; do not expose arbitrary project files.
app.get('/static/demo/:filename', (req, res, next) => {
  if (!/^doctor-[1-4]\.jpg$/.test(req.params.filename)) return next();
  res.sendFile(fileURLToPath(new URL('./static/demo/' + req.params.filename, import.meta.url)));
});
app.use(adminRouter);
app.use(clientRouter);
app.use(pcAuthRouter);
app.use(promoterRouter);

// 404 Handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({ code: 404, message: '请求的接口地址不存在' });
});

// Global Exception / Error Handling Middleware
app.use((err, req, res, next) => {
  // 1. Catch bad JSON body payloads
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ code: 400, message: '请求报文 JSON 语法格式错误' });
  }
  
  console.error('[Global Error] Caught unhandled exception:', err);
  const status = err.statusCode || err.status || 500;
  const message = status >= 500 ? '系统繁忙，请稍后再试' : (err.message || '请求失败');
  
  // Dispatch monitoring alert on internal 500 errors
  if (status === 500) {
    sendSystemAlert('error', `API 500 Error: ${req.method} ${req.path}`, err.message, err);
  }
  
  res.status(status).json({
    code: status,
    message
  });
});

// BOOTSTRAP DATABASE & SERVER
const startServer = async () => {
  try {
    // 1. Initialize Tables
    await initDB();

    // 3. Start Listening
    server = app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  Hanjing Clinic Backend is running!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`========================================\n`);
    });

    // 4. Attach WebSocket support
    sockets = initWebSocket(server);

    // 5. Start background jobs (run every 60s)
    jobTimer = setInterval(async () => {
      if (stopping || jobRunning) return;
      jobRunning = true;
      try {
        const { autoUpdateExpiredAppointments, autoSettleDistributionCommissions } = await import('./db.js');
        await autoUpdateExpiredAppointments();
        await autoSettleDistributionCommissions();
        await processVisitReminders();
      } catch (err) {
        console.error('Failed to run periodic background jobs:', err);
        sendSystemAlert('warning', 'Background Job Failed', err.message, err);
      } finally { jobRunning = false; }
    }, 60000);
  } catch (error) {
    console.error('Failed to start server:', error);
    sendSystemAlert('critical', 'Server Bootstrap Failed', error.message, error);
    process.exit(1);
  }
};

startServer();

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(jobTimer);
  const timeout = setTimeout(() => process.exit(1), 15000);
  timeout.unref();
  try {
    if (sockets) { for (const ws of sockets.clients) ws.terminate(); sockets.close(); }
    if (server) await new Promise(resolve => server.close(resolve));
    while (jobRunning) await new Promise(resolve => setTimeout(resolve, 50));
    await closePool();
    await writeAccessLog('Server stopped\n');
  } finally { process.exit(code); }
}
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  sendSystemAlert('critical', 'Uncaught Exception Process Crash Protection', err.message, err);
  shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  const err = reason instanceof Error ? reason : new Error(String(reason));
  sendSystemAlert('critical', 'Unhandled Promise Rejection', err.message, err);
  shutdown(1);
});
