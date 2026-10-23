'use strict';
const jwt = require('jsonwebtoken');
const { isDevAdminRole } = require('../utils/devRole');
const { pinRequestTenant } = require('../utils/tenantFilter');

/**
 * Tenant Isolation Middleware
 * Enforces client context for every request
 */
const tenantMiddleware = (req, res, next) => {
  try {
    // If auth middleware already populated req.user, use it. Otherwise, verify token.
    if (!req.user) {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    }

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = req.user.role;

    // Only PROVIDER_ADMIN (and DEV_ADMIN in non-prod) may operate without client_id.
    // SUPER_ADMIN is per-client and MUST have client_id assigned.
    if (
      !req.user.client_id &&
      role !== "PROVIDER_ADMIN" &&
      !isDevAdminRole(role)
    ) {
      return res.status(403).json({ message: "Invalid tenant context — user has no client_id assigned" });
    }

    pinRequestTenant(req);

    // Optional: attach tenant safely
    // Prefer JWT client_id; fall back to subdomain-resolved client
    if (req.user.client_id) {
      req.tenant = req.user.client_id;
    } else if (req.subdomainClientId) {
      req.tenant = req.subdomainClientId;
    }

    next();
  } catch (err) {
    console.error('Tenant Middleware Error:', err.message);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

module.exports = { tenantMiddleware };
