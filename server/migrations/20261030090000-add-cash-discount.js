'use strict';

/**
 * Cash discount taken when paying a vendor (AP JE reference 5.3): the vendor accepts less than the
 * balance as settlement in full. ap_payments.discount_amount is the discount on each recorded
 * payment; invoices.discount_received is the total on the invoice (including any taken when it was
 * marked paid). The payment journal credits 4100 Discount received for it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const pay = await queryInterface.describeTable('ap_payments');
    if (!pay.discount_amount) {
      await queryInterface.addColumn('ap_payments', 'discount_amount', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    }
    const inv = await queryInterface.describeTable('invoices');
    if (!inv.discount_received) {
      await queryInterface.addColumn('invoices', 'discount_received', { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    }
  },

  async down(queryInterface) {
    const inv = await queryInterface.describeTable('invoices');
    if (inv.discount_received) await queryInterface.removeColumn('invoices', 'discount_received');
    const pay = await queryInterface.describeTable('ap_payments');
    if (pay.discount_amount) await queryInterface.removeColumn('ap_payments', 'discount_amount');
  }
};
