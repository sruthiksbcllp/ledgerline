'use strict';

/**
 * Line-level three-way match (P2P spec step 7: price within 1% or a fixed amount, whichever is
 * lower; quantity exact).
 *
 * ap_invoice_lines.po_item_id      - the PO line each bill line is for
 * three_way_matches.details        - per-line results and the received / billed figures
 * ap_tolerance_rules.price_tolerance_pct / price_tolerance_amount / qty_tolerance_pct
 *                                  - line tolerances (defaults 1%, Rs. 100, 0% = exact); the
 *                                    existing tolerance_pct / tolerance_amount stay as the check
 *                                    on the bill total
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const lines = await queryInterface.describeTable('ap_invoice_lines');
    if (!lines.po_item_id) await queryInterface.addColumn('ap_invoice_lines', 'po_item_id', { type: Sequelize.INTEGER, allowNull: true });

    const matches = await queryInterface.describeTable('three_way_matches');
    if (!matches.details) await queryInterface.addColumn('three_way_matches', 'details', { type: Sequelize.JSON, allowNull: true });

    const rules = await queryInterface.describeTable('ap_tolerance_rules');
    if (!rules.price_tolerance_pct) await queryInterface.addColumn('ap_tolerance_rules', 'price_tolerance_pct', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 1 });
    if (!rules.price_tolerance_amount) await queryInterface.addColumn('ap_tolerance_rules', 'price_tolerance_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 100 });
    if (!rules.qty_tolerance_pct) await queryInterface.addColumn('ap_tolerance_rules', 'qty_tolerance_pct', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
  },

  async down(queryInterface) {
    const rules = await queryInterface.describeTable('ap_tolerance_rules');
    if (rules.qty_tolerance_pct) await queryInterface.removeColumn('ap_tolerance_rules', 'qty_tolerance_pct');
    if (rules.price_tolerance_amount) await queryInterface.removeColumn('ap_tolerance_rules', 'price_tolerance_amount');
    if (rules.price_tolerance_pct) await queryInterface.removeColumn('ap_tolerance_rules', 'price_tolerance_pct');
    const matches = await queryInterface.describeTable('three_way_matches');
    if (matches.details) await queryInterface.removeColumn('three_way_matches', 'details');
    const lines = await queryInterface.describeTable('ap_invoice_lines');
    if (lines.po_item_id) await queryInterface.removeColumn('ap_invoice_lines', 'po_item_id');
  }
};
