'use strict';

/**
 * vendors.einvoice_applicable: the vendor must issue e-invoices (aggregate turnover above the
 * e-invoicing limit, currently Rs. 5 crore), so its bills must carry an IRN to be valid for GST credit.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('vendors');
    if (!cols.einvoice_applicable) {
      await queryInterface.addColumn('vendors', 'einvoice_applicable', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('vendors');
    if (cols.einvoice_applicable) await queryInterface.removeColumn('vendors', 'einvoice_applicable');
  }
};
