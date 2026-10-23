'use strict';
const { isDevAdminRole, isPrivilegedRole } = require('../utils/devRole');

/**
 * Enterprise RBAC Middleware
 * Enforces role-based access control across the platform.
 */
module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const userRole = req.user.role; // This is the role code string (e.g., 'SUPER_ADMIN')

    // Standardize role checks (case-insensitive)
    const normalizedRole = (userRole || '').toUpperCase();
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

    if (isDevAdminRole(normalizedRole)) {
      return next();
    }

    // Privileged admin roles (SUPER_ADMIN / PROVIDER_ADMIN / ADMIN / CLIENT_ADMIN) are
    // always allowed — consistent with checkPermission's privileged bypass. This avoids
    // per-route hardcoded lists silently omitting an admin role (e.g. CLIENT_ADMIN).
    if (isPrivilegedRole(normalizedRole)) {
      return next();
    }

    // Auditor and Management are read-only. Vendors cannot change another party's master data.
    if ((normalizedRole === 'AUDITOR' || normalizedRole === 'MANAGEMENT') && req.method !== 'GET') {
      return res.status(403).json({ 
        success: false, 
        message: normalizedRole === 'MANAGEMENT'
          ? 'Management access is read-only'
          : 'Auditors have read-only access to the system'
      });
    }

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(normalizedRole)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access Denied: Required role not found (Expected: ${allowedRoles.join(', ')})` 
      });
    }

    next();
  };
};
