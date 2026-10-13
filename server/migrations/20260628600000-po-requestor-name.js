'use strict';
/**
 * Requestor arc — carry the free-text requestor_name PR -> PO so the PO print
 * "Requested by" line shows the actual (non-user) requestor. Additive, nullable,
 * idempotent, reversible. Populated from PR (or the Issue-PO form for DIRECT).
 */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('purchaseorders');
    if (!t.requestor_name) await q.addColumn('purchaseorders', 'requestor_name', { type: S.STRING(255), allowNull: true });
  },
  async down(q) {
    const t = await q.describeTable('purchaseorders');
    if (t.requestor_name) await q.removeColumn('purchaseorders', 'requestor_name');
  }
};
