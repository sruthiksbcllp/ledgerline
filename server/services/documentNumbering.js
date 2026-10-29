'use strict';
const { DocumentNumberingConfig, sequelize } = require('../models');

/**
 * Document Numbering Service
 * Generates unique, configurable document numbers for PR, PO, GRN, QUOTATION, RFQ, INVOICE.
 * Uses SELECT FOR UPDATE within the CALLER's transaction for atomicity.
 * Falls back to legacy format when no config exists (backward compatible).
 *
 * DO NOT MODIFY utils/sequence.js or services/asset.service.js — those handle asset codes separately.
 *
 * Dynamic dimensions (all optional, opt-in per config row):
 *   - include_location   (CR-P06)  -> locationCode passed by caller
 *   - include_entity     (the client)     -> entityCode (entity short_code) passed by caller
 *   - include_department (the client)     -> departmentCode passed by caller
 * Segment order: PREFIX [entity] [department] [static entity_code] [location] [FY] SEQUENCE
 * The sequence counter is scoped by every dynamic segment present, so e.g. PR-NIM-IT and
 * PR-NIM-ADM each keep their own running series (they "won't double").
 */

const DEFAULTS = {
  PR:        { prefix: 'PR',  separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  PO:        { prefix: 'PO',  separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  GRN:       { prefix: 'GRN', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  QUOTATION: { prefix: 'QTN', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  RFQ:       { prefix: 'RFQ', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  INVOICE:   { prefix: 'INV', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  SES:       { prefix: 'SES', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 },
  RETURN:    { prefix: 'PRN', separator: '-', padding: 4, fy_format: 'YYYY', fy_start_month: 1 }, // purchase return to vendor
};

/**
 * Compute financial year string based on format and start month.
 */
function formatFY(format, startMonth) {
  const now = new Date();
  let fyYear = now.getFullYear();
  // If FY starts in a month > 1 (e.g. April=4), and current month < start, we're in the previous FY
  if (startMonth > 1 && (now.getMonth() + 1) < startMonth) {
    fyYear -= 1;
  }
  switch (format) {
    case 'YY':     return String(fyYear).slice(-2);
    case 'FYXX':   return 'FY' + String(fyYear).slice(-2);
    case 'FYXXXX': return 'FY' + String(fyYear);
    case 'YYYY':
    default:       return String(fyYear);
  }
}

/**
 * Compute reset period key for sequence scoping.
 */
function getResetPeriod(resetType, fyStartMonth) {
  if (resetType === 'NEVER') return 'GLOBAL';
  const now = new Date();
  if (resetType === 'MONTHLY') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  // YEARLY (default)
  let fyYear = now.getFullYear();
  if (fyStartMonth > 1 && (now.getMonth() + 1) < fyStartMonth) {
    fyYear -= 1;
  }
  return String(fyYear);
}

/**
 * Assemble the human-readable number.
 * Segment order: PREFIX [ent] [dept] [staticEnt] [loc] [fy] SEQ
 */
function assembleNumber({ pre, sep, ent, dept, staticEnt, loc, fyStr, seq, pad }) {
  const parts = [pre];
  if (ent) parts.push(ent);            // dynamic entity short_code (the client)
  if (dept) parts.push(dept);          // dynamic department code (the client)
  if (staticEnt) parts.push(staticEnt);// config static entity_code (legacy)
  if (loc) parts.push(loc);            // CR-P06 location dimension
  if (fyStr) parts.push(fyStr);
  parts.push(String(seq).padStart(pad, '0'));
  return parts.join(sep);
}

/**
 * Generate the next document number atomically.
 *
 * @param {number} clientId - Tenant ID
 * @param {string} docType  - One of PR, PO, GRN, QUOTATION, RFQ, INVOICE
 * @param {Transaction} transaction - Sequelize transaction from the caller (REQUIRED)
 * @param {string|object} opts - Legacy: location code string. New: { locationCode, entityCode, departmentCode }
 * @returns {string} Generated document number
 */
async function getNextNumber(clientId, docType, transaction, opts) {
  if (!clientId) throw new Error('clientId is required for document numbering');
  if (!docType || !DEFAULTS[docType]) throw new Error(`Unknown document type: ${docType}`);
  if (!transaction) throw new Error('Transaction is required for atomic numbering');

  // Backward compat: opts may be a bare locationCode string (pre-the client callers)
  const o = (typeof opts === 'string') ? { locationCode: opts } : (opts || {});
  const locationCodeIn   = o.locationCode   != null ? String(o.locationCode).trim()   : null;
  const entityCodeIn     = o.entityCode     != null ? String(o.entityCode).trim()     : null;
  const departmentCodeIn = o.departmentCode != null ? String(o.departmentCode).trim() : null;

  // 1. Look up client config (may be null -> use defaults)
  const config = await DocumentNumberingConfig.findOne({
    where: { client_id: clientId, document_type: docType, is_active: true },
    transaction
  });

  const sep       = config?.separator       || DEFAULTS[docType].separator;
  const pre       = config?.prefix          || DEFAULTS[docType].prefix;
  const staticEnt = config?.entity_code     || null;
  const includeFy = config?.include_fy !== undefined ? config.include_fy : true;
  const fyFmt     = config?.fy_format       || DEFAULTS[docType].fy_format;
  const fyStart   = config?.fy_start_month  || DEFAULTS[docType].fy_start_month;
  const pad       = config?.sequence_padding || DEFAULTS[docType].padding;
  const start     = config?.sequence_start  || 1;
  const reset     = config?.reset_sequence  || 'YEARLY';
  const loc       = (config && config.include_location   && locationCodeIn)   ? locationCodeIn   : null; // CR-P06
  const ent       = (config && config.include_entity     && entityCodeIn)     ? entityCodeIn     : null; // the client
  const dept      = (config && config.include_department && departmentCodeIn) ? departmentCodeIn : null; // the client

  // 2. Compute FY string and reset period
  const fyStr     = includeFy ? formatFY(fyFmt, fyStart) : null;
  const period    = getResetPeriod(reset, fyStart);

  // 3. Build sequence key: clientId:docType:[ent]:[dept]:[loc]:period
  //    Every dynamic segment present scopes the counter independently.
  const scope = [ent, dept, loc].filter(Boolean).join(':');
  const seqKey = scope
    ? `${clientId}:${docType}:${scope}:${period}`
    : `${clientId}:${docType}:${period}`;

  // 4. Atomic increment using caller's transaction
  //    INSERT IGNORE ensures the row exists (safe under concurrency)
  await sequelize.query(
    'INSERT IGNORE INTO idsequences (`prefix`, `last_value`, `createdAt`, `updatedAt`) VALUES (?, ?, NOW(), NOW())',
    { replacements: [seqKey, start - 1], transaction }
  );

  //    SELECT FOR UPDATE locks the row within the caller's transaction
  const [rows] = await sequelize.query(
    'SELECT `last_value` FROM idsequences WHERE `prefix` = ? FOR UPDATE',
    { replacements: [seqKey], type: sequelize.QueryTypes.SELECT, transaction }
  );
  const next = Number(rows.last_value) + 1;

  //    UPDATE the counter
  await sequelize.query(
    'UPDATE idsequences SET `last_value` = ?, `updatedAt` = NOW() WHERE `prefix` = ?',
    { replacements: [next, seqKey], transaction }
  );

  // 5. Assemble number
  const formatted = assembleNumber({ pre, sep, ent, dept, staticEnt, loc, fyStr, seq: next, pad });

  // Backward compat: if no config exists, prepend C{clientId} after prefix
  if (!config) {
    return `${pre}${sep}C${clientId}${sep}${fyStr || new Date().getFullYear()}${sep}${String(next).padStart(pad, '0')}`;
  }

  return formatted;
}

module.exports = { getNextNumber, assembleNumber, formatFY, getResetPeriod, DEFAULTS };
