'use strict';

/**
 * activityLog — fire-and-forget middleware that writes a VIEW event to the
 * immutable audit trail after the response is sent.  Never blocks the request.
 *
 * Usage:
 *   router.get('/assets', verifyToken, activityLog('ASSET', 'MODULE'), ctrl.getAll);
 *   router.get('/assets/:id', verifyToken, activityLog('ASSET', 'ASSET', r => r.params.id), ctrl.getOne);
 *
 * @param {string}   module       - e.g. 'ASSET', 'DEPRECIATION', 'DASHBOARD'
 * @param {string}   entityType   - e.g. 'MODULE', 'ASSET', 'PO'
 * @param {Function} [getEntityId]- optional (req) => entityId; omit for list views
 */
const activityLog = (module, entityType, getEntityId) => (req, res, next) => {
  res.on('finish', () => {
    // Only log successful responses; skip 4xx/5xx and non-GET requests
    if (res.statusCode >= 400 || req.method !== 'GET') return;
    try {
      const auditSvc = require('../services/ImmutableAuditService');
      auditSvc.log({
        action:     'VIEW',
        module,
        entityType,
        entityId:   getEntityId ? getEntityId(req) : null,
        userId:     req.user?.id,
        clientId:   req.user?.client_id,
        req,
      });
    } catch (_) { /* swallow — never block the app */ }
  });
  next();
};

module.exports = activityLog;
