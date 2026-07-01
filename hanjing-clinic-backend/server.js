import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { initDB } from './db.js';
import { seedData } from './seed.js';
import adminRouter from './routes/admin.js';
import clientRouter from './routes/client.js';

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

// Log requests (Asynchronously, with 50MB size limit to prevent disk exhaustion)
app.use((req, res, next) => {
  const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
  console.log(logMsg.trim());
  fs.stat('./requests.log', (err, stats) => {
    if (err || stats.size < 50 * 1024 * 1024) {
      fs.appendFile('./requests.log', logMsg, () => {});
    }
  });
  next();
});

import { initWebSocket } from './im-socket.js';

// Register routers
app.use(adminRouter);
app.use(clientRouter);

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
        const { autoUpdateExpiredAppointments, autoSettleDistributionCommissions } = await import('./db.js');
        await autoUpdateExpiredAppointments();
        await autoSettleDistributionCommissions();
      } catch (err) {
        console.error('Failed to run periodic background jobs:', err);
      }
    }, 60000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
