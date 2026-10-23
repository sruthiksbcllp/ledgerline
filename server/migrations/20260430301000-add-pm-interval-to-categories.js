'use strict';

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable('asset_categories');
    if (!table.pm_interval_days) {
      await queryInterface.sequelize.query('ALTER TABLE asset_categories ADD COLUMN pm_interval_days INT DEFAULT 365');
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('asset_categories');
    if (table.pm_interval_days) {
      await queryInterface.sequelize.query('ALTER TABLE asset_categories DROP COLUMN pm_interval_days');
    }
  }
};
