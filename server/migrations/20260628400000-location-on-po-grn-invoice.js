'use strict';
/**
 * Location arc — carry location_id forward PR -> PO -> GRN -> Invoice so procurement
 * reports can show Location wherever applicable. PR already has location_id.
 * Additive, nullable, idempotent, reversible. No backfill, no FK (house pattern).
 * Flag-free: only populated when a PR carries a location; empty otherwise.
 */
module.exports = {
  async up(q, S) {
    const po = await q.describeTable('purchaseorders');
    if (!po.location_id) await q.addColumn('purchaseorders', 'location_id', { type: S.INTEGER, allowNull: true });
    const grn = await q.describeTable('grns');
    if (!grn.location_id) await q.addColumn('grns', 'location_id', { type: S.INTEGER, allowNull: true });
    const inv = await q.describeTable('invoices');
    if (!inv.location_id) await q.addColumn('invoices', 'location_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const po = await q.describeTable('purchaseorders');
    if (po.location_id) await q.removeColumn('purchaseorders', 'location_id');
    const grn = await q.describeTable('grns');
    if (grn.location_id) await q.removeColumn('grns', 'location_id');
    const inv = await q.describeTable('invoices');
    if (inv.location_id) await q.removeColumn('invoices', 'location_id');
  }
};
