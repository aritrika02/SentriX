
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';

import authRoutes from './routes/auth.js';
import riskRoutes from './routes/risks.js';
import aiRoutes from './routes/ai.js';
import securityRoutes from './routes/security.js';

// REQUIRED ENVIRONMENT VARIABLES
const requiredEnv = [
  'MONGO_URI',
  'JWT_SECRET',
  'CLIENT_ORIGIN'
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key} in .env`);
  }
}

// INITIALIZE EXPRESS
const app = express();

const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');

// TRUST RENDER REVERSE PROXY
if (process.env.RENDER === 'true') {
  app.set('trust proxy', 1);
}

// SECURITY HEADERS
app.use(helmet());

// ALLOWED FRONTEND ORIGINS
const allowedOrigins = process.env.CLIENT_ORIGIN
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// CORS CONFIGURATION
app.use(cors({
  origin: allowedOrigins
}));

// JSON REQUEST SIZE LIMIT
app.use(express.json({
  limit: '32kb'
}));

// AUTHENTICATION RATE LIMITER
const authLimiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 80,

  standardHeaders: 'draft-7',

  legacyHeaders: false,

  message: {
    message: 'Too many requests. Please try again later.'
  }

});

// API ROUTES
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/risks', riskRoutes);

app.use('/api/ai', aiRoutes);

app.use('/api/security', securityRoutes);

// HEALTH CHECK
app.get('/api/health', (_req, res) => {

  res.json({
    ok: true
  });

});

// UNKNOWN API ROUTES
app.use('/api', (req, res) => {

  res.status(404).json({
    message: 'API endpoint not found'
  });

});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {

  if (res.headersSent) {
    return next(err);
  }

  // VALIDATION ERRORS
  if (err instanceof ZodError) {

    return res.status(400).json({
      message: err.issues
        .map(issue =>
          `${issue.path.join('.')}: ${issue.message}`
        )
        .join('; ')
    });

  }

  // DUPLICATE DATABASE RECORDS
  if (err.code === 11000) {

    return res.status(409).json({
      message: 'Duplicate entry'
    });

  }

  const status =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  // LOG SERVER ERRORS
  if (status >= 500) {
    console.error(err.name, err.message);
  }

  return res.status(status).json({
    message: status < 500
      ? err.message
      : 'Internal server error'
  });

});

// START SERVER
async function startServer() {

  try {

    await mongoose.connect(process.env.MONGO_URI);

    console.log('MongoDB connected successfully');

    app.listen(PORT, () => {

      console.log(`SentriX API on port ${PORT}`);

    });

  } catch (error) {

    console.error(
      'Server startup failed:',
      error.message
    );

    process.exit(1);

  }

}

startServer();