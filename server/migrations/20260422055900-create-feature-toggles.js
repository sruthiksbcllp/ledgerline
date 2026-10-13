'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('featuretoggles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      feature_key: { type: Sequelize.STRING, unique: true, allowNull: false },
      feature_name: { type: Sequelize.STRING, allowNull: false },
      module: { type: Sequelize.STRING, allowNull: false },
      is_enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('featuretoggles');
  }
};
