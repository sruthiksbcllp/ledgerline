'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('location_extensions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      location_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false,
        references: { model: 'locations', key: 'id' },
        onDelete: 'CASCADE'
      },
      building: { type: Sequelize.STRING },
      floor: { type: Sequelize.STRING },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('location_extensions');
  }
};
