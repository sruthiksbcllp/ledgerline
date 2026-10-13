'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('alerts').catch(() => null);
    if (!tableDesc) return; // table doesn't exist yet — skip
    if (!tableDesc.client_id) {
      await queryInterface.addColumn('alerts', 'client_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'id'
      });
    }
  },
  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('alerts').catch(() => null);
    if (tableDesc && tableDesc.client_id) {
      await queryInterface.removeColumn('alerts', 'client_id');
    }
  }
};
