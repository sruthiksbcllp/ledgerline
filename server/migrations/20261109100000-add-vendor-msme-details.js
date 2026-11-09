'use strict';

/**
 * MSME details on the vendor, for the 45-day payment rule (MSMED Act s.15, Income-tax 43B(h)):
 * the Udyam category (MICRO / SMALL / MEDIUM), the Udyam registration number, and the payment
 * days agreed in writing (capped at 45; 15 days apply when nothing was agreed).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('vendors');
    if (!cols.msme_category) {
      await queryInterface.addColumn('vendors', 'msme_category', { type: Sequelize.STRING(10), allowNull: true });
    }
    if (!cols.udyam_number) {
      await queryInterface.addColumn('vendors', 'udyam_number', { type: Sequelize.STRING(30), allowNull: true });
    }
    if (!cols.msme_agreed_days) {
      await queryInterface.addColumn('vendors', 'msme_agreed_days', { type: Sequelize.INTEGER, allowNull: true });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('vendors');
    if (cols.msme_agreed_days) await queryInterface.removeColumn('vendors', 'msme_agreed_days');
    if (cols.udyam_number) await queryInterface.removeColumn('vendors', 'udyam_number');
    if (cols.msme_category) await queryInterface.removeColumn('vendors', 'msme_category');
  }
};
