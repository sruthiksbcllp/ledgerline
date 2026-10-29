'use strict';

/**
 * Advance to the vendor recorded on the PO at issue: whether one is given and how much
 * (purchaseorders.advance_given, advance_amount). The amount cannot exceed the PO total.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('purchaseorders');
    if (!cols.advance_given) {
      await queryInterface.addColumn('purchaseorders', 'advance_given', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    if (!cols.advance_amount) {
      await queryInterface.addColumn('purchaseorders', 'advance_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: true });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('purchaseorders');
    if (cols.advance_amount) await queryInterface.removeColumn('purchaseorders', 'advance_amount');
    if (cols.advance_given) await queryInterface.removeColumn('purchaseorders', 'advance_given');
  }
};
