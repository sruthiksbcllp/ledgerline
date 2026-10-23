'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('clients');
    if (!tableDesc.entity_id) {
      await queryInterface.addColumn('clients', 'entity_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        after: 'subdomain'
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('clients');
    if (tableDesc.entity_id) {
      await queryInterface.removeColumn('clients', 'entity_id');
    }
  }
};
