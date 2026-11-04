'use strict';

/**
 * In-house stock issues: when an item a requester needs is already in the store, it is issued from
 * stock instead of raising a purchase requisition. The issue keeps who received it, their
 * department and, when it replaces a PR, which PR.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('stocktransactions');
    if (!cols.issued_to) {
      await queryInterface.addColumn('stocktransactions', 'issued_to', { type: Sequelize.STRING(255), allowNull: true });
    }
    if (!cols.issued_department) {
      await queryInterface.addColumn('stocktransactions', 'issued_department', { type: Sequelize.STRING(255), allowNull: true });
    }
    if (!cols.pr_id) {
      await queryInterface.addColumn('stocktransactions', 'pr_id', { type: Sequelize.INTEGER, allowNull: true });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('stocktransactions');
    if (cols.pr_id) await queryInterface.removeColumn('stocktransactions', 'pr_id');
    if (cols.issued_department) await queryInterface.removeColumn('stocktransactions', 'issued_department');
    if (cols.issued_to) await queryInterface.removeColumn('stocktransactions', 'issued_to');
  }
};
