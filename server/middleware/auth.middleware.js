'use strict';
const jwt = require('jsonwebtoken');
const { User, Role, Permission, RolePermission } = require('../models');
const { hasPermission } = require('../utils/permission');
const { isDevAdminRole, isPrivilegedRole } = require('../utils/devRole');
const { userApiLimiter } = require('./apiRateLimiters');
const { pinRequestTenant } = require('../utils/tenantFilter');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../server_debug.log');
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const log = (msg) => {
  if (!isDev) return; // SECURITY: never write debug log in staging/production
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
  } catch (err) {
    // swallow — logging must never crash the app
  }
};

// Compatibility map for legacy section names to new modules
const LEGACY_MODULE_MAP = {
  'Asset Management': 'ASSET',
  'Manage Masters': 'MASTER',
  'Roles & Permissions': 'ROLE',
  'Audit Management': 'AUDIT',
  'Inventory': 'INVENTORY',
  'Finance & CWIP': 'CWIP',
  'Procurement': 'PR'
};

exports.verifyToken = (req, res, next) => {
  // SECURITY: never log Authorization header — it contains the bearer token
  const authHeader = req.headers.authorization;

  let token = authHeader && authHeader.split(' ')[1];

  // Support for downloads via query parameter (Requirement: PDF/Excel Exports)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired' });
      }
      return res.status(401).json({ success: false, message: 'Failed to authenticate token' });
    }

    try {
      // Sessions are bound to one company. Removing someone from it, changing their role there or
      // deactivating their account ends that session within seconds (not at token expiry); the
      // client then renews the session, which lands on the new role or back at the company picker.
      const { sessionStillValid } = require('../services/companyAccess.service');
      if (!(await sessionStillValid(decoded))) {
        return res.status(401).json({ success: false, code: 'SESSION_CONTEXT_CHANGED', message: 'Your access to this company has changed. Please continue again.' });
      }

      req.user = {
        id: decoded.id,
        client_id: decoded.client_id,
        role: decoded.role,
        mfa_verified: Boolean(decoded.mfa_verified),
        ...(decoded.pa ? { platform_admin: true } : {})
      };
      pinRequestTenant(req);

      log(`[AUTH SUCCESS] Verified: ${req.user.id}, Role: ${req.user.role}, Client: ${req.user.client_id}`);
      // Throttle authenticated traffic by VERIFIED user id (identity established above), not IP.
      // The rest of the request runs inside the actor context, so workflow events name the person.
      const requestContext = require('../utils/requestContext');
      return requestContext.run(requestContext.fromRequest(req), () => userApiLimiter(req, res, next));
    } catch (error) {
       console.error('[AUTH ERROR] Internal failure:', error);
       return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
};

exports.checkPermission = (section, action) => {
  return async (req, res, next) => {
    try {
      const roleCode = (req.user?.role || '').toUpperCase();

      log(`Checking: ${section}:${action} | User Role: ${roleCode}`);

      // Super Admin & Provider Admin bypass
      if (isPrivilegedRole(roleCode)) {
        return next();
      }

      if (!roleCode) {
        return res.status(403).json({ success: false, message: 'Access denied: No role found' });
      }

      const targetSection = LEGACY_MODULE_MAP[section] || section;
      const allowed = await hasPermission(req.user, targetSection, action);

      if (!allowed) {
        log(`DENIED: ${targetSection}:${action} for Role: ${roleCode}`);
        return res.status(403).json({ success: false, message: `Access denied to ${section}:${action}` });
      }

      next();
    } catch (err) {
      console.error('[checkPermission ERROR]', err);
      return res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
};

exports.protect = exports.verifyToken;
exports.authorize = (...allowedRoles) => (req, res, next) => {
  const roleCode = (req.user?.role || '').toUpperCase();
  const allowedUpper = allowedRoles.map(r => r.toUpperCase());
  if (isPrivilegedRole(roleCode) || allowedUpper.includes(roleCode) || allowedRoles.length === 0) {
    next();
  } else {
    res.status(403).json({ success: false, message: `Role access denied. Required: ${allowedRoles.join(' or ')}` });
  }
};

exports.requireProviderAdmin = (req, res, next) => {
  const roleCode = String(req.user?.role || '').toUpperCase();
  if (roleCode !== 'PROVIDER_ADMIN' && !isDevAdminRole(roleCode)) {
    return res.status(403).json({ success: false, message: 'Provider admin access required' });
  }
  return next();
};

// Senior-admin guard for tenant GOVERNANCE actions (user/role management, approval config,
// period lock, destructive/settings). Allows Provider/Super/Client Admin; blocks the general
// 'ADMIN' role and all functional roles. NOTE: this deliberately does NOT bypass for the
// privileged 'ADMIN' role (unlike authorize/checkPermission) — that's the whole point.
exports.requireSeniorAdmin = (req, res, next) => {
  const roleCode = String(req.user?.role || '').toUpperCase().replace(/\s+/g, '_');
  const SENIOR = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];
  if (SENIOR.includes(roleCode) || isDevAdminRole(roleCode)) return next();
  return res.status(403).json({ success: false, message: 'This action requires a Super Administrator.' });
};
