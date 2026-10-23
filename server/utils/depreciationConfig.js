'use strict';

/**
 * CR-DEP-P3 — Category-master depreciation config validation.
 *
 * Single source of truth for "is this (sub-)category configured for depreciation?".
 * Used by:
 *   - master.controller (mandatory validation on sub-category create/update)
 *   - asset.controller  (fail-fast when creating an asset in an unconfigured category)
 *   - the depreciation-gaps report endpoint
 *
 * D1 (locked): the SUB-CATEGORY is the authoritative depreciation-config level
 * (that is what depreciationEngine + depreciationPosting read first, and what the
 * Add-Asset form auto-fills from). The parent CATEGORY holds optional fallback
 * defaults used only when an asset has no sub-category.
 *
 * Field aliases handled:
 *   useful life  -> useful_life | companies_act_life
 *   residual %   -> residual_pct (sub-category) | companies_act_residual_percent (category)
 */

// Normalise a subcategory/category-like plain object into the 5 config values.
function readConfig(src = {}) {
  const s = src && typeof src.get === 'function' ? src.get({ plain: true }) : (src || {});
  return {
    useful_life: s.useful_life != null ? s.useful_life : (s.companies_act_life != null ? s.companies_act_life : null),
    companies_act_method: s.companies_act_method || s.depreciation_method || null,
    residual_pct: s.residual_pct != null ? s.residual_pct : (s.companies_act_residual_percent != null ? s.companies_act_residual_percent : null),
    it_act_block: s.it_act_block || null,
    it_act_rate: (s.it_act_rate != null && s.it_act_rate !== '') ? s.it_act_rate : null,
  };
}

// Return the list of missing/invalid fields for a config source. Empty = complete.
function missingFields(src = {}) {
  const c = readConfig(src);
  const missing = [];

  if (!(Number(c.useful_life) > 0)) missing.push('useful_life');

  if (!['SLM', 'WDV'].includes(String(c.companies_act_method || '').toUpperCase())) {
    missing.push('companies_act_method');
  }

  const resid = Number(c.residual_pct);
  // Residual is mandatory and Schedule-II capped at 5%. 0 is a valid explicit value.
  if (c.residual_pct == null || Number.isNaN(resid) || resid < 0 || resid > 5) {
    missing.push('residual_pct (0-5)');
  }

  if (!String(c.it_act_block || '').trim()) missing.push('it_act_block');

  // IT rate mandatory and >= 0 (0% is valid for e.g. land); null/blank is missing.
  if (c.it_act_rate == null || Number.isNaN(Number(c.it_act_rate)) || Number(c.it_act_rate) < 0) {
    missing.push('it_act_rate');
  }

  return missing;
}

function isComplete(src = {}) {
  return missingFields(src).length === 0;
}

module.exports = { readConfig, missingFields, isComplete };
