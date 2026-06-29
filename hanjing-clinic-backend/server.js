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

// Set basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Log requests
app.use((req, res, next) => {
  const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
  console.log(logMsg.trim());
  try {
    fs.appendFileSync('./requests.log', logMsg);
  } catch (err) {
    // ignore
  }
  next();
});

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
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  Hanjing Clinic Backend is running!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
