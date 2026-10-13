'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('assets');
    if (!table.is_under_amc) {
      await queryInterface.addColumn('assets', 'is_under_amc', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        after: 'asset_type'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('assets', 'is_under_amc');
  }
};
