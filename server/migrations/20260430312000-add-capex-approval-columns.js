'use strict';

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable('capexrequests');
    if (!table.approval_stage) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests ADD COLUMN approval_stage INT DEFAULT 0');
    }
    if (!table.required_approvals) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests ADD COLUMN required_approvals INT DEFAULT 1');
    }
    if (!table.review_notes) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests ADD COLUMN review_notes TEXT NULL');
    }
    if (!table.last_action_by) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests ADD COLUMN last_action_by INT NULL');
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('capexrequests');
    if (table.last_action_by) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests DROP COLUMN last_action_by');
    }
    if (table.review_notes) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests DROP COLUMN review_notes');
    }
    if (table.required_approvals) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests DROP COLUMN required_approvals');
    }
    if (table.approval_stage) {
      await queryInterface.sequelize.query('ALTER TABLE capexrequests DROP COLUMN approval_stage');
    }
  }
};
