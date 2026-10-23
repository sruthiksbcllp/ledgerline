'use strict';

/**
 * Audit trail for AP/AR documents: every state change goes to the tamper-evident
 * ImmutableAuditLog (hash-chained before/after) and the activity feed, and can be
 * read back as a per-document history.
 */
const ImmutableAuditService = require('../services/ImmutableAuditService');
const { logActivity } = require('./activityLogger');
const { ImmutableAuditLog, User } = require('../models');

const plain = (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row) || null;

/** Never throws: an audit failure must not undo a committed business action. */
async function recordAudit(req, { module, entityType, entityId, action, before = null, after = null, note = null }) {
  const clientId = after?.client_id ?? before?.client_id ?? req.user?.client_id ?? null;
  await ImmutableAuditService.log({
    clientId,
    userId: req.user?.id,
    action,
    module,
    entityType,
    entityId,
    beforeData: plain(before),
    afterData: note ? { ...plain(after), _note: note } : plain(after),
    req
  }).catch(() => {});
  await logActivity({
    user_id: req.user?.id,
    role: req.user?.role,
    action,
    module,
    client_id: clientId,
    metadata: { entity_type: entityType, entity_id: entityId, note }
  }).catch(() => {});
}

/** Chronological history for one document, scoped to the caller's company unless provider. */
async function documentHistory(tenantWhere, entityType, entityId) {
  const rows = await ImmutableAuditLog.findAll({
    where: { ...tenantWhere, entity_type: entityType, entity_id: entityId },
    order: [['id', 'ASC']],
    raw: true
  });
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'first_name', 'last_name', 'username'], raw: true }) : [];
  const nameOf = Object.fromEntries(users.map((u) => [u.id, `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    at: r.created_at || r.createdAt,
    user: nameOf[r.user_id] || (r.user_id ? `User #${r.user_id}` : 'System'),
    note: r.payload?.afterData?._note || null,
    status_after: r.payload?.afterData?.status || null
  }));
}

module.exports = { recordAudit, documentHistory };
