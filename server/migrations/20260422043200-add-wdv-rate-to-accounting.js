'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('assetaccounting');
    if (table.wdv_rate) return; // column already exists — skip safely
    await queryInterface.addColumn('assetaccounting', 'wdv_rate', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0,
      after: 'method_of_depreciation'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('assetaccounting', 'wdv_rate');
  }
};
