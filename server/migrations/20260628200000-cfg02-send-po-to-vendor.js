'use strict';
/**
 * CFG-02 — Send PO to Vendor by email (additive, nullable, reversible).
 *  - purchaseorders.vendor_email_sent_at  : timestamp the PO was last emailed to the vendor
 *  - purchaseorders.vendor_email_sent_to  : the vendor address it was last sent to
 *  - po_print_config.procurement_cc_email : per-tenant fixed CC inbox for PO-to-vendor emails
 * No backfill, no FK. Flag-free: columns are nullable and only used by the new
 * "Send to Vendor" action, so behaviour is byte-identical for everyone until used.
 */
module.exports = {
  async up(q, S) {
    const po = await q.describeTable('purchaseorders');
    if (!po.vendor_email_sent_at) await q.addColumn('purchaseorders', 'vendor_email_sent_at', { type: S.DATE, allowNull: true });
    if (!po.vendor_email_sent_to) await q.addColumn('purchaseorders', 'vendor_email_sent_to', { type: S.STRING(255), allowNull: true });

    const cfg = await q.describeTable('po_print_config');
    if (!cfg.procurement_cc_email) await q.addColumn('po_print_config', 'procurement_cc_email', { type: S.STRING(255), allowNull: true });
  },
  async down(q) {
    const po = await q.describeTable('purchaseorders');
    if (po.vendor_email_sent_at) await q.removeColumn('purchaseorders', 'vendor_email_sent_at');
    if (po.vendor_email_sent_to) await q.removeColumn('purchaseorders', 'vendor_email_sent_to');

    const cfg = await q.describeTable('po_print_config');
    if (cfg.procurement_cc_email) await q.removeColumn('po_print_config', 'procurement_cc_email');
  }
};
