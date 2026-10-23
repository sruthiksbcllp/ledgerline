'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vendor_compliance_snapshots', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      fy: { type: Sequelize.STRING(20), allowNull: false },
      snapshot_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      generated_by: Sequelize.INTEGER,
      total_vendors: { type: Sequelize.INTEGER, defaultValue: 0 },
      red_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      orange_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      gold_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      blue_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      total_spend: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
      snapshot_json: Sequelize.JSON,
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendor_compliance_snapshots').catch(() => {});
  }
};
