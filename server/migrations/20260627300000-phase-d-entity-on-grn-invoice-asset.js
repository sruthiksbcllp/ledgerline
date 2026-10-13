'use strict';
/**
 * Phase D — carry the buying entity onto GRN, Invoice and Asset (booking per invoice).
 * Additive, nullable, idempotent, reversible. No DB-level FK (house pattern).
 *  - grns.entity_id        : inherited from the PO at GRN creation
 *  - invoices.entity_id    : inherited from the PO at invoice creation
 *  - invoices.buyer_gstin  : the buyer's place-of-supply GSTIN snapshotted at booking
 *                            (resolved REGULAR+ACTIVE for the supply state; flag-gated)
 *  - assets.entity_id      : the buying entity that owns the asset
 * No backfill — existing rows stay NULL (today's behaviour).
 */
module.exports = {
  async up(q, S) {
    const grns = await q.describeTable('grns');
    if (!grns.entity_id) await q.addColumn('grns', 'entity_id', { type: S.INTEGER, allowNull: true });

    const inv = await q.describeTable('invoices');
    if (!inv.entity_id) await q.addColumn('invoices', 'entity_id', { type: S.INTEGER, allowNull: true });
    if (!inv.buyer_gstin) await q.addColumn('invoices', 'buyer_gstin', { type: S.STRING(15), allowNull: true });

    const assets = await q.describeTable('assets');
    if (!assets.entity_id) await q.addColumn('assets', 'entity_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const grns = await q.describeTable('grns');
    if (grns.entity_id) await q.removeColumn('grns', 'entity_id');

    const inv = await q.describeTable('invoices');
    if (inv.entity_id) await q.removeColumn('invoices', 'entity_id');
    if (inv.buyer_gstin) await q.removeColumn('invoices', 'buyer_gstin');

    const assets = await q.describeTable('assets');
    if (assets.entity_id) await q.removeColumn('assets', 'entity_id');
  }
};
