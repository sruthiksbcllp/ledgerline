'use strict';
/**
 * Phase C — buying-entity GSTIN resolver (place of supply).
 * Strict by design: returns the entity's REGULAR + ACTIVE GSTIN registered in the
 * delivery state, else null (NEVER guesses with an ISD/SEZ or out-of-state GSTIN).
 * Tax correctness > convenience — a null tells the caller "no valid registration in
 * this state", which finance must resolve, rather than silently using a wrong GSTIN.
 *
 * Flag-gated by GST_PLACE_OF_SUPPLY (tenant row -> global -> default OFF). With the
 * flag off, callers skip resolution entirely -> behaviour byte-identical to today.
 */
const { EntityGstRegistration, FeatureToggle } = require('../models');

async function isPlaceOfSupplyEnabled(clientId) {
  try {
    let tog = clientId
      ? await FeatureToggle.findOne({ where: { feature_key: 'GST_PLACE_OF_SUPPLY', client_id: clientId } })
      : null;
    if (!tog) tog = await FeatureToggle.findOne({ where: { feature_key: 'GST_PLACE_OF_SUPPLY', client_id: null } });
    return !!(tog && tog.is_enabled);
  } catch (e) {
    return false;
  }
}

/**
 * @returns {Promise<string|null>} the REGULAR+ACTIVE GSTIN in `stateCode`, or null.
 */
async function resolveBuyerGstin({ entityId, stateCode, clientId } = {}) {
  if (!entityId || !stateCode) return null;
  try {
    const where = {
      entity_id: entityId,
      state_code: String(stateCode).slice(0, 2),
      taxpayer_type: 'REGULAR',
      is_active: true
    };
    if (clientId) where.client_id = clientId;
    const row = await EntityGstRegistration.findOne({ where });
    return row ? row.gstin : null;
  } catch (e) {
    return null;
  }
}

module.exports = { isPlaceOfSupplyEnabled, resolveBuyerGstin };
