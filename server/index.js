require('dotenv').config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});


process.on("unhandledRejection", (reason, promise) => {
  console.error("FATAL: Unhandled Rejection at:", promise, "reason:", reason);
});

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./models');
const { errorHandler } = require('./middleware/error.middleware');
const autoLogger = require('./middleware/autoLogger.middleware');
const requestLogger = require('./middleware/requestLogger.middleware');

// --- 1. ROUTE IMPORTS ---
const authRoutes = require('./routes/auth.routes');
const masterRoutes = require('./routes/master.routes');
const userRoutes = require('./routes/user.routes');
const roleRoutes = require('./routes/role.routes');
const systemRoutes = require('./routes/system.routes');
const procurementRoutes = require('./routes/procurement.routes');
const itemRoutes = require('./routes/item.routes');
const grnRoutes = require('./routes/grn.routes');
const approvalRoutes = require('./routes/approval.routes');
const companyRoutes = require('./routes/company.routes');
const clientManagementRoutes = require('./routes/clientManagement.routes');
const notificationsRoutes = require('./routes/notifications.routes');

// --- 2. INITIALIZATION ---
const app = express();
const logFile = path.join(__dirname, 'server_debug.log');
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const log = (msg) => {
  if (!isDev) return; // SECURITY: no debug log writes in staging/production
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
  } catch (err) {
    // swallow — logging must never crash the app
  }
};

// --- 3. MIDDLEWARE ---
// SECURITY: localhost origins only whitelisted in development mode
const defaultOrigins = isDev ? [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
  "http://127.0.0.1:5177",
  "http://127.0.0.1:5178"
] : [];
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Dynamically allow any *.fixtag.in subdomain so client tenants can reach the API.
// Also allows explicitly listed origins from CLIENT_URL (comma-separated).
const FIXTAG_SUBDOMAIN_RE = /^https:\/\/[a-z0-9-]+\.fixtag\.in$/;
const strictCors = cors({
  origin: (origin, callback) => {
    // Server-to-server / CLI requests have no Origin header — allow them.
    if (!origin) return callback(null, true);
    // Explicitly listed origins (e.g. https://app.fixtag.com) or localhost dev origins.
    if ([...defaultOrigins, ...allowedOrigins].includes(origin)) return callback(null, true);
    // Any subdomain of fixtag.in (e.g. abc.fixtag.in, sbc.fixtag.in).
    if (FIXTAG_SUBDOMAIN_RE.test(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true
});
// Public, no-auth email-link approval pages are opened directly in a browser, where the
// Origin can be 'null' (email-client navigation / redirect). Allow any origin for those
// paths ONLY; the rest of the API keeps the strict allowlist above.
const publicCors = cors({ origin: true });
app.use((req, res, next) => (req.path.startsWith('/api/public/') ? publicCors : strictCors)(req, res, next));

// Trust proxy — required when running behind Docker/nginx so rate limiter
// correctly reads client IP from X-Forwarded-For instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Use 'combined' (Apache log format) in production for structured log aggregation.
// Use 'dev' locally for readable coloured output.
app.use(morgan(isDev ? 'dev' : 'combined'));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// Subdomain tenant resolver — runs before all routes so login is subdomain-aware
const { subdomainTenantMiddleware } = require('./middleware/subdomainTenant.middleware');
app.use(subdomainTenantMiddleware);
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads')));

// Rate Limiting (Security Compliance)
const getClientIp = (req) => {
  // Prefer X-Real-IP (set by nginx to actual client IP), then first entry of
  // X-Forwarded-For, then req.ip (which trust-proxy may have resolved already).
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const isLoopbackRequest = (req) => {
  const ip = getClientIp(req);
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);
};

// NOTE: the general authenticated API limiter now lives in middleware/apiRateLimiters.js
// and is applied per VERIFIED user inside verifyToken (not globally by IP).

// NOTE: bulk import/export limiting is per VERIFIED user (bulkUserLimiter), applied in the bulk route files.

// Rate-limiter architecture (middleware/apiRateLimiters.js + CTO Office Rate-Limiter-Architecture.md):
//  - Public auth endpoints -> IP-keyed authLimiter, applied per-route in auth.routes.js.
//  - Authenticated API -> per VERIFIED user id, applied inside verifyToken (auth.middleware).
//  - Bulk import/export -> per verified user (bulkUserLimiter), in the bulk route files.
// No global IP limiter on /api/ (it blocked legitimate multi-user offices behind one IP).

// Debug & Audit Log for 403s
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (data) {
    if (res.statusCode === 403) {
      log(`[AUTH 403] ${req.method} ${req.url} | User: ${req.user?.id || 'ANON'}`);
    }
    return originalJson.apply(this, arguments);
  };
  next();
});

// Append-only audit foundation for successful mutating API calls.
app.use(autoLogger);

// --- 4. CORE API ROUTES ---

// Auth & Access
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/doa-config', require('./routes/doaConfig.routes')); // Phase 2 - DOA matrix admin

// Master Data
app.use('/api/masters', masterRoutes);
app.use('/api/items', itemRoutes);
// IMPORTANT: mount specific /api/system/* sub-routes BEFORE the catch-all /api/system
// (systemRoutes applies requireProviderAdmin which would block these)
app.use('/api/system/activity-logs', require('./routes/activity_logs.routes'));
app.use('/api/system/features',       require('./routes/features.routes'));
app.use('/api/system', systemRoutes);
app.use('/api/companies', companyRoutes);

// Asset Management (Primary)

// Procurement & Inventory
app.use('/api/procurement', procurementRoutes);
app.use('/api/ar', require('./routes/ar.routes')); // Accounts Receivable: customer invoices, receipts, reminders
app.use('/api/rfqs', require('./routes/rfq.routes')); // CR-P01 RFQ module
app.use('/api/vendor-emails', require('./routes/vendorEmail.routes')); // admin-approved vendor emails for awarded RFQs
app.use('/api/oauth/mail', require('./routes/mailOAuth.routes')); // Google/Microsoft mailbox sign-in callback (public)
app.use('/api/vendor-categories', require('./routes/vendorCategory.routes')); // CR-P04
app.use('/api/three-way-match', require('./routes/threeWayMatch.routes'));
app.use('/api/grn', grnRoutes);

// Finance & Compliance
app.use('/api/tds', require('./routes/tds.routes'));

// Enterprise Audit Module (Consolidated)
// NOTE: /api/audit/plans removed — duplicate of /api/audit-plans (same routes file)

// Maintenance & Monitoring

app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/integration', require('./routes/integration.routes'));
app.use('/api/public/approvals', require('./routes/publicApproval.routes')); // Phase 3 - external email-link approvals (NO auth)
app.use('/api/numbering', require('./routes/numbering.routes'));
app.use('/api/notification-settings', require('./routes/notification-settings.routes'));
app.use('/api/gst', require('./routes/gst.routes'));
app.use('/api/notifications', notificationsRoutes);


// Enterprise Features (Gaps 3-21)
app.use('/api/enterprise', require('./routes/enterprise.routes'));
app.use('/api/employees', require('./routes/employee.routes'));
app.use('/api/sso', require('./routes/sso.routes'));
app.use('/api/sessions', require('./routes/session.routes'));

// Legacy Redirects
app.use('/api/clients', (req, res, next) => {
  next();
}, clientManagementRoutes);

// Client Management
app.use('/api/clients-management', clientManagementRoutes);

// Security & Metrics
const securityController = require('./controllers/security.controller');
app.get('/api/dashboard/security', securityController.getSecurityMetrics);

// Root & Health
app.get('/', (req, res) => res.json({ status: 'ACTIVE', version: '2.4.0', engine: 'Anti-Gravity' }));

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const { ensureLedgerRoles } = require('./services/rbacSeed');
  ensureLedgerRoles(sequelize).catch((err) => console.error('[RBAC] role seed failed:', err.message));

  // Start background scheduler (daily notifications, SLA, alert engine, vendor compliance)
  try {
    const { startScheduler } = require('./scheduler');
    startScheduler();
  } catch { /* scheduler failure must never crash the server */ }

  // CR-DEP-01: mark any depreciation jobs orphaned by a restart as FAILED (safe to re-run).
  try {
    require('./services/depreciationJob.service').reconcileStaleJobs()
      .then((n) => { if (n) console.log(`[dep-jobs] reconciled ${n} stale job(s)`); })
      .catch(() => {});
  } catch { /* never crash on startup */ }
});

module.exports = app;
