'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('financialperiods', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      year: { type: Sequelize.STRING(9), allowNull: false, unique: true },
      is_closed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      closed_at: { type: Sequelize.DATE },
      reopened_at: { type: Sequelize.DATE },
      closed_by: { type: Sequelize.INTEGER },
      reopened_by: { type: Sequelize.INTEGER },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('financialperiods');
  }
};
