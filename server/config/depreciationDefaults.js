'use strict';
/**
 * GLOBAL ENTERPRISE DEFAULT DEPRECIATION POLICY
 *
 * Statutory defaults (India): Companies Act Schedule II useful lives + Income Tax Act
 * blocks/rates. This is the single, tenant-AGNOSTIC source of truth used by:
 *   - client onboarding provisioning (services/depreciationProvisioning.service.js)
 *   - the enterprise backfill seeder (scripts/seed-enterprise-defaults.js)
 *
 * NO client names. NO tenant-specific logic. These are DEFAULTS ONLY — every tenant gets its
 * OWN copy as real category/sub-category rows and may override them without affecting anyone else.
 *
 * EXTENSIBILITY: the active set is COMPANIES_ACT_SLM. Future WDV / IFRS / country-specific
 * policies are added as additional entries in POLICY_SETS and selected via
 * DEPRECIATION_DEFAULT_POLICY_SET — consumers only call getActiveDefaults(), so no redesign.
 */

const COMPANIES_ACT_SLM = {
  policy_set: 'COMPANIES_ACT_SLM',
  categories: [
    { key: 'IT_EQUIPMENT', category_name: 'IT Equipment',
      sub: { sub_category_name: 'IT Equipment - General', useful_life: 3,  companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Computers',            it_act_rate: 40 } },
    { key: 'FURNITURE_FIXTURES', category_name: 'Furniture & Fixtures',
      sub: { sub_category_name: 'Furniture & Fixtures - General', useful_life: 10, companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Furniture & Fittings', it_act_rate: 10 } },
    { key: 'OFFICE_EQUIPMENT', category_name: 'Office Equipment',
      sub: { sub_category_name: 'Office Equipment - General', useful_life: 5,  companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Plant & Machinery', it_act_rate: 15 } },
    { key: 'PLANT_MACHINERY', category_name: 'Plant & Machinery',
      sub: { sub_category_name: 'Plant & Machinery - General', useful_life: 15, companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Plant & Machinery', it_act_rate: 15 } },
    { key: 'MOTOR_VEHICLES', category_name: 'Motor Vehicles',
      sub: { sub_category_name: 'Motor Vehicles - General', useful_life: 8, companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Motor Vehicles', it_act_rate: 15 } },
    { key: 'ELECTRICAL_INSTALLATIONS', category_name: 'Electrical Installations',
      sub: { sub_category_name: 'Electrical Installations - General', useful_life: 10, companies_act_method: 'SLM', residual_pct: 5, it_act_block: 'Plant & Machinery', it_act_rate: 15 } },
  ],
};

const POLICY_SETS = { COMPANIES_ACT_SLM };
const ACTIVE = process.env.DEPRECIATION_DEFAULT_POLICY_SET || 'COMPANIES_ACT_SLM';

function getActiveDefaults() {
  return POLICY_SETS[ACTIVE] || COMPANIES_ACT_SLM;
}

function defaultForKey(key) {
  return getActiveDefaults().categories.find((c) => c.key === key) || null;
}

/**
 * Map an arbitrary category/sub-category name to a default key — used ONLY when backfilling
 * pre-existing masters whose names differ from the canonical set. Returns a key or null
 * (null => leave for manual configuration; never guess a wrong statutory rate).
 */
function matchDefaultKey(name = '') {
  const s = String(name).toUpperCase();
  if (/COMPUTER|SERVER|LAPTOP|DESKTOP|\bIT\b|IT EQUIPMENT|INFORMATION TECH|NETWORK|SOFTWARE/.test(s)) return 'IT_EQUIPMENT';
  if (/FURNITURE|FIXTURE|FITTING/.test(s)) return 'FURNITURE_FIXTURES';
  if (/OFFICE/.test(s)) return 'OFFICE_EQUIPMENT';
  if (/VEHICLE|MOTOR|\bCAR\b|LORRY|TRUCK/.test(s)) return 'MOTOR_VEHICLES';
  if (/ELECTRIC|INSTALLATION/.test(s)) return 'ELECTRICAL_INSTALLATIONS';
  if (/PLANT|MACHINER/.test(s)) return 'PLANT_MACHINERY';
  return null;
}

module.exports = { getActiveDefaults, defaultForKey, matchDefaultKey, POLICY_SETS };
