'use strict';
/**
 * CFG-02b — optional free-text comment on the PO, surfaced in the approval email.
 * Additive, nullable, idempotent, reversible. Flag-free (only populated when the
 * initiator types a note on the Issue PO form; empty for everyone else).
 */
module.exports = {
  async up(q, S) {
    const po = await q.describeTable('purchaseorders');
    if (!po.approval_comment) await q.addColumn('purchaseorders', 'approval_comment', { type: S.TEXT, allowNull: true });
  },
  async down(q) {
    const po = await q.describeTable('purchaseorders');
    if (po.approval_comment) await q.removeColumn('purchaseorders', 'approval_comment');
  }
};
