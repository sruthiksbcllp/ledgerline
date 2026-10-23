'use strict';
const activityLogger = require('../services/activityLogger');

/**
 * Auto-Logger Middleware
 * Automatically logs successful POST, PUT, PATCH, DELETE requests
 * completely non-blocking (Anti-Gravity).
 */
const autoLogger = (req, res, next) => {
  const method = req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    res.on('finish', () => {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire and forget
        setImmediate(() => {
          try {
            // Determine action type
            let action = 'CREATED';
            if (method === 'PUT' || method === 'PATCH') action = 'UPDATED';
            if (method === 'DELETE') action = 'DELETED';
            if (req.originalUrl.includes('login')) action = 'LOGIN';
            if (req.originalUrl.includes('logout')) action = 'LOGOUT';
            if (req.originalUrl.includes('approve')) action = 'APPROVED';
            if (req.originalUrl.includes('reject')) action = 'REJECTED';

            // Extract module name from URL (e.g. /api/assets -> ASSETS)
            let moduleName = 'SYSTEM';
            const urlParts = req.originalUrl.split('?')[0].split('/').filter(Boolean);
            if (urlParts.length >= 2 && urlParts[0] === 'api') {
              moduleName = urlParts[1].toUpperCase().replace('-', '_');
            }

            const userId = req.user ? req.user.id : null;
            if (!userId && action !== 'LOGIN') return; // Skip if no user context (except maybe login which handles itself or gets ignored here)

            // Avoid double-logging logins if handled in controller
            if (action === 'LOGIN' || action === 'LOGOUT') return;

            // Sanitize sensitive body fields (passwords)
            let safeBody = { ...req.body };
            if (safeBody.password) delete safeBody.password;
            if (safeBody.old_password) delete safeBody.old_password;

            activityLogger.logActivity({
              user_id: userId,
              module: moduleName,
              action: action,
              description: `Auto-logged ${method} action on ${req.originalUrl}`,
              details: Object.keys(safeBody).length > 0 ? safeBody : null,
              client_id: req.user?.client_id || null,
              role: req.user?.role || req.user?.Role?.code || null,
              ip_address: req.ip || req.connection?.remoteAddress,
              request_method: method,
              request_path: req.originalUrl,
              user_agent: req.get('user-agent') || null
            });
          } catch (e) {
            // Never throw
          }
        });
      }
    });
  }
  next();
};

module.exports = autoLogger;
