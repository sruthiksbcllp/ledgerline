'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add extra tracking columns if they don't exist
    const tableInfo = await queryInterface.describeTable('asset_import_items');

    // Add raw_data to store the entire Excel row for flexible processing
    if (!tableInfo.raw_data) {
      await queryInterface.addColumn('asset_import_items', 'raw_data', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    
    if (!tableInfo.property_id) {
      await queryInterface.addColumn('asset_import_items', 'property_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!tableInfo.department_id) {
      await queryInterface.addColumn('asset_import_items', 'department_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('asset_import_items', 'raw_data');
  }
};
