'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('audit_sessions');

    // Make plan_id nullable
    await queryInterface.changeColumn('audit_sessions', 'plan_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'audit_plannings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Make auditor_id nullable
    await queryInterface.changeColumn('audit_sessions', 'auditor_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // Make location_id nullable (full-audit scope has no specific location)
    await queryInterface.changeColumn('audit_sessions', 'location_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // Add audit_type if missing
    if (!desc.audit_type) {
      await queryInterface.addColumn('audit_sessions', 'audit_type', {
        type: Sequelize.STRING(50),
        defaultValue: 'LOCATION',
        allowNull: true
      });
    }

    // Add remarks if missing
    if (!desc.remarks) {
      await queryInterface.addColumn('audit_sessions', 'remarks', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('audit_sessions', 'plan_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.changeColumn('audit_sessions', 'auditor_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.changeColumn('audit_sessions', 'location_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
  }
};
