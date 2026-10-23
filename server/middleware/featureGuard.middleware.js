'use strict';
const { FeatureToggle } = require('../models');
const { sendError } = require('../utils/response');

/**
 * Tenant-aware feature-toggle guard (SaaS standard: evaluate the flag for the
 * company making the request).
 *
 * Resolution precedence (most specific wins):
 *   1. tenant-specific row  (client_id = requester's client_id)
 *   2. global default row   (client_id IS NULL)
 *   3. no row found         -> ALLOW  (fail-open; preserves prior behaviour for
 *                                      features that have no toggle configured)
 * Only an explicit is_enabled = false (on the tenant row, or the global row when
 * the tenant has no override) blocks the request. New, opt-in features should be
 * seeded OFF per tenant so they stay isolated until explicitly enabled.
 *
 * @param {string} featureKey
 */
const checkFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      const clientId = req.user && req.user.client_id ? req.user.client_id : null;

      // 1. tenant-specific override (only when we know the tenant)
      let feature = clientId
        ? await FeatureToggle.findOne({ where: { feature_key: featureKey, client_id: clientId } })
        : null;

      // 2. fall back to the global default row (client_id IS NULL)
      if (!feature) {
        feature = await FeatureToggle.findOne({ where: { feature_key: featureKey, client_id: null } });
      }

      // 3. explicit disable blocks; otherwise allow
      if (feature && feature.is_enabled === false) {
        return sendError(res, `Feature '${featureKey}' is not enabled for your account.`, 403);
      }

      return next();
    } catch (error) {
      // Fail-open: never block the system on a toggle-resolution error.
      return next();
    }
  };
};

module.exports = checkFeature;
