'use strict';

/** @type {import('sequelize-cli').Migration} */
// NOTE: This migration is intentionally a no-op.
// All tables are created by 20260101000000-baseline-schema.js which uses
// CREATE TABLE IF NOT EXISTS with the correct column names.
// This file is kept to preserve migration history but must not create tables.
module.exports = {
  async up (queryInterface, Sequelize) {
    // no-op: superseded by baseline migration 20260101000000
  },
  async down (queryInterface, Sequelize) {
    // no-op
  }
};
