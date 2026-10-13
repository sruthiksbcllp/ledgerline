'use strict';
/**
 * Phase 3 — email-link approval tokens (external, no-login approvers).
 * Security model: a high-entropy random token is emailed; only its SHA-256 hash is
 * stored. Tokens are single-use (atomic conditional UPDATE) and time-limited. There is
 * no secret-key management — possession of the raw token is the credential, and it
 * cannot be derived from the stored hash.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { ExternalApprovalToken } = require('../models');

const TTL_DAYS_DEFAULT = Number(process.env.EMAIL_APPROVAL_TTL_DAYS || 7);

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Mint a token row and return the RAW token (only returned here — never stored).
 */
async function issueToken({ clientId, module, documentId, approverEmail, approverName, purpose = 'DOA_APPROVAL', ttlDays = TTL_DAYS_DEFAULT, createdBy = null, approvalLogId = null, stepId = null }, options = {}) {
  if (!clientId || !module || !documentId || !approverEmail) {
    throw new Error('issueToken: clientId, module, documentId, approverEmail are required');
  }
  const raw = crypto.randomBytes(32).toString('base64url'); // 256-bit
  const token_hash = hashToken(raw);
  const expires_at = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await ExternalApprovalToken.create({
    client_id: clientId, token_hash, module, document_id: documentId,
    approval_log_id: approvalLogId, approver_email: approverEmail, approver_name: approverName || null,
    purpose, expires_at, created_by: createdBy, step_id: stepId
  }, options);
  return { raw, expires_at };
}

/**
 * Read-only validation (used to render the confirm page). Does NOT consume.
 */
async function validateToken(rawToken) {
  if (!rawToken) return { valid: false, reason: 'MISSING' };
  const row = await ExternalApprovalToken.findOne({ where: { token_hash: hashToken(rawToken) } });
  if (!row) return { valid: false, reason: 'NOT_FOUND' };
  if (row.consumed_at) return { valid: false, reason: 'ALREADY_USED', token: row };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { valid: false, reason: 'EXPIRED', token: row };
  return { valid: true, token: row };
}

/**
 * Atomically consume the token and record the decision. Single-use is guaranteed by the
 * conditional WHERE (consumed_at IS NULL AND not expired); a race / double-click yields
 * exactly one successful consume.
 * @returns {Promise<{ok:boolean, reason?:string, token?:object}>}
 */
async function consumeToken(rawToken, decision, { ip = null, comment = null } = {}) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) return { ok: false, reason: 'BAD_DECISION' };
  if (!rawToken) return { ok: false, reason: 'MISSING' };
  const token_hash = hashToken(rawToken);
  const [affected] = await ExternalApprovalToken.update(
    { consumed_at: new Date(), decision, decided_ip: ip, decided_comment: comment },
    { where: { token_hash, consumed_at: { [Op.is]: null }, expires_at: { [Op.gt]: new Date() } } }
  );
  if (affected !== 1) {
    const probe = await validateToken(rawToken);
    return { ok: false, reason: probe.reason === 'ALREADY_USED' ? 'ALREADY_USED' : (probe.reason || 'INVALID') };
  }
  const token = await ExternalApprovalToken.findOne({ where: { token_hash } });
  return { ok: true, token };
}

module.exports = { hashToken, issueToken, validateToken, consumeToken, TTL_DAYS_DEFAULT };
