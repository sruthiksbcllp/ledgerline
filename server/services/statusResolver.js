'use strict';

/**
 * Cached Asset Status resolver — replaces all hardcoded status_id references.
 *
 * Usage:
 *   const { getStatusId, STATUS } = require('../services/statusResolver');
 *   const id = await getStatusId(STATUS.ACTIVE);
 */

// ── Status constants ────────────────────────────────────────────────
const STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  DISPOSED: 'DISPOSED',
  UNDER_MAINTENANCE: 'UNDER_MAINTENANCE',
  TRANSFERRED: 'TRANSFERRED',
});

// ── In-memory cache (lives for the process lifetime) ────────────────
const _cache = new Map();

/**
 * Returns the numeric `id` for an asset-status code.
 * First call hits the DB; subsequent calls return from cache.
 *
 * @param {string} code  One of the STATUS constants (e.g. 'ACTIVE')
 * @returns {Promise<number>}
 * @throws {Error} if the code does not exist in `asset_statuses`
 */
async function getStatusId(code) {
  if (_cache.has(code)) return _cache.get(code);

  const { AssetStatus } = require('../models');
  const row = await AssetStatus.findOne({
    where: { code },
    attributes: ['id'],
    raw: true,
  });

  if (!row) {
    throw new Error(
      `AssetStatus code "${code}" not found in asset_statuses table. ` +
      `Run migrations or seed the missing status.`
    );
  }

  _cache.set(code, row.id);
  return row.id;
}

/**
 * Pre-warm the cache for all standard statuses.
 * Optional — call at server startup for zero-latency first lookups.
 */
async function warmCache() {
  const { AssetStatus } = require('../models');
  const rows = await AssetStatus.findAll({ attributes: ['id', 'code'], raw: true });
  for (const r of rows) {
    if (r.code) _cache.set(r.code, r.id);
  }
}

/** Clear cache — useful in tests after truncating tables. */
function clearCache() {
  _cache.clear();
}

module.exports = { getStatusId, warmCache, clearCache, STATUS };
