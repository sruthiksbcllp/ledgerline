'use strict';
/**
 * Procurement v1.1 — Increment 1 (the client CR #2 + #5). Additive, idempotent, reversible.
 *  #2: quotation_master.status ENUM += NOT_APPROVED (losing bids become reusable, not REJECTED).
 *  #5: po_print_config.show_pr_number / show_quotation_number (per-tenant PO-print toggles, default ON).
 * Audit/print-config tables + ENUM change -> mandatory snapshot-restore dry-run before stage/prod.
 */
module.exports = {
  async up(q, S) {
    // #2 — widen quotation status ENUM (drift-safe: only widen)
    const [rows] = await q.sequelize.query("SHOW COLUMNS FROM `quotation_master` LIKE 'status'");
    const type = rows && rows[0] ? String(rows[0].Type) : '';
    if (type && !type.includes('NOT_APPROVED')) {
      await q.sequelize.query(
        "ALTER TABLE `quotation_master` MODIFY COLUMN `status` " +
        "ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED','NOT_APPROVED') NOT NULL DEFAULT 'DRAFT'"
      );
    }
    // #5 — per-tenant PO-print toggles (default true = current behaviour)
    const cols = await q.describeTable('po_print_config');
    if (!cols.show_pr_number)        await q.addColumn('po_print_config', 'show_pr_number',        { type: S.BOOLEAN, allowNull: false, defaultValue: true });
    if (!cols.show_quotation_number) await q.addColumn('po_print_config', 'show_quotation_number', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
  },
  async down(q) {
    const cols = await q.describeTable('po_print_config');
    if (cols.show_pr_number)        await q.removeColumn('po_print_config', 'show_pr_number');
    if (cols.show_quotation_number) await q.removeColumn('po_print_config', 'show_quotation_number');
    // ENUM left widened (harmless); narrowing risks data loss.
  }
};
