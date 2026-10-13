'use strict';

/**
 * FT-002 Batch 2A — ensure approval_matrix.client_id is NULLABLE.
 * Provider-default approval rules carry client_id = NULL (the inheritance fallback
 * resolved by getApplicableRulesForTenant). Baseline created the column DEFAULT NULL,
 * but a later createIfMissing declared allowNull:false; dev schema is drifted, so this
 * makes the constraint explicit and consistent everywhere. Additive/widening — safe.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const t = await queryInterface.describeTable('approval_matrix');
      if (t.client_id && t.client_id.allowNull === false) {
        await queryInterface.changeColumn('approval_matrix', 'client_id', {
          type: Sequelize.INTEGER, allowNull: true
        });
      }
    } catch (e) { /* table may not exist yet */ }
  },

  async down(queryInterface, Sequelize) {
    // Intentionally a no-op: re-adding NOT NULL could fail if provider-default
    // (client_id IS NULL) rows exist. Widening is not safely reversible.
  }
};
