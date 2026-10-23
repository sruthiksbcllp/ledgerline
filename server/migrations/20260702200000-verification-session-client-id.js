'use strict';
/**
 * Tenant-isolation Batch B1: verificationsessions has NO client_id column, so the Stock
 * Verification report returned EVERY tenant's sessions (cross-tenant leak). Add a nullable
 * client_id and backfill it from the session's Location (locations.client_id). Additive +
 * reversible + idempotent. New sessions stamp client_id on create; reads filter by it.
 * Column left NULLABLE (no NOT NULL) so no insert path can fail. FINANCIAL/OPERATIONAL data
 * + backfill -> mandatory snapshot-restore dry-run before stage/prod.
 */
module.exports = {
  async up(q, S) {
    const desc = await q.describeTable('verificationsessions').catch(() => ({}));
    if (!desc.client_id) {
      await q.addColumn('verificationsessions', 'client_id', { type: S.INTEGER, allowNull: true });
    }
    // Backfill from the session's location tenant.
    await q.sequelize.query(
      'UPDATE verificationsessions vs ' +
      'INNER JOIN locations l ON vs.location_id = l.id ' +
      'SET vs.client_id = l.client_id ' +
      'WHERE vs.client_id IS NULL AND l.client_id IS NOT NULL;'
    );
  },
  async down(q) {
    const desc = await q.describeTable('verificationsessions').catch(() => ({}));
    if (desc.client_id) await q.removeColumn('verificationsessions', 'client_id');
  }
};
