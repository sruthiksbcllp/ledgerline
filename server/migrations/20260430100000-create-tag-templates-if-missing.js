'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = await queryInterface.showAllTables().then(tables =>
      tables.includes('tagtemplates')
    );
    if (tableExists) return;
    await queryInterface.createTable('tagtemplates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      fields: { type: Sequelize.JSON, defaultValue: [] },
      layout: { type: Sequelize.JSON, defaultValue: {} },
      is_default: { type: Sequelize.BOOLEAN, defaultValue: false },
      client_id: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('tagtemplates');
  }
};
