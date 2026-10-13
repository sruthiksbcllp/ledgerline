'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('audit_tasks');
    if (!tableDesc.client_id) {
      await queryInterface.addColumn('audit_tasks', 'client_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'clients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('audit_tasks', 'client_id');
  }
};
