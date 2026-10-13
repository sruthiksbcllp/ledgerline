'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const wf = await queryInterface.describeTable('approval_workflows');
    if (!wf.approval_topology) {
      await queryInterface.addColumn('approval_workflows', 'approval_topology', {
        type: Sequelize.ENUM('COLLECTIVE', 'LINE_LEVEL'),
        allowNull: false,
        defaultValue: 'COLLECTIVE'
      });
    }
    if (!wf.progression_mode) {
      await queryInterface.addColumn('approval_workflows', 'progression_mode', {
        type: Sequelize.ENUM('COLLECTIVE', 'PER_LINE'),
        allowNull: false,
        defaultValue: 'COLLECTIVE'
      });
    }

    const logs = await queryInterface.describeTable('approval_logs');
    if (!logs.line_item_id) {
      await queryInterface.addColumn('approval_logs', 'line_item_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!logs.approval_topology) {
      await queryInterface.addColumn('approval_logs', 'approval_topology', {
        type: Sequelize.ENUM('COLLECTIVE', 'LINE_LEVEL'),
        allowNull: false,
        defaultValue: 'COLLECTIVE'
      });
    }
    if (!logs.progression_mode) {
      await queryInterface.addColumn('approval_logs', 'progression_mode', {
        type: Sequelize.ENUM('COLLECTIVE', 'PER_LINE'),
        allowNull: false,
        defaultValue: 'COLLECTIVE'
      });
    }
  },

  async down(queryInterface) {
    const logs = await queryInterface.describeTable('approval_logs');
    if (logs.progression_mode) await queryInterface.removeColumn('approval_logs', 'progression_mode');
    if (logs.approval_topology) await queryInterface.removeColumn('approval_logs', 'approval_topology');
    if (logs.line_item_id) await queryInterface.removeColumn('approval_logs', 'line_item_id');

    const wf = await queryInterface.describeTable('approval_workflows');
    if (wf.progression_mode) await queryInterface.removeColumn('approval_workflows', 'progression_mode');
    if (wf.approval_topology) await queryInterface.removeColumn('approval_workflows', 'approval_topology');
  }
};
