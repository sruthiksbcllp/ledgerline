'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('assets');

    if (!tableInfo.request_id) {
      await queryInterface.addColumn('assets', 'request_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!tableInfo.source_type) {
      await queryInterface.addColumn('assets', 'source_type', {
        type: Sequelize.ENUM('MANUAL', 'REQUEST', 'GRN'),
        defaultValue: 'MANUAL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert changes down is not implemented for safety.
  }
};
