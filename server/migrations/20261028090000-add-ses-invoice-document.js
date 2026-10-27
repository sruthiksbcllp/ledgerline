'use strict';

/**
 * Vendor invoice captured with the service (Record service, step 5): the invoice file and date ride
 * on the SES through confirmation, review and approval, and are copied onto the invoice created
 * from it (invoices.document_url), so the same document is in front of everyone up to payment.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('service_entry_sheets');
    if (!cols.invoice_date) {
      await queryInterface.addColumn('service_entry_sheets', 'invoice_date', { type: Sequelize.DATEONLY, allowNull: true });
    }
    if (!cols.invoice_document_url) {
      await queryInterface.addColumn('service_entry_sheets', 'invoice_document_url', { type: Sequelize.STRING(500), allowNull: true });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('service_entry_sheets');
    if (cols.invoice_document_url) await queryInterface.removeColumn('service_entry_sheets', 'invoice_document_url');
    if (cols.invoice_date) await queryInterface.removeColumn('service_entry_sheets', 'invoice_date');
  }
};
