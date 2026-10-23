'use strict';
/** CR-P07 — cost-centre sub-ledger + allocation owner (additive, reversible). */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('cost_centers');
    if (!t.sub_ledger) await q.addColumn('cost_centers', 'sub_ledger', { type: S.STRING(50), allowNull: true });
    if (!t.allocation_owner_id) await q.addColumn('cost_centers', 'allocation_owner_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const t = await q.describeTable('cost_centers');
    if (t.sub_ledger) await q.removeColumn('cost_centers', 'sub_ledger');
    if (t.allocation_owner_id) await q.removeColumn('cost_centers', 'allocation_owner_id');
  }
};
