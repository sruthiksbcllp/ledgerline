'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.mfa_enabled) {
      await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) DEFAULT 0');
    }
    if (!table.mfa_secret) {
      await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(255) NULL');
    }
    if (!table.mfa_last_verified_at) {
      await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN mfa_last_verified_at DATETIME NULL');
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (table.mfa_last_verified_at) {
      await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN mfa_last_verified_at');
    }
    if (table.mfa_secret) {
      await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN mfa_secret');
    }
    if (table.mfa_enabled) {
      await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN mfa_enabled');
    }
  }
};
