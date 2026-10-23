'use strict';
/**
 * GL Posting Service
 * ------------------
 * Generates journal entries for asset lifecycle events and pushes them
 * to the integration queue. ONLY runs when the GL_INTEGRATION feature
 * toggle is enabled for the client — otherwise all functions are no-ops.
 *
 * Supported events:
 *   - DEPRECIATION  (monthly depreciation run)
 *   - ACQUISITION   (GRN received / asset capitalised)
 *   - DISPOSAL      (asset disposed / written off)
 *   - TRANSFER      (inter-company asset transfer)
 */

const { FeatureToggle, IntegrationConfig } = require('../models');

// ─── Toggle Check ────────────────────────────────────────────────
/**
 * Returns true only if GL_INTEGRATION is explicitly enabled for this client.
 * Falls back to global toggle if no per-client override exists.
 * Default is OFF — safe for all existing customers.
 */
const isGLEnabled = async (clientId) => {
  try {
    // 1. Check per-client override first
    if (clientId) {
      const clientToggle = await FeatureToggle.findOne({
        where: { feature_key: 'GL_INTEGRATION', client_id: clientId }
      });
      if (clientToggle) return !!clientToggle.is_enabled;
    }

    // 2. Fall back to global toggle
    const globalToggle = await FeatureToggle.findOne({
      where: { feature_key: 'GL_INTEGRATION', client_id: null }
    });
    return globalToggle ? !!globalToggle.is_enabled : false;
  } catch {
    return false; // fail-closed: if toggle check fails, don't post
  }
};

/**
 * Check if an active ERP integration config exists for this client.
 */
const getActiveConfig = async (clientId) => {
  try {
    // IntegrationConfig is currently global — find any active one
    const config = await IntegrationConfig.findOne({
      where: { is_active: true }
    });
    return config;
  } catch {
    return null;
  }
};

// ─── Journal Entry Builder ───────────────────────────────────────

/**
 * Build a standard double-entry journal payload.
 */
const buildJournal = ({ eventType, narration, entries, meta }) => ({
  event_type: eventType,
  narration,
  journal_date: new Date().toISOString().split('T')[0],
  entries,   // [{ ledger, debit, credit }]
  meta       // any extra context (asset_code, fiscal_year, etc.)
});

// ─── Event Handlers ──────────────────────────────────────────────

/**
 * Post depreciation journal entries after a monthly depreciation run.
 * Called from depreciationPosting.service.js AFTER ledger rows are created.
 *
 * @param {Object} opts
 * @param {number|null} opts.clientId
 * @param {string} opts.fiscal_year  e.g. "2026-27"
 * @param {number} opts.period_month e.g. 4
 * @param {Array}  opts.posted       array of { asset_id, asset_code, book_type, depreciation_amount }
 */
const postDepreciation = async ({ clientId, fiscal_year, period_month, posted }) => {
  if (!await isGLEnabled(clientId)) return null;
  const config = await getActiveConfig(clientId);
  if (!config) return null;

  const { resolveAccounts, buildEntries } = require('./glAccountResolver');
  const { enqueue, buildDedupeKey } = require('./accountingEventService');
  // CR-N01: resolve mapped Dr/Cr once (client-level default); null => keep legacy labels.
  const depMap = await resolveAccounts(clientId, 'DEPRECIATION');

  // Group by book_type to create fewer JVs
  const byBook = {};
  for (const p of posted) {
    if (!byBook[p.book_type]) byBook[p.book_type] = [];
    byBook[p.book_type].push(p);
  }

  const results = [];
  for (const [bookType, items] of Object.entries(byBook)) {
    const totalAmount = items.reduce((s, i) => s + (Number(i.depreciation_amount) || 0), 0);
    if (totalAmount <= 0) continue;

    const journal = buildJournal({
      eventType: 'DEPRECIATION',
      narration: `Depreciation ${bookType} for ${fiscal_year} M${period_month} (${items.length} assets)`,
      entries: buildEntries({
        debitDefault: 'Depreciation Expense',
        creditDefault: 'Accumulated Depreciation',
        amount: totalAmount,
        mapping: depMap
      }),
      meta: {
        fiscal_year,
        period_month,
        book_type: bookType,
        asset_count: items.length,
        assets: items.map(i => ({ asset_code: i.asset_code, amount: i.depreciation_amount }))
      }
    });

    const dedupeKey = buildDedupeKey({ clientId, eventType: 'DEPRECIATION', ref: `${bookType}:${fiscal_year}:${period_month}` });
    const queued = await enqueue({ clientId, eventType: 'DEPRECIATION', erpType: config.erp_type, action: 'POST_DEPRECIATION_JV', journal, dedupeKey, origin: null });
    results.push(queued);
  }

  return results;
};

/**
 * Post acquisition journal entry when a GRN is received (asset capitalised).
 * Called from grn.controller.js AFTER GRN is created.
 *
 * @param {Object} opts
 * @param {number|null} opts.clientId
 * @param {Object} opts.grn        the GRN record
 * @param {Object} opts.po         the related PurchaseOrder
 * @param {number} opts.totalAmount total GRN value
 */
const postAcquisition = async ({ clientId, grn, po, totalAmount }) => {
  if (!await isGLEnabled(clientId)) return null;
  const config = await getActiveConfig(clientId);
  if (!config) return null;

  const { resolveAccounts, buildEntries } = require('./glAccountResolver');
  const { enqueue, buildDedupeKey } = require('./accountingEventService');
  // CR-N01: resolve mapped Dr/Cr (client-level default); null => keep legacy labels.
  const acqMap = await resolveAccounts(clientId, 'ACQUISITION');

  const journal = buildJournal({
    eventType: 'ACQUISITION',
    narration: `Asset acquisition via GRN #${grn.id} / PO #${po?.po_number || po?.id || 'N/A'}`,
    entries: buildEntries({
      debitDefault: 'Fixed Assets',
      creditDefault: 'Accounts Payable',
      amount: totalAmount,
      mapping: acqMap
    }),
    meta: {
      grn_id: grn.id,
      po_id: po?.id,
      po_number: po?.po_number,
      vendor_name: po?.vendor_name || grn.vendor_name,
      invoice_number: grn.invoice_number
    }
  });

  const dedupeKey = buildDedupeKey({ clientId, eventType: 'ACQUISITION', ref: `GRN:${grn?.id}` });
  return enqueue({
    clientId, eventType: 'ACQUISITION', erpType: config.erp_type, action: 'POST_ACQUISITION_JV',
    journal, dedupeKey, origin: null,
    amount: Math.round((Number(totalAmount) || 0) * 100) / 100,
    sourceType: 'GRN', sourceRef: grn?.id, userId: grn?.created_by || null
  });
};

/**
 * Post disposal journal entry when an asset is disposed.
 * Called from assetDisposal controller/service after approval/completion.
 *
 * @param {Object} opts
 * @param {number|null} opts.clientId
 * @param {Object} opts.asset           the disposed asset
 * @param {number} opts.accumulatedDep   accumulated depreciation to date
 * @param {number} opts.saleValue        proceeds from disposal (0 if scrapped)
 * @param {string} opts.disposalMethod   e.g. 'SALE', 'SCRAP', 'WRITE_OFF'
 */
const postDisposal = async ({ clientId, asset, accumulatedDep, saleValue, disposalMethod }) => {
  if (!await isGLEnabled(clientId)) return null;
  const config = await getActiveConfig(clientId);
  if (!config) return null;

  const { pushToQueue } = require('./integrationEngine');

  const originalCost = Number(asset.purchase_cost || asset.total_cost || 0);
  const nbv = originalCost - (Number(accumulatedDep) || 0);
  const gainLoss = (Number(saleValue) || 0) - nbv;

  const entries = [
    { ledger: 'Accumulated Depreciation', debit: Math.round((Number(accumulatedDep) || 0) * 100) / 100, credit: 0 }
  ];

  if (saleValue > 0) {
    entries.push({ ledger: 'Bank / Cash', debit: Math.round(saleValue * 100) / 100, credit: 0 });
  }

  if (gainLoss < 0) {
    entries.push({ ledger: 'Loss on Disposal', debit: Math.round(Math.abs(gainLoss) * 100) / 100, credit: 0 });
  } else if (gainLoss > 0) {
    entries.push({ ledger: 'Profit on Disposal', debit: 0, credit: Math.round(gainLoss * 100) / 100 });
  }

  entries.push({ ledger: 'Fixed Assets', debit: 0, credit: Math.round(originalCost * 100) / 100 });

  const journal = buildJournal({
    eventType: 'DISPOSAL',
    narration: `Asset disposal (${disposalMethod}) — ${asset.asset_code} ${asset.asset_name}`,
    entries,
    meta: {
      asset_id: asset.id,
      asset_code: asset.asset_code,
      original_cost: originalCost,
      accumulated_dep: accumulatedDep,
      nbv,
      sale_value: saleValue,
      gain_loss: gainLoss,
      disposal_method: disposalMethod
    }
  });

  return pushToQueue(config.erp_type, 'POST_DISPOSAL_JV', journal);
};

/**
 * Post inter-company transfer journal entries.
 *
 * @param {Object} opts
 * @param {number|null} opts.clientId
 * @param {Object} opts.asset
 * @param {string} opts.fromCompanyName
 * @param {string} opts.toCompanyName
 * @param {number} opts.transferValue   NBV at transfer date
 */
const postTransfer = async ({ clientId, asset, fromCompanyName, toCompanyName, transferValue }) => {
  if (!await isGLEnabled(clientId)) return null;
  const config = await getActiveConfig(clientId);
  if (!config) return null;

  const { pushToQueue } = require('./integrationEngine');
  const amount = Math.round((Number(transferValue) || 0) * 100) / 100;

  const journal = buildJournal({
    eventType: 'TRANSFER',
    narration: `Inter-company transfer — ${asset.asset_code} from ${fromCompanyName} to ${toCompanyName}`,
    entries: [
      { ledger: `Inter-Co Receivable (${toCompanyName})`, debit: amount, credit: 0 },
      { ledger: `Fixed Assets (${fromCompanyName})`, debit: 0, credit: amount }
    ],
    meta: {
      asset_id: asset.id,
      asset_code: asset.asset_code,
      from_company: fromCompanyName,
      to_company: toCompanyName,
      transfer_value: amount
    }
  });

  return pushToQueue(config.erp_type, 'POST_TRANSFER_JV', journal);
};

module.exports = {
  isGLEnabled,
  postDepreciation,
  postAcquisition,
  postDisposal,
  postTransfer
};
