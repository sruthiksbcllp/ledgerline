'use strict';

/**
 * FT-002 / Batch 0 — Security event emitter for tenant-isolation violations.
 *
 * Emitted when a tenant-scoped user is denied access to a row that exists under
 * another tenant (cross-tenant IDOR attempt). This is a SECURITY EVENT, not an
 * application error: it is fire-and-forget and MUST NEVER throw or block the
 * caller. The request still receives a 404 from the controller.
 */

const recordTenantViolation = (ctx = {}) => {
  try {
    const models = require('../models');
    const actorClient = ctx.actor_client_id != null ? ctx.actor_client_id : null;
    const targetModel = String(ctx.target_model || 'UNKNOWN');
    const targetId = ctx.target_id != null ? ctx.target_id : null;

    const payload = {
      user_id: ctx.user_id != null ? ctx.user_id : null,
      action: 'TENANT_ISOLATION_VIOLATION',
      module: targetModel,
      client_id: actorClient,
      request_path: ctx.request_path || null,
      ip_address: ctx.ip_address || null,
      actor_role: ctx.actor_role || null,
      description: `Tenant isolation violation: user ${ctx.user_id} (client ${actorClient}) `
        + `attempted cross-tenant access to ${targetModel}#${targetId}`,
      metadata: {
        target_model: targetModel,
        target_id: targetId,
        target_where: ctx.target_where || null,
        detected_at: new Date().toISOString()
      }
    };

    // Immutable audit channel. activitylogs.user_id is NOT NULL, so skip the row
    // if the actor is unknown (still attempt SIEM below). Never await; never throw.
    if (payload.user_id != null && models.ActivityLog && typeof models.ActivityLog.create === 'function') {
      Promise.resolve(models.ActivityLog.create(payload)).catch(() => {});
    }

    // Optional SIEM forwarding if configured. Fully guarded — never required.
    try {
      const siem = require('../services/siemForwarder.service');
      if (siem && typeof siem.forward === 'function') {
        Promise.resolve(siem.forward('TENANT_ISOLATION_VIOLATION', payload)).catch(() => {});
      }
    } catch (_) { /* SIEM optional */ }
  } catch (_) {
    // Swallow — security logging must never break the caller.
  }
};

module.exports = { recordTenantViolation };
