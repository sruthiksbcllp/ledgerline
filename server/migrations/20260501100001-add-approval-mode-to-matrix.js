'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('approval_matrix');
    if (!table.mode) {
      await queryInterface.addColumn('approval_matrix', 'mode', {
        type: Sequelize.ENUM('LINE', 'COLLECTIVE'),
        allowNull: false,
        defaultValue: 'COLLECTIVE'
      });
    }
    if (!table.threshold_amount) {
      await queryInterface.addColumn('approval_matrix', 'threshold_amount', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('approval_matrix');
    if (table.threshold_amount) await queryInterface.removeColumn('approval_matrix', 'threshold_amount');
    if (table.mode) await queryInterface.removeColumn('approval_matrix', 'mode');
  }
};

