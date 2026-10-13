'use strict';
const { isDevAdminRole } = require('../utils/devRole');

const privilegedRoles = new Set(['PROVIDER_ADMIN', 'ADMIN', 'CLIENT_ADMIN']);

const isEnabled = () => String(process.env.MFA_ENFORCE_PRIVILEGED || 'false').toLowerCase() === 'true';

exports.requireMfaForPrivileged = (req, res, next) => {
  if (!isEnabled()) return next();

  const role = String(req.user?.role || '').toUpperCase();
  if (!privilegedRoles.has(role) && !isDevAdminRole(role)) return next();

  const mfaVerified = Boolean(req.user?.mfa_verified);
  if (!mfaVerified) {
    return res.status(401).json({
      success: false,
      message: 'MFA verification required for privileged access',
      code: 'MFA_REQUIRED'
    });
  }

  return next();
};
