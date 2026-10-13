'use strict';

/**
 * 20260504130000-fix-procurement-table-columns.js
 *
 * Comprehensive fix for all procurement table column mismatches between
 * the original migrations (short/wrong names) and what the Sequelize models expect.
 *
 * Tables fixed:
 *   quotation_master   — missing: quotation_number, valid_until, currency, tax_amount,
 *                        discount_amount, shipping_charges, net_amount, attachments;
 *                        status ENUM missing PO_CREATED value
 *   quotation_items    — missing: client_id, quantity (from qty), description,
 *                        tax_percent, tax_amount, discount_percent, uom
 *   purchase_requisition_items — missing: client_id, quantity (from qty), unit_price,
 *                        total_price, description, uom
 *   purchaseorders     — missing: source_type, notes, approved_by, approved_at,
 *                        delivery_date, payment_terms
 *   invoices           — missing: client_id, match_status, exception_reason,
 *                        payment_date, approved_by
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {

    const hasColumn = async (table, column) => {
      try {
        const desc = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(desc, column);
      } catch (_) { return false; }
    };

    const tableExists = async (table) => {
      try { await queryInterface.describeTable(table); return true; }
      catch (_) { return false; }
    };

    const addIfMissing = async (table, column, def) => {
      if (await tableExists(table) && !(await hasColumn(table, column))) {
        await queryInterface.addColumn(table, column, def);
      }
    };

    // ── quotation_master ──────────────────────────────────────────────────
    // quotation_number (model field) vs quotation_no (table field)
    await addIfMissing('quotation_master', 'quotation_number', {
      type: Sequelize.STRING(50), allowNull: true
    });
    // copy quotation_no -> quotation_number
    if (await tableExists('quotation_master') && await hasColumn('quotation_master', 'quotation_no')) {
      await queryInterface.sequelize.query(
        'UPDATE quotation_master SET quotation_number = quotation_no WHERE quotation_number IS NULL'
      );
    }

    await addIfMissing('quotation_master', 'valid_until', { type: Sequelize.DATE, allowNull: true });
    // copy validity_date -> valid_until
    if (await tableExists('quotation_master') && await hasColumn('quotation_master', 'validity_date')) {
      await queryInterface.sequelize.query(
        'UPDATE quotation_master SET valid_until = validity_date WHERE valid_until IS NULL'
      );
    }

    await addIfMissing('quotation_master', 'currency',          { type: Sequelize.STRING(10), defaultValue: 'INR' });
    await addIfMissing('quotation_master', 'tax_amount',        { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('quotation_master', 'discount_amount',   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('quotation_master', 'shipping_charges',  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('quotation_master', 'net_amount',        { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('quotation_master', 'attachments',       { type: Sequelize.JSON, allowNull: true });

    // status ENUM — add PO_CREATED value
    if (await tableExists('quotation_master')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE quotation_master
        MODIFY COLUMN status ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED')
        NOT NULL DEFAULT 'DRAFT'
      `);
    }

    // ── quotation_items ───────────────────────────────────────────────────
    await addIfMissing('quotation_items', 'client_id',        { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('quotation_items', 'description',      { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('quotation_items', 'tax_percent',      { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await addIfMissing('quotation_items', 'tax_amount',       { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
    await addIfMissing('quotation_items', 'discount_percent', { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await addIfMissing('quotation_items', 'uom',              { type: Sequelize.STRING(50), allowNull: true });
    await addIfMissing('quotation_items', 'total_amount',     { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });

    // quantity (from qty)
    await addIfMissing('quotation_items', 'quantity', { type: Sequelize.DECIMAL(15, 2), defaultValue: 1 });
    if (await tableExists('quotation_items') && await hasColumn('quotation_items', 'qty')) {
      await queryInterface.sequelize.query(
        'UPDATE quotation_items SET quantity = qty WHERE quantity = 1 OR quantity IS NULL'
      );
    }

    // ── purchase_requisition_items ────────────────────────────────────────
    if (await tableExists('purchase_requisition_items')) {
      await addIfMissing('purchase_requisition_items', 'client_id',   { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('purchase_requisition_items', 'description', { type: Sequelize.TEXT, allowNull: true });
      await addIfMissing('purchase_requisition_items', 'uom',         { type: Sequelize.STRING(50), allowNull: true });
      await addIfMissing('purchase_requisition_items', 'unit_price',  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });
      await addIfMissing('purchase_requisition_items', 'total_price', { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 });

      // quantity from qty
      await addIfMissing('purchase_requisition_items', 'quantity', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
      if (await hasColumn('purchase_requisition_items', 'qty')) {
        await queryInterface.sequelize.query(
          'UPDATE purchase_requisition_items SET quantity = qty WHERE quantity = 0 OR quantity IS NULL'
        );
      }
    }

    // ── purchaseorders ────────────────────────────────────────────────────
    if (await tableExists('purchaseorders')) {
      await addIfMissing('purchaseorders', 'source_type',    { type: Sequelize.STRING(50), defaultValue: 'QUOTATION' });
      await addIfMissing('purchaseorders', 'notes',          { type: Sequelize.TEXT, allowNull: true });
      await addIfMissing('purchaseorders', 'approved_by',    { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('purchaseorders', 'approved_at',    { type: Sequelize.DATE, allowNull: true });
      await addIfMissing('purchaseorders', 'delivery_date',  { type: Sequelize.DATE, allowNull: true });
      await addIfMissing('purchaseorders', 'payment_terms',  { type: Sequelize.STRING(200), allowNull: true });
    }

    // ── invoices ──────────────────────────────────────────────────────────
    if (await tableExists('invoices')) {
      await addIfMissing('invoices', 'client_id',        { type: Sequelize.INTEGER, allowNull: true });
      await addIfMissing('invoices', 'match_status',     {
        type: Sequelize.ENUM('PENDING','MATCHED','PARTIAL_MATCH','EXCEPTION'),
        defaultValue: 'PENDING'
      });
      await addIfMissing('invoices', 'exception_reason', { type: Sequelize.TEXT, allowNull: true });
      await addIfMissing('invoices', 'payment_date',     { type: Sequelize.DATE, allowNull: true });
      await addIfMissing('invoices', 'approved_by',      { type: Sequelize.INTEGER, allowNull: true });
    }
  },

  down: async () => {
    // Non-destructive — columns left in place on rollback
  }
};
