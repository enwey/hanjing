import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { initDB } from './db.js';
import { seedData } from './seed.js';
import adminRouter from './routes/admin.js';
import clientRouter from './routes/client.js';
import { sendSystemAlert } from './alert-notifier.js';

const app = express();
const PORT = process.env.PORT || 5005;

app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Lightweight memory rate limiter to protect backend APIs
const rateLimitMemory = new Map(); // ip -> [timestamps]
const rateLimiter = (limit = 150, windowMs = 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const timestamps = rateLimitMemory.get(ip) || [];
    const activeTimestamps = timestamps.filter(t => now - t < windowMs);
    if (activeTimestamps.length >= limit) {
      return res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试' });
    }
    activeTimestamps.push(now);
    rateLimitMemory.set(ip, activeTimestamps);
    next();
  };
};

// Apply rate limit on all api endpoints (max 150 requests per minute per IP)
app.use('/api/', rateLimiter(150, 60 * 1000));

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
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const logMsg = `[${new Date().toISOString()}] ${ip} ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms\n`;
    
    console.log(logMsg.trim());
    fs.stat('./requests.log', (err, stats) => {
      if (err || stats.size < 50 * 1024 * 1024) {
        fs.appendFile('./requests.log', logMsg, () => {});
      }
    });
  });
  next();
});

import { initWebSocket } from './im-socket.js';

// Register routers
app.use(adminRouter);
app.use(clientRouter);

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
  const message = err.message || '系统繁忙，请稍后再试';
  
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
    // 2. Load Seed Data
    await seedData();

    // 3. Start Listening
    const server = app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  Hanjing Clinic Backend is running!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`========================================\n`);
    });

    // 4. Attach WebSocket support
    initWebSocket(server);

    // 5. Start background jobs (run every 60s)
    setInterval(async () => {
      try {
        const { autoUpdateExpiredAppointments, autoSettleDistributionCommissions, autoProcessRefunds } = await import('./db.js');
        await autoUpdateExpiredAppointments();
        await autoSettleDistributionCommissions();
        await autoProcessRefunds();
      } catch (err) {
        console.error('Failed to run periodic background jobs:', err);
        sendSystemAlert('warning', 'Background Job Failed', err.message, err);
      }
    }, 60000);
  } catch (error) {
    console.error('Failed to start server:', error);
    sendSystemAlert('critical', 'Server Bootstrap Failed', error.message, error);
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  sendSystemAlert('critical', 'Uncaught Exception Process Crash Protection', err.message, err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  const err = reason instanceof Error ? reason : new Error(String(reason));
  sendSystemAlert('critical', 'Unhandled Promise Rejection', err.message, err);
});
