'use strict';
/**
 * Phase A — Entity-on-PO (additive, nullable, reversible).
 *  - purchaseorders.entity_id      : carry the buying entity from PR -> PO
 *  - purchaseorders.cost_center_id : parity with PR (CR-P05)
 *  - entities.client_id            : make entities tenant-ownable (NULL = global/shared,
 *                                    preserving today's behaviour for existing rows)
 * No backfill. No DB-level FK (matches how purchaserequisitions.entity_id was added).
 * Flag-free: columns are nullable and only populated when a PR carries an entity, so
 * behaviour is byte-identical for tenants that don't use entities.
 */
module.exports = {
  async up(q, S) {
    const po = await q.describeTable('purchaseorders');
    if (!po.entity_id) await q.addColumn('purchaseorders', 'entity_id', { type: S.INTEGER, allowNull: true });
    if (!po.cost_center_id) await q.addColumn('purchaseorders', 'cost_center_id', { type: S.INTEGER, allowNull: true });

    const ent = await q.describeTable('entities');
    if (!ent.client_id) await q.addColumn('entities', 'client_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const po = await q.describeTable('purchaseorders');
    if (po.entity_id) await q.removeColumn('purchaseorders', 'entity_id');
    if (po.cost_center_id) await q.removeColumn('purchaseorders', 'cost_center_id');

    const ent = await q.describeTable('entities');
    if (ent.client_id) await q.removeColumn('entities', 'client_id');
  }
};
