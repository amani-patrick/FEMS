require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));
app.use(morgan('combined'));

// Swagger docs
try {
  const swaggerDoc = YAML.load(path.join(__dirname, '../../swagger.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customCss: '.swagger-ui .topbar { background-color: #0f172a; }',
    customSiteTitle: 'FEMCS API Docs',
  }));
} catch (e) {
  console.log('Swagger YAML not found, skipping docs');
}

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
const CUSTOMER_URL = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:5002';
const EXTINGUISHER_URL = process.env.EXTINGUISHER_SERVICE_URL || 'http://localhost:5003';
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5004';
const REPORT_URL = process.env.REPORT_SERVICE_URL || 'http://localhost:5005';

function makeProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    timeout: 60000,
    proxyTimeout: 60000,
    on: {
      error: (err, req, res) => {
        console.error(`Proxy error to ${target}:`, err.message);
        if (!res.headersSent) {
          res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
        }
      },
    },
  });
}

// Auth: /api/auth/login  →  /login  (service has no prefix)
app.use('/api/auth', makeProxy(AUTH_URL, { '^/api/auth': '' }));
// Customer: /api/customers  →  /  (service mounts routes at /)
app.use('/api/customers', makeProxy(CUSTOMER_URL, { '^/api/customers': '' }));

// Extinguisher: /api/extinguishers  →  /extinguishers  (service mounts at /extinguishers)
app.use('/api/extinguishers', makeProxy(EXTINGUISHER_URL, { '^/api': '' }));
app.use('/api/inspections',   makeProxy(EXTINGUISHER_URL, { '^/api': '' }));
app.use('/api/maintenance',   makeProxy(EXTINGUISHER_URL, { '^/api': '' }));

// Notification: /api/notifications  →  /  (service mounts at /)
app.use('/api/notifications', makeProxy(NOTIFICATION_URL, { '^/api/notifications': '' }));

// Report: /api/reports  →  /  (service mounts at /)
app.use('/api/reports', makeProxy(REPORT_URL, { '^/api/reports': '' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    services: { auth: AUTH_URL, customer: CUSTOMER_URL, extinguisher: EXTINGUISHER_URL, notification: NOTIFICATION_URL, report: REPORT_URL },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Fire Extinguisher Management and Compliance System (FEMCS) - API Gateway',
    version: '1.0.0',
    docs: '/api/docs',
    health: '/health',
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`🚀 FEMCS API Gateway running on port ${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
});
