'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('audit_sessions');

    // Make plan_id nullable
    if (tableDesc.plan_id) {
      await queryInterface.changeColumn('audit_sessions', 'plan_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }

    // Make auditor_id nullable
    if (tableDesc.auditor_id) {
      await queryInterface.changeColumn('audit_sessions', 'auditor_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }

    // Make location_id nullable
    if (tableDesc.location_id) {
      await queryInterface.changeColumn('audit_sessions', 'location_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }

    // Remove audit_type column if it somehow got added
    if (tableDesc.audit_type) {
      await queryInterface.removeColumn('audit_sessions', 'audit_type');
    }

    // Remove remarks column if it somehow got added
    if (tableDesc.remarks) {
      await queryInterface.removeColumn('audit_sessions', 'remarks');
    }
  },

  async down(queryInterface, Sequelize) {
    // No-op — we don't want to restore NOT NULL constraints or orphan columns on rollback
  }
};
