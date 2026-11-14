'use strict';

/**
 * GSTIN helpers. A regular GSTIN is 15 characters: 2-digit state code, the holder's 10-character
 * PAN, entity number, 'Z', and a check digit computed from the first 14 characters (mod 36).
 */
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const clean = (g) => String(g || '').replace(/[\s-]/g, '').toUpperCase();

/** The check digit the first 14 characters call for. */
function checkDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** { valid, reason } for a regular GSTIN: right shape and right check digit. */
function checkGstin(gstin) {
  const g = clean(gstin);
  if (!PATTERN.test(g)) return { valid: false, reason: 'not in the GSTIN format' };
  if (checkDigit(g.slice(0, 14)) !== g[14]) return { valid: false, reason: 'its check digit is wrong' };
  return { valid: true, reason: null };
}

const stateOf = (gstin) => (PATTERN.test(clean(gstin)) ? clean(gstin).slice(0, 2) : null);
const panOf = (gstin) => (PATTERN.test(clean(gstin)) ? clean(gstin).slice(2, 12) : null);

module.exports = { clean, checkDigit, checkGstin, stateOf, panOf, PATTERN };
