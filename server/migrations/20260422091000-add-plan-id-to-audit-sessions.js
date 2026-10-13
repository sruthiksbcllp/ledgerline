'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('audit_sessions');
    if (!table.plan_id) {
      await queryInterface.addColumn('audit_sessions', 'plan_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'audit_plannings', key: 'id' },
        onDelete: 'SET NULL'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('audit_sessions', 'plan_id');
  }
};
