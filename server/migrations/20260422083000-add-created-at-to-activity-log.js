'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('activitylogs');
    if (!table.createdAt) {
      await queryInterface.addColumn('activitylogs', 'createdAt', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('activitylogs', 'createdAt');
  }
};
