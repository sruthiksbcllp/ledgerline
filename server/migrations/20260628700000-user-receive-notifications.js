'use strict';
/**
 * Per-tenant notification recipients — flag which users receive the daily digest/alerts.
 * Additive, default false, idempotent, reversible. Backward compatible: the scheduler
 * sends to flagged users if any exist for a tenant, else falls back to all ACTIVE users.
 */
module.exports = {
  async up(q, S) {
    const t = await q.describeTable('users');
    if (!t.receive_notifications) await q.addColumn('users', 'receive_notifications', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  },
  async down(q) {
    const t = await q.describeTable('users');
    if (t.receive_notifications) await q.removeColumn('users', 'receive_notifications');
  }
};
