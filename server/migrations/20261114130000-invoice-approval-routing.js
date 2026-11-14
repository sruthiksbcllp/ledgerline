'use strict';

/**
 * Bill approval by amount and exception routing.
 *
 * invoices.submitted_by            - who submitted the bill (may not also approve it)
 * invoices.exception_type          - PRICE | QUANTITY | OTHER (from the three-way match)
 * invoices.exception_stage         - PROCUREMENT_REVIEW | RECEIPT_REVIEW | FINANCE_REVIEW: who acts next
 * invoices.exception_reason_code   - how the reviewer settled it (e.g. AMEND_PO, VENDOR_CREDIT_NOTE)
 * invoices.exception_review_note, exception_reviewed_by, exception_reviewed_at
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('invoices');
    const add = async (name, spec) => { if (!cols[name]) await queryInterface.addColumn('invoices', name, spec); };
    await add('submitted_by', { type: Sequelize.INTEGER, allowNull: true });
    await add('exception_type', { type: Sequelize.STRING(20), allowNull: true });
    await add('exception_stage', { type: Sequelize.STRING(30), allowNull: true });
    await add('exception_reason_code', { type: Sequelize.STRING(40), allowNull: true });
    await add('exception_review_note', { type: Sequelize.STRING(500), allowNull: true });
    await add('exception_reviewed_by', { type: Sequelize.INTEGER, allowNull: true });
    await add('exception_reviewed_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('invoices');
    for (const name of ['exception_reviewed_at', 'exception_reviewed_by', 'exception_review_note', 'exception_reason_code', 'exception_stage', 'exception_type', 'submitted_by']) {
      if (cols[name]) await queryInterface.removeColumn('invoices', name);
    }
  }
};
