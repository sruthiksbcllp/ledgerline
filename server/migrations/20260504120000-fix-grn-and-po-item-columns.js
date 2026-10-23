'use strict';

/**
 * 20260504120000-fix-grn-and-po-item-columns.js
 *
 * Tables were created with abbreviated column names but models use full names:
 *
 * grn_items:
 *   ordered_qty       -> ordered_quantity
 *   received_qty      -> received_quantity  (causes current 500)
 *   accepted_qty      -> accepted_quantity
 *   rejected_qty      -> rejected_quantity
 *   condition_on_receipt -> condition  (ENUM mismatch too)
 *   missing: client_id, damaged_quantity, quality_bucket, qc_status, qc_remarks
 *
 * purchase_order_items:
 *   qty               -> quantity
 *   missing: client_id, received_quantity, total_price (or uses total_price already)
 *
 * grn_item_serials:
 *   missing: status column
 *
 * Strategy: ADD the correctly-named columns (copying data from old columns),
 * then drop the old short-named columns. Safe to re-run.
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

    // ── grn_items ────────────────────────────────────────────────────────────
    if (await tableExists('grn_items')) {

      // client_id
      if (!(await hasColumn('grn_items', 'client_id'))) {
        await queryInterface.addColumn('grn_items', 'client_id', { type: Sequelize.INTEGER, allowNull: true });
      }

      // ordered_quantity (from ordered_qty)
      if (!(await hasColumn('grn_items', 'ordered_quantity'))) {
        await queryInterface.addColumn('grn_items', 'ordered_quantity', { type: Sequelize.DECIMAL(10, 2), allowNull: true });
        if (await hasColumn('grn_items', 'ordered_qty')) {
          await queryInterface.sequelize.query('UPDATE grn_items SET ordered_quantity = ordered_qty');
        }
      }

      // received_quantity (from received_qty) — PRIMARY FIX
      if (!(await hasColumn('grn_items', 'received_quantity'))) {
        await queryInterface.addColumn('grn_items', 'received_quantity', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
        if (await hasColumn('grn_items', 'received_qty')) {
          await queryInterface.sequelize.query('UPDATE grn_items SET received_quantity = received_qty');
        }
      }

      // accepted_quantity (from accepted_qty)
      if (!(await hasColumn('grn_items', 'accepted_quantity'))) {
        await queryInterface.addColumn('grn_items', 'accepted_quantity', { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 });
        if (await hasColumn('grn_items', 'accepted_qty')) {
          await queryInterface.sequelize.query('UPDATE grn_items SET accepted_quantity = accepted_qty');
        }
      }

      // rejected_quantity (from rejected_qty)
      if (!(await hasColumn('grn_items', 'rejected_quantity'))) {
        await queryInterface.addColumn('grn_items', 'rejected_quantity', { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 });
        if (await hasColumn('grn_items', 'rejected_qty')) {
          await queryInterface.sequelize.query('UPDATE grn_items SET rejected_quantity = rejected_qty');
        }
      }

      // damaged_quantity
      if (!(await hasColumn('grn_items', 'damaged_quantity'))) {
        await queryInterface.addColumn('grn_items', 'damaged_quantity', { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 });
      }

      // quality_bucket
      if (!(await hasColumn('grn_items', 'quality_bucket'))) {
        await queryInterface.addColumn('grn_items', 'quality_bucket', {
          type: Sequelize.ENUM('ACCEPTED', 'REJECTED', 'DAMAGED', 'MIXED'), defaultValue: 'ACCEPTED'
        });
      }

      // qc_status
      if (!(await hasColumn('grn_items', 'qc_status'))) {
        await queryInterface.addColumn('grn_items', 'qc_status', {
          type: Sequelize.ENUM('PENDING', 'PASS', 'FAIL'), defaultValue: 'PENDING'
        });
      }

      // condition (from condition_on_receipt)
      if (!(await hasColumn('grn_items', 'condition'))) {
        await queryInterface.addColumn('grn_items', 'condition', {
          type: Sequelize.ENUM('GOOD', 'DAMAGED', 'WRONG_ITEM'), defaultValue: 'GOOD'
        });
        if (await hasColumn('grn_items', 'condition_on_receipt')) {
          await queryInterface.sequelize.query(
            `UPDATE grn_items SET \`condition\` = CASE
              WHEN condition_on_receipt = 'GOOD' THEN 'GOOD'
              WHEN condition_on_receipt = 'DAMAGED' THEN 'DAMAGED'
              ELSE 'GOOD'
            END`
          );
        }
      }

      // qc_remarks
      if (!(await hasColumn('grn_items', 'qc_remarks'))) {
        await queryInterface.addColumn('grn_items', 'qc_remarks', { type: Sequelize.TEXT, allowNull: true });
      }
    }

    // ── purchase_order_items ──────────────────────────────────────────────────
    if (await tableExists('purchase_order_items')) {

      // client_id
      if (!(await hasColumn('purchase_order_items', 'client_id'))) {
        await queryInterface.addColumn('purchase_order_items', 'client_id', { type: Sequelize.INTEGER, allowNull: true });
      }

      // quantity (from qty)
      if (!(await hasColumn('purchase_order_items', 'quantity'))) {
        await queryInterface.addColumn('purchase_order_items', 'quantity', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
        if (await hasColumn('purchase_order_items', 'qty')) {
          await queryInterface.sequelize.query('UPDATE purchase_order_items SET quantity = qty');
        }
      }

      // received_quantity
      if (!(await hasColumn('purchase_order_items', 'received_quantity'))) {
        await queryInterface.addColumn('purchase_order_items', 'received_quantity', { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 });
      }

      // total_price (may already exist as total_price)
      if (!(await hasColumn('purchase_order_items', 'total_price'))) {
        await queryInterface.addColumn('purchase_order_items', 'total_price', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
        if (await hasColumn('purchase_order_items', 'total_amount')) {
          await queryInterface.sequelize.query('UPDATE purchase_order_items SET total_price = total_amount');
        }
      }
    }

    // ── grn_item_serials ──────────────────────────────────────────────────────
    if (await tableExists('grn_item_serials')) {
      if (!(await hasColumn('grn_item_serials', 'status'))) {
        await queryInterface.addColumn('grn_item_serials', 'status', {
          type: Sequelize.ENUM('AVAILABLE', 'ASSIGNED', 'REJECTED'), defaultValue: 'AVAILABLE'
        });
      }
    }
  },

  down: async () => {
    // Non-destructive — columns left in place on rollback
  }
};
