'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const masterTables = [
      'assetcategories', 'AssetSubCategories', 'departments', 
      'locations', 'properties', 'vendors', 'MaintenanceTypes', 'AssetStatuses'
    ];

    for (const table of masterTables) {
      const tableInfo = await queryInterface.describeTable(table);
      
      if (!tableInfo.code) {
        await queryInterface.addColumn(table, 'code', {
          type: Sequelize.STRING,
          allowNull: true, // Allow null initially to avoid breaking existing data
          unique: true
        });
      }
      
      if (!tableInfo.status) {
        await queryInterface.addColumn(table, 'status', {
          type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
          defaultValue: 'ACTIVE'
        });
      }
    }

    // Create AssetTypes table if not exists
    await queryInterface.createTable('assettypes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // Create Units table if not exists
    await queryInterface.createTable('units', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert logic would go here if needed
  }
};
