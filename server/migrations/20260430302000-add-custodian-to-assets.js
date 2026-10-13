'use strict';

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable('assets');
    if (!table.custodian_id) {
      await queryInterface.sequelize.query('ALTER TABLE assets ADD COLUMN custodian_id INT NULL');
    }
    if (!table.custodian_name) {
      await queryInterface.sequelize.query('ALTER TABLE assets ADD COLUMN custodian_name VARCHAR(200) NULL');
    }
    if (!table.custodian_assigned_date) {
      await queryInterface.sequelize.query('ALTER TABLE assets ADD COLUMN custodian_assigned_date DATE NULL');
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('assets');
    if (table.custodian_assigned_date) {
      await queryInterface.sequelize.query('ALTER TABLE assets DROP COLUMN custodian_assigned_date');
    }
    if (table.custodian_name) {
      await queryInterface.sequelize.query('ALTER TABLE assets DROP COLUMN custodian_name');
    }
    if (table.custodian_id) {
      await queryInterface.sequelize.query('ALTER TABLE assets DROP COLUMN custodian_id');
    }
  }
};
