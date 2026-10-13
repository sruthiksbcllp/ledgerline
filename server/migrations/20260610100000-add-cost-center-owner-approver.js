'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('cost_centers');
    if (!tableInfo.owner_id) {
      await queryInterface.addColumn('cost_centers', 'owner_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }
    if (!tableInfo.approver_id) {
      await queryInterface.addColumn('cost_centers', 'approver_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cost_centers', 'owner_id');
    await queryInterface.removeColumn('cost_centers', 'approver_id');
  }
};
