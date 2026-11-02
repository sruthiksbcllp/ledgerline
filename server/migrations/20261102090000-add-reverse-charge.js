'use strict';

/**
 * Reverse charge (RCM, AP JE reference 3.1): for some purchases (unregistered vendors, legal
 * services, GTA freight and others) the buyer pays the GST to the government instead of the vendor.
 * vendors.rcm_applicable pre-fills it on the vendor's invoices; invoices.reverse_charge marks the
 * invoice and invoices.rcm_gst_amount holds the GST the company pays itself. The vendor is owed the
 * invoice value only, so gst_amount stays 0 on these invoices.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const vendors = await queryInterface.describeTable('vendors');
    if (!vendors.rcm_applicable) {
      await queryInterface.addColumn('vendors', 'rcm_applicable', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    const inv = await queryInterface.describeTable('invoices');
    if (!inv.reverse_charge) {
      await queryInterface.addColumn('invoices', 'reverse_charge', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    if (!inv.rcm_gst_amount) {
      await queryInterface.addColumn('invoices', 'rcm_gst_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    }
  },

  async down(queryInterface) {
    const inv = await queryInterface.describeTable('invoices');
    if (inv.rcm_gst_amount) await queryInterface.removeColumn('invoices', 'rcm_gst_amount');
    if (inv.reverse_charge) await queryInterface.removeColumn('invoices', 'reverse_charge');
    const vendors = await queryInterface.describeTable('vendors');
    if (vendors.rcm_applicable) await queryInterface.removeColumn('vendors', 'rcm_applicable');
  }
};
