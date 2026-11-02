'use strict';

/**
 * Payment advice to the vendor: after a payment, Finance reviews an email listing what was paid
 * against the invoice (amount, date, UTR, TDS and other deductions) and sends it from their own
 * mailbox. The invoice keeps when and to whom it was last sent.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const inv = await queryInterface.describeTable('invoices');
    if (!inv.payment_advice_sent_at) {
      await queryInterface.addColumn('invoices', 'payment_advice_sent_at', { type: Sequelize.DATE, allowNull: true });
    }
    if (!inv.payment_advice_sent_to) {
      await queryInterface.addColumn('invoices', 'payment_advice_sent_to', { type: Sequelize.STRING(255), allowNull: true });
    }
  },

  async down(queryInterface) {
    const inv = await queryInterface.describeTable('invoices');
    if (inv.payment_advice_sent_to) await queryInterface.removeColumn('invoices', 'payment_advice_sent_to');
    if (inv.payment_advice_sent_at) await queryInterface.removeColumn('invoices', 'payment_advice_sent_at');
  }
};
