'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add MONTHLY to audit_plannings frequency ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE audit_plannings 
      MODIFY COLUMN frequency ENUM('ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY') 
      DEFAULT 'ANNUAL'
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE audit_plannings 
      MODIFY COLUMN frequency ENUM('ANNUAL', 'HALF_YEARLY', 'QUARTERLY') 
      DEFAULT 'ANNUAL'
    `);
  }
};
