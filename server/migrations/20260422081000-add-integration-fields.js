'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('integration_configs');
    if (!table.integration_name) {
      await queryInterface.addColumn('integration_configs', 'integration_name', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    if (!table.integration_type) {
      await queryInterface.addColumn('integration_configs', 'integration_type', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'ERP'
      });
    }
    if (!table.auth_type) {
      await queryInterface.addColumn('integration_configs', 'auth_type', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'API Key'
      });
    }
    if (!table.username) {
      await queryInterface.addColumn('integration_configs', 'username', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    if (!table.password) {
      await queryInterface.addColumn('integration_configs', 'password', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('integration_configs', 'integration_name');
    await queryInterface.removeColumn('integration_configs', 'integration_type');
    await queryInterface.removeColumn('integration_configs', 'auth_type');
    await queryInterface.removeColumn('integration_configs', 'username');
    await queryInterface.removeColumn('integration_configs', 'password');
  }
};
