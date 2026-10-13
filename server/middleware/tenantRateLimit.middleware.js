'use strict';
/**
 * Gap 19: Per-tenant API rate limiting
 * Each client_id gets its own bucket so one tenant's traffic doesn't starve others.
 */
const rateLimit = require('express-rate-limit');

const tenantBuckets = new Map();

const DEFAULT_OPTS = { windowMs: 15 * 60 * 1000, max: 500 };

function tenantRateLimit(opts = {}) {
  const windowMs = opts.windowMs || DEFAULT_OPTS.windowMs;
  const max = opts.max || DEFAULT_OPTS.max;

  return (req, res, next) => {
    const clientId = req.user?.client_id || 'global';
    const key = `${clientId}`;

    if (!tenantBuckets.has(key)) {
      tenantBuckets.set(key, rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (r) => r.user?.id || r.ip,
        message: { success: false, message: 'Tenant rate limit exceeded. Please try again later.' },
        skip: (r) => {
          const ip = r.ip || '';
          return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
        }
      }));
    }

    tenantBuckets.get(key)(req, res, next);
  };
}

module.exports = { tenantRateLimit };
