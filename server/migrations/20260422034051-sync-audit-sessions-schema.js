'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('audit_sessions');

    if (!table.property_id) {
      await queryInterface.addColumn('audit_sessions', 'property_id', {
        type: Sequelize.INTEGER,
        references: { model: 'properties', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.department_id) {
      await queryInterface.addColumn('audit_sessions', 'department_id', {
        type: Sequelize.INTEGER,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!table.planned_start_date) {
      await queryInterface.addColumn('audit_sessions', 'planned_start_date', {
        type: Sequelize.DATE
      });
    }

    if (!table.planned_end_date) {
      await queryInterface.addColumn('audit_sessions', 'planned_end_date', {
        type: Sequelize.DATE
      });
    }

    if (!table.actual_start_date && table.started_at) {
      await queryInterface.renameColumn('audit_sessions', 'started_at', 'actual_start_date');
    } else if (!table.actual_start_date) {
      await queryInterface.addColumn('audit_sessions', 'actual_start_date', {
        type: Sequelize.DATE
      });
    }

    if (!table.actual_end_date && table.completed_at) {
      await queryInterface.renameColumn('audit_sessions', 'completed_at', 'actual_end_date');
    } else if (!table.actual_end_date) {
      await queryInterface.addColumn('audit_sessions', 'actual_end_date', {
        type: Sequelize.DATE
      });
    }

    // Update Status ENUM if possible, or just ignore if it's too complex for now
    // Most MySQL dialects don't support easy ENUM alteration without re-creating.
  },

  async down(queryInterface, Sequelize) {
    // Standard down migration
  }
};
