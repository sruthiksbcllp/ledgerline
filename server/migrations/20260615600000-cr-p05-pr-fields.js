'use strict';
/** CR-P05 — PR location + cost-centre FK (additive, reversible). */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('purchaserequisitions');
    if (!t.location_id) await q.addColumn('purchaserequisitions', 'location_id', { type: S.INTEGER, allowNull: true });
    if (!t.cost_center_id) await q.addColumn('purchaserequisitions', 'cost_center_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const t = await q.describeTable('purchaserequisitions');
    if (t.location_id) await q.removeColumn('purchaserequisitions', 'location_id');
    if (t.cost_center_id) await q.removeColumn('purchaserequisitions', 'cost_center_id');
  }
};
