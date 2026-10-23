'use strict';

/**
 * Ensures the LedgerLine role catalogue exists.
 * The API also runs this seed on startup, so a partial migration history still receives the roles.
 */
module.exports = {
  async up(queryInterface) {
    const { ensureLedgerRoles } = require('../services/rbacSeed');
    await ensureLedgerRoles(queryInterface.sequelize);
  },

  async down() {
    // Roles are reference data shared with existing users. Leave them in place.
  }
};
