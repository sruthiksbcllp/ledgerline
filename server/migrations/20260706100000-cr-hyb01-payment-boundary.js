'use strict';
/**
 * CR-HYB-01 — Invoice payment boundary. Additive, idempotent, reversible.
 *  - extend invoices.status ENUM (+APPROVED_FOR_PAYMENT, +WAITING_FOR_PAYMENT)
 *  - add nullable payment_source / external_payment_ref / payment_date / payment_synced_at
 *  - seed PAYMENT_EXTERNAL feature toggle (global, disabled)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) extend the status ENUM (drift-safe: only widen)
    const [rows] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `invoices` LIKE 'status'"
    );
    const type = rows && rows[0] ? String(rows[0].Type) : '';
    if (!type.includes('APPROVED_FOR_PAYMENT')) {
      await queryInterface.sequelize.query(
        "ALTER TABLE `invoices` MODIFY COLUMN `status` " +
        "ENUM('UNPAID','PARTIAL','PAID','EXCEPTION','APPROVED_FOR_PAYMENT','WAITING_FOR_PAYMENT') " +
        "NOT NULL DEFAULT 'UNPAID'"
      );
    }
    // 2) additive nullable columns
    const cols = await queryInterface.describeTable('invoices');
    if (!cols.payment_source) await queryInterface.addColumn('invoices', 'payment_source', { type: Sequelize.STRING(40), allowNull: true });
    if (!cols.external_payment_ref) await queryInterface.addColumn('invoices', 'external_payment_ref', { type: Sequelize.STRING(100), allowNull: true });
    if (!cols.payment_date) await queryInterface.addColumn('invoices', 'payment_date', { type: Sequelize.DATE, allowNull: true });
    if (!cols.payment_synced_at) await queryInterface.addColumn('invoices', 'payment_synced_at', { type: Sequelize.DATE, allowNull: true });
    // 3) seed the PAYMENT_EXTERNAL toggle (global, OFF)
    await queryInterface.sequelize.query(
      "INSERT IGNORE INTO `featuretoggles` (feature_key, feature_name, module, is_enabled, client_id, createdAt, updatedAt) " +
      "VALUES ('PAYMENT_EXTERNAL','Payment owned by external ERP','FINANCE',0,NULL,NOW(),NOW())"
    ).catch(() => {});
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('invoices');
    if (cols.payment_source) await queryInterface.removeColumn('invoices', 'payment_source');
    if (cols.external_payment_ref) await queryInterface.removeColumn('invoices', 'external_payment_ref');
    if (cols.payment_date) await queryInterface.removeColumn('invoices', 'payment_date');
    if (cols.payment_synced_at) await queryInterface.removeColumn('invoices', 'payment_synced_at');
    await queryInterface.sequelize.query("DELETE FROM `featuretoggles` WHERE feature_key='PAYMENT_EXTERNAL' AND client_id IS NULL").catch(() => {});
    // ENUM left widened (harmless); narrowing risks data loss.
  },
};
