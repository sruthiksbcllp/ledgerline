'use strict';

/**
 * 20260504140000-fix-invoices-and-rate-limit.js
 *
 * Fixes invoices table — original creation (20260420233359) only had basic columns.
 * Model now has many more fields required by 3-way match, GST, TDS features.
 * Missing columns cause "Unknown column" 500 on GET /api/three-way-match/invoices.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const hasColumn = async (table, column) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
      } catch (_) { return false; }
    };

    const addIfMissing = async (table, column, def) => {
      if (!(await hasColumn(table, column))) {
        await queryInterface.addColumn(table, column, def);
      }
    };

    // grn_id — needed for 3-way match include (PRIMARY FIX for 500)
    await addIfMissing('invoices', 'grn_id', { type: Sequelize.INTEGER, allowNull: true });

    // vendor_id
    await addIfMissing('invoices', 'vendor_id', { type: Sequelize.INTEGER, allowNull: true });

    // GST breakdown columns
    await addIfMissing('invoices', 'base_amount',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'gst_amount',    { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'cgst_amount',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'sgst_amount',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'igst_amount',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'tds_amount',    { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('invoices', 'tds_rate_percent', { type: Sequelize.DECIMAL(5, 2), defaultValue: 2 });
    await addIfMissing('invoices', 'tds_section_code', { type: Sequelize.STRING(20), allowNull: true });
    await addIfMissing('invoices', 'hsn_sac_code',  { type: Sequelize.STRING(20), allowNull: true });
    await addIfMissing('invoices', 'itc_eligible',  { type: Sequelize.BOOLEAN, defaultValue: true });
    await addIfMissing('invoices', 'document_url',  { type: Sequelize.STRING(500), allowNull: true });

    // 3-way match columns
    await addIfMissing('invoices', 'matching_status', {
      type: Sequelize.ENUM('PENDING', 'MATCHED', 'MISMATCHED'), defaultValue: 'PENDING'
    });
    await addIfMissing('invoices', 'matching_exception_details', { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('invoices', 'payment_blocked',      { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('invoices', 'payment_block_reason', { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('invoices', 'exception_status', {
      type: Sequelize.ENUM('NONE', 'OPEN', 'MANUAL_APPROVED', 'REJECTED'), defaultValue: 'NONE'
    });
    await addIfMissing('invoices', 'exception_resolved_by', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('invoices', 'exception_resolved_at', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('invoices', 'matching_tolerance_percent', { type: Sequelize.DECIMAL(5, 2), defaultValue: 5 });
    await addIfMissing('invoices', 'matching_details_json', { type: Sequelize.JSON, allowNull: true });

    // status ENUM — add EXCEPTION value if missing
    await queryInterface.sequelize.query(`
      ALTER TABLE invoices
      MODIFY COLUMN status ENUM('UNPAID','PARTIAL','PAID','EXCEPTION')
      NOT NULL DEFAULT 'UNPAID'
    `);
  },

  down: async () => {}
};
