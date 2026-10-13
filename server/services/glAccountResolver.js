'use strict';
/**
 * GL Account Resolver (CR-N01)
 * ----------------------------
 * Event-agnostic resolution of Dr/Cr GL accounts from `gl_account_mappings`.
 * Pure helpers (pickMapping, buildEntries) + async DB wrapper (resolveAccounts).
 *
 * Extensibility: to support a new event later, add it to EVENT_LEGS and call
 * resolveAccounts() in that builder. The resolver itself never changes.
 * Multi-leg events (DISPOSAL/TRANSFER/REVALUATION) need a per-leg descriptor +
 * richer config — that is CR-N08, NOT CR-N01.
 *
 * Fail-safe: any miss/error -> null, so the caller keeps today's hardcoded label
 * (=> byte-identical output when unmapped or when GL_INTEGRATION is OFF).
 */

// Declarative event registry. CR-N01 ships only the two 2-leg events.
const EVENT_LEGS = {
  ACQUISITION:  { type: '2-leg' },
  DEPRECIATION: { type: '2-leg' },
  // DISPOSAL / TRANSFER / REVALUATION: declared in CR-N08 (multi-leg). Resolver unchanged.
};

const _norm = v => (v === undefined ? null : v);

/**
 * PURE. Choose the best mapping row by precedence:
 *   (category, costCenter) > (category, null) > (null, null)
 * `rows` are assumed already filtered to client + event + is_active.
 * Returns { debit:{code,name}, credit:{code,name} } or null (incomplete -> null).
 */
function pickMapping(rows, { categoryId = null, costCenterId = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const match = (cat, cc) => rows.find(
    r => _norm(r.category_id) === _norm(cat) && _norm(r.cost_center_id) === _norm(cc));
  const row = match(categoryId, costCenterId) || match(categoryId, null) || match(null, null) || null;
  if (!row) return null;
  if (!row.debit_account_code || !row.credit_account_code) return null; // incomplete -> fallback
  return {
    debit:  { code: row.debit_account_code,  name: row.debit_account_name  || row.debit_account_code },
    credit: { code: row.credit_account_code, name: row.credit_account_name || row.credit_account_code },
  };
}

/**
 * PURE. Build a balanced 2-leg entry pair.
 * mapping == null -> legacy shape (ledger only, NO account_code) == byte-identical to today.
 * mapping present -> mapped account name as `ledger` + additive `account_code`.
 */
function buildEntries({ debitDefault, creditDefault, amount, mapping }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  const dr = mapping ? { ledger: mapping.debit.name,  account_code: mapping.debit.code }
                     : { ledger: debitDefault };
  const cr = mapping ? { ledger: mapping.credit.name, account_code: mapping.credit.code }
                     : { ledger: creditDefault };
  return [
    { ...dr, debit: amt, credit: 0 },
    { ...cr, debit: 0,   credit: amt },
  ];
}

/**
 * ASYNC. Resolve mapped accounts for (clientId, eventType). Fail-safe -> null.
 */
async function resolveAccounts(clientId, eventType, opts = {}) {
  if (!clientId || !eventType || !EVENT_LEGS[eventType]) return null;
  try {
    const { GLAccountMapping } = require('../models');
    const rows = await GLAccountMapping.findAll({
      where: { client_id: clientId, event_type: eventType, is_active: true },
    });
    return pickMapping((rows || []).map(r => (r && r.get ? r.get({ plain: true }) : r)), opts);
  } catch {
    return null;
  }
}

module.exports = { EVENT_LEGS, pickMapping, buildEntries, resolveAccounts };
