'use strict';
/**
 * Accounting Event Service
 * ------------------------
 * CR-N08a: single choke-point for GL journal emission — opening-balance exclusion (C1)
 *          + idempotency (dedupe_key + UNIQUE index backstop).
 * CR-N07:  capitalisation approval gate for ACQUISITION events (reuses FT-002 engine,
 *          no engine modification). Flag CAPITALISATION_APPROVAL (default OFF) ⇒ byte-identical.
 *
 * Does NOT gate the GL_INTEGRATION flag (callers gate via glPostingService.isGLEnabled).
 */
const ORIGIN = { OPENING_BALANCE: 'OPENING_BALANCE' };

/** PURE. Stable dedupe key. */
function buildDedupeKey({ clientId, eventType, ref }) {
  return [clientId == null ? 'NA' : clientId, eventType, ref].join(':');
}

/** Is the capitalisation-approval gate ON for this tenant? Default OFF (no row ⇒ false). */
async function isCapApprovalEnabled(clientId) {
  try {
    const { FeatureToggle } = require('../models');
    if (clientId) {
      const c = await FeatureToggle.findOne({ where: { feature_key: 'CAPITALISATION_APPROVAL', client_id: clientId } });
      if (c) return !!c.is_enabled;
    }
    const g = await FeatureToggle.findOne({ where: { feature_key: 'CAPITALISATION_APPROVAL', client_id: null } });
    return g ? !!g.is_enabled : false;
  } catch { return false; }
}

/** Release a held/approved capitalisation's frozen JV to the queue (verbatim, idempotent). */
async function releaseToQueue(row, transaction) {
  if (row.released_queue_id) return { id: row.released_queue_id };
  const { IntegrationConfig } = require('../models');
  const cfg = await IntegrationConfig.findOne({ where: { is_active: true } });
  const erpType = (cfg && cfg.erp_type) || 'ORACLE';
  const { pushToQueue } = require('./integrationEngine');
  let queued;
  try {
    // VERBATIM frozen snapshot + original dedupe_key — no rebuild, no recompute.
    queued = await pushToQueue(erpType, 'POST_ACQUISITION_JV', row.journal_payload, { dedupe_key: row.dedupe_key });
  } catch (e) {
    if (e && e.name === 'SequelizeUniqueConstraintError') queued = { id: null }; else throw e;
  }
  await row.update({ released_queue_id: (queued && queued.id) || -1 }, transaction ? { transaction } : {});
  return queued;
}

/** Gate an ACQUISITION event: hold for approval / pending-config / auto-approve+release. */
async function gateCapitalisation({ clientId, amount, sourceType, sourceRef, journal, dedupeKey, userId }) {
  const { CapitalisationApproval, sequelize } = require('../models');
  const { initiateApproval } = require('./approvalEngine');

  const existing = await CapitalisationApproval.findOne({ where: { dedupe_key: dedupeKey } });
  if (existing) {
    return existing.released_queue_id
      ? { duplicate: true, capId: existing.id }
      : { held: true, capId: existing.id, status: existing.status };
  }
  const meta = (journal && journal.meta) || {};
  return await sequelize.transaction(async (t) => {
    const row = await CapitalisationApproval.create({
      client_id: clientId, source_type: sourceType || 'GRN', source_ref: String(sourceRef),
      amount, dedupe_key: dedupeKey,
      event_date: (journal && journal.journal_date) || new Date().toISOString().split('T')[0],
      fiscal_year: meta.fiscal_year || null, period_month: meta.period_month || null,
      journal_payload: journal, created_by: userId || null, status: 'PENDING_APPROVAL',
    }, { transaction: t });

    const init = await initiateApproval(row, 'CAPITALISATION', amount, userId || null, t, clientId);
    if (init.pending_configuration) return { pendingConfig: true, capId: row.id };
    if (init.auto_approved) { const q = await releaseToQueue(row, t); return { released: true, capId: row.id, queueId: q && q.id }; }
    return { held: true, capId: row.id }; // IN_APPROVAL
  });
}

/** Release a capitalisation after it is fully approved (called by approval.controller). */
async function releaseCapitalisation(capId) {
  const { CapitalisationApproval, sequelize } = require('../models');
  return sequelize.transaction(async (t) => {
    const row = await CapitalisationApproval.findByPk(capId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || !row.is_fully_approved || row.released_queue_id) return { released: false };
    const q = await releaseToQueue(row, t);
    return { released: true, queueId: q && q.id };
  });
}

/**
 * Enqueue a GL journal idempotently, with the CR-N07 capitalisation gate for ACQUISITION.
 */
async function enqueue({ clientId, eventType, erpType, action, journal, dedupeKey = null, origin = null,
                         amount = null, sourceType = null, sourceRef = null, userId = null, approved = false }) {
  if (eventType === 'ACQUISITION' && origin === ORIGIN.OPENING_BALANCE) return { skipped: 'OPENING_BALANCE' };
  // CR-N07: capitalisation approval gate (ACQUISITION only; skipped when already approved/released path).
  if (eventType === 'ACQUISITION' && !approved && await isCapApprovalEnabled(clientId)) {
    return await gateCapitalisation({ clientId, amount, sourceType, sourceRef, journal, dedupeKey, userId });
  }
  const { pushToQueue } = require('./integrationEngine');
  try {
    return await pushToQueue(erpType, action, journal, { dedupe_key: dedupeKey });
  } catch (e) {
    if (e && e.name === 'SequelizeUniqueConstraintError') return { duplicate: true, dedupe_key: dedupeKey };
    throw e;
  }
}

module.exports = { ORIGIN, buildDedupeKey, isCapApprovalEnabled, enqueue, releaseCapitalisation };
