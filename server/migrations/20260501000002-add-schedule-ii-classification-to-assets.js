'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('assets');
    if (!tableDesc.schedule_ii_classification) {
      await queryInterface.addColumn('assets', 'schedule_ii_classification', {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'Derived from subcategory - used in FAR export for CARO 2020 audit'
      });
    }
  },

  down: async (queryInterface) => {
    const tableDesc = await queryInterface.describeTable('assets');
    if (tableDesc.schedule_ii_classification) {
      await queryInterface.removeColumn('assets', 'schedule_ii_classification');
    }
  }
};
