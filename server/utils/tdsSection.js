'use strict';

const RATES = require('./tdsRates');

const find = (code) => RATES.find((r) => r.section === code);

/** "393(1) Sl. 6(iii) (old 194J)": the Income-tax Act 2025 reference with the familiar old number. */
const sectionLabel = (code) => {
  if (!code) return '';
  const row = find(code);
  return row ? `${row.act2025} (old ${code})` : String(code);
};

/**
 * Journal memo form, "194J [393(1) Sl. 6(iii)]": the old number stays first because TDS payable
 * by section is read back from the memo (apJournal.controller tdsBySection).
 */
const memoSection = (code) => {
  const row = find(code);
  return row ? `${code} [${row.act2025}]` : String(code || '');
};

/** New reference and challan payment code for a section, for the TDS deposit screen. */
const sectionInfo = (code) => {
  const row = find(code);
  return row ? { act2025: row.act2025, payment_code: row.payment_code, description: row.description } : { act2025: null, payment_code: null, description: null };
};

module.exports = { sectionLabel, memoSection, sectionInfo };
