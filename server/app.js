const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sanitizeRequest } = require('./middleware/sanitizeMiddleware');

dotenv.config();

const app = express();

app.set('trust proxy', 1);

// Security headers. CSP is applied with hardened directives by default and can
// be disabled with CSP_ENABLED=false when a reverse proxy owns CSP instead.
const cspEnabled = process.env.CSP_ENABLED !== 'false';
app.use(
  helmet({
    contentSecurityPolicy: cspEnabled
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const err = new Error('Not allowed by CORS');
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  })
);

// Explicit payload limits guard against DoS via oversized uploads. The default
// limit stays at 10kb; only authenticated product writes (Operator photo
// uploads as base64 data URLs) are allowed the larger 4mb cap.
const PRODUCT_WRITE = /^\/api\/products(\/[^/]+)?$/;
app.use((req, res, next) => {
  const size = Number(req.headers['content-length'] || 0);
  const isProductWrite =
    (req.method === 'POST' || req.method === 'PUT') && PRODUCT_WRITE.test(req.path);
  const limit = isProductWrite && size > 10 * 1024 ? '4mb' : '10kb';
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Strip MongoDB operators from bodies and reject operator-shaped query params.
app.use(sanitizeRequest);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api', generalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later.' },
});
app.use('/api/auth/login', loginLimiter);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/sales', require('./routes/saleRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
// System Logs (renamed from Audit Logs); old path kept as a compatibility alias.
app.use('/api/system-logs', require('./routes/auditRoutes'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));

// Operator-uploaded product photos. The directory is created on demand by
// utils/productImage; files are immutable (uuid names), so long caching is safe.
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
  })
);

app.get('/', (req, res) => {
  res.send('OpenPOS API is running...');
});

// Health check used by deployment scripts, load balancers and the
// "verify the server" step of the installation guide. It is intentionally
// public and never touches the database.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openpos-api',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Central error handler (never leaks internal details to clients)
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message,
  });
});

module.exports = app;
