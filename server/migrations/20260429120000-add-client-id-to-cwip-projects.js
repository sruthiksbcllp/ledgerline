'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('cwip_projects', 'client_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'id',
      comment: 'Tenant isolation — matches users.client_id'
    });
    await queryInterface.addIndex('cwip_projects', ['client_id'], {
      name: 'idx_cwip_projects_client_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('cwip_projects', 'idx_cwip_projects_client_id');
    await queryInterface.removeColumn('cwip_projects', 'client_id');
  }
};
