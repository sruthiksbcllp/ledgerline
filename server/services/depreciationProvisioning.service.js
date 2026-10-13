'use strict';
/**
 * ENTERPRISE DEPRECIATION PROVISIONING (tenant-agnostic).
 *
 * Gives every client a complete, working depreciation configuration built from the GLOBAL
 * defaults (config/depreciationDefaults.js). Used by:
 *   - client onboarding (auto-provision on client creation)
 *   - scripts/seed-enterprise-defaults.js (provision + backfill ALL existing clients)
 *
 * Guarantees:
 *   - Idempotent — safe to run any number of times, creates no duplicates.
 *   - NEVER overwrites a client customization — only creates missing rows and fills MISSING
 *     depreciation fields (nulls). An existing client value is left exactly as-is.
 *   - Tenant-isolated — every category is stamped with the client's client_id; sub-categories
 *     are scoped through their parent category.
 */
const { AssetCategory, AssetSubCategory } = require('../models');
const { getActiveDefaults, defaultForKey, matchDefaultKey } = require('../config/depreciationDefaults');
const { isComplete } = require('../utils/depreciationConfig');

// Return ONLY the depreciation fields that are missing on `row`, filled from `def` (a default
// sub spec). Never returns a field the row already has a valid value for. `forCategory` remaps
// the residual field name (category uses companies_act_residual_percent; sub uses residual_pct).
function fillMissingFromDefault(row, def, forCategory = false) {
  const cur = row && typeof row.get === 'function' ? row.get({ plain: true }) : (row || {});
  const upd = {};

  const life = cur.useful_life != null ? cur.useful_life : cur.companies_act_life;
  if (!(Number(life) > 0)) { upd.useful_life = def.useful_life; upd.companies_act_life = def.useful_life; }

  if (!['SLM', 'WDV'].includes(String(cur.companies_act_method || '').toUpperCase())) {
    upd.companies_act_method = def.companies_act_method;
    if (forCategory) upd.depreciation_method = def.companies_act_method;
  }

  const resid = cur.residual_pct != null ? cur.residual_pct : cur.companies_act_residual_percent;
  if (resid == null) {
    if (forCategory) upd.companies_act_residual_percent = def.residual_pct;
    else upd.residual_pct = def.residual_pct;
  }

  if (!String(cur.it_act_block || '').trim()) upd.it_act_block = def.it_act_block;
  if (cur.it_act_rate == null || cur.it_act_rate === '') upd.it_act_rate = def.it_act_rate;

  return upd;
}

/**
 * Provision (create-if-missing + fill-if-incomplete) the standard categories and sub-categories
 * from the active global defaults for one client. Returns a summary.
 */
async function provisionClientDepreciation(clientId, opts = {}) {
  const transaction = opts.transaction;
  const defaults = getActiveDefaults();
  const summary = { client_id: clientId, policy_set: defaults.policy_set, categories_created: 0, subs_created: 0, subs_filled: 0 };

  for (const cat of defaults.categories) {
    const [category, catCreated] = await AssetCategory.findOrCreate({
      where: { client_id: clientId, category_name: cat.category_name },
      defaults: {
        client_id: clientId,
        category_name: cat.category_name,
        status: 'ACTIVE',
        companies_act_life: cat.sub.useful_life,
        useful_life: cat.sub.useful_life,
        companies_act_method: cat.sub.companies_act_method,
        depreciation_method: cat.sub.companies_act_method,
        companies_act_residual_percent: cat.sub.residual_pct,
        it_act_block: cat.sub.it_act_block,
        it_act_rate: cat.sub.it_act_rate,
      },
      transaction,
    });
    if (catCreated) summary.categories_created++;
    else {
      const catUpd = fillMissingFromDefault(category, cat.sub, true);
      if (Object.keys(catUpd).length) await category.update(catUpd, { transaction });
    }

    const [sub, subCreated] = await AssetSubCategory.findOrCreate({
      where: { category_id: category.id, sub_category_name: cat.sub.sub_category_name },
      defaults: {
        category_id: category.id,
        sub_category_name: cat.sub.sub_category_name,
        status: 'ACTIVE',
        useful_life: cat.sub.useful_life,
        companies_act_life: cat.sub.useful_life,
        companies_act_method: cat.sub.companies_act_method,
        residual_pct: cat.sub.residual_pct,
        it_act_block: cat.sub.it_act_block,
        it_act_rate: cat.sub.it_act_rate,
      },
      transaction,
    });
    if (subCreated) summary.subs_created++;
    else {
      const subUpd = fillMissingFromDefault(sub, cat.sub, false);
      if (Object.keys(subUpd).length) { await sub.update(subUpd, { transaction }); summary.subs_filled++; }
    }
  }
  return summary;
}

/**
 * Backfill pre-existing sub-categories that are incomplete (created before this feature, or via
 * ad-hoc master data) by NAME-matching their parent category (or their own name) to a default,
 * then filling ONLY the missing fields. Unmatched incomplete subs are reported, not guessed.
 */
async function backfillClientSubcategories(clientId, opts = {}) {
  const transaction = opts.transaction;
  const cats = await AssetCategory.findAll({ where: { client_id: clientId }, transaction });
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const subs = cats.length
    ? await AssetSubCategory.findAll({ where: { category_id: cats.map((c) => c.id) }, transaction })
    : [];

  const summary = { client_id: clientId, subs_filled: 0, subs_unmatched: 0, unmatched: [] };
  for (const sub of subs) {
    if (isComplete(sub)) continue;
    const parent = catById[sub.category_id];
    const key = matchDefaultKey(parent && parent.category_name) || matchDefaultKey(sub.sub_category_name);
    const def = key ? defaultForKey(key) : null;
    if (!def) { summary.subs_unmatched++; summary.unmatched.push(sub.sub_category_name); continue; }
    const upd = fillMissingFromDefault(sub, def.sub, false);
    if (Object.keys(upd).length) { await sub.update(upd, { transaction }); summary.subs_filled++; }
  }
  return summary;
}

module.exports = { provisionClientDepreciation, backfillClientSubcategories, fillMissingFromDefault };
