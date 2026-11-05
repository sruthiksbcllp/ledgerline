'use strict';

/**
 * Monthly purchase fund limit per company (e.g. Rs. 5,00,000 for 2026-11). A month without its own
 * row uses the latest earlier limit. Approved POs use the fund; unused balance carries forward.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (tables.includes('po_fund_limits')) return;
    await queryInterface.createTable('po_fund_limits', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      period: { type: Sequelize.STRING(7), allowNull: false }, // YYYY-MM
      limit_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      remarks: { type: Sequelize.STRING(500), allowNull: true },
      set_by: { type: Sequelize.INTEGER, allowNull: true },
      set_by_name: { type: Sequelize.STRING(150), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('po_fund_limits', ['client_id', 'period'], { unique: true, name: 'uq_po_fund_limit_period' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('po_fund_limits');
  }
};
