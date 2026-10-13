'use strict';
/**
 * PR free-text requestor name — clients with many non-user requestors (e.g. 1500)
 * can record the actual requestor as text without creating a FixTag account.
 * Additive, nullable, idempotent, reversible. requested_by_user_id (FK) stays for
 * requestors who ARE system users.
 */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('purchaserequisitions');
    if (!t.requestor_name) await q.addColumn('purchaserequisitions', 'requestor_name', { type: S.STRING(255), allowNull: true });
  },
  async down(q) {
    const t = await q.describeTable('purchaserequisitions');
    if (t.requestor_name) await q.removeColumn('purchaserequisitions', 'requestor_name');
  }
};
