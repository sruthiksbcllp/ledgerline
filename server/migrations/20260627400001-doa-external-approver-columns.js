'use strict';
/**
 * DOA Phase 0 fix-up — ensure the external-approver columns exist.
 * The original DOA-0 migration added approver_name/approver_email INSIDE createTable, but
 * because createTable is guarded by "if table not exists", a DB where the tables were
 * created by the pre-amendment version never got these columns. This migration adds them
 * idempotently (describeTable guard) and makes doa_approver_groups.user_id nullable
 * (external group members have no FixTag user_id). Safe no-op where columns already exist.
 */
module.exports = {
  async up(q, S) {
    const ensure = async (table, col, def) => {
      const t = await q.describeTable(table);
      if (!t[col]) await q.addColumn(table, col, def);
    };
    await ensure('doa_slab_approvers', 'approver_name', { type: S.STRING(120), allowNull: true });
    await ensure('doa_slab_approvers', 'approver_email', { type: S.STRING(160), allowNull: true });
    await ensure('doa_approver_groups', 'approver_name', { type: S.STRING(120), allowNull: true });
    await ensure('doa_approver_groups', 'approver_email', { type: S.STRING(160), allowNull: true });
    // external group members carry no FixTag user_id -> must be nullable
    try { await q.changeColumn('doa_approver_groups', 'user_id', { type: S.INTEGER, allowNull: true }); } catch (e) { /* already nullable */ }
  },
  async down(q) {
    const drop = async (table, col) => {
      const t = await q.describeTable(table);
      if (t[col]) await q.removeColumn(table, col);
    };
    await drop('doa_slab_approvers', 'approver_name');
    await drop('doa_slab_approvers', 'approver_email');
    await drop('doa_approver_groups', 'approver_name');
    await drop('doa_approver_groups', 'approver_email');
  }
};
