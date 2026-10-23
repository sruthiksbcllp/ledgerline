'use strict';
/**
 * Quotation L1-deviation — capture WHY a quote was awarded, and a mandatory justification
 * when a non-lowest (non-L1) quote is selected. Additive, nullable, idempotent, reversible.
 */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('quotation_master');
    if (!t.deviation_reason) await q.addColumn('quotation_master', 'deviation_reason', { type: S.TEXT, allowNull: true });
    if (!t.selected_rank) await q.addColumn('quotation_master', 'selected_rank', { type: S.INTEGER, allowNull: true });
    if (!t.is_selected) await q.addColumn('quotation_master', 'is_selected', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  },
  async down(q) {
    const t = await q.describeTable('quotation_master');
    if (t.deviation_reason) await q.removeColumn('quotation_master', 'deviation_reason');
    if (t.selected_rank) await q.removeColumn('quotation_master', 'selected_rank');
    if (t.is_selected) await q.removeColumn('quotation_master', 'is_selected');
  }
};
