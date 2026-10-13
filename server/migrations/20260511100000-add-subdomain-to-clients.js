'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('clients');
    if (!tableDesc.subdomain) {
      await queryInterface.addColumn('clients', 'subdomain', {
        type: Sequelize.STRING(63),
        allowNull: true,
        unique: true,
        after: 'company_type'
      });
    }
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('clients', 'subdomain');
  }
};
