'use strict';

/**
 * Part of the PO advance adjusted against each invoice (invoices.advance_adjusted). The vendor is
 * owed the invoice total less TDS less this amount; the invoice journal credits Advances to vendors.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('invoices');
    if (!cols.advance_adjusted) {
      await queryInterface.addColumn('invoices', 'advance_adjusted', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('invoices');
    if (cols.advance_adjusted) await queryInterface.removeColumn('invoices', 'advance_adjusted');
  }
};
