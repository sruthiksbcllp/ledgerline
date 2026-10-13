'use strict';

module.exports = {
  async up(queryInterface) {
    // Backfill capitalization_type for all existing assets that haven't been classified yet.
    // Uses the default threshold of 5000 (CompanyPolicy.min_cost_to_capitalize).
    // Assets created after this migration will be auto-classified at creation time.

    // Step 1: CWIP-sourced assets → CWIP
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET capitalization_type = 'CWIP', auto_classified = 1
      WHERE capitalization_type IS NULL
        AND source_type = 'CWIP'
    `);

    // Step 2: Remaining assets — classify by cost vs default threshold (5000)
    // companypolicies table may not exist yet, so use flat threshold
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET capitalization_type = CASE
        WHEN COALESCE(purchase_cost, total_cost, 0) >= 5000 THEN 'CAPITALIZE'
        ELSE 'EXPENSE'
      END,
      auto_classified = 1
      WHERE capitalization_type IS NULL
    `);
  },

  async down(queryInterface) {
    // Reverse: clear the backfilled values
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET capitalization_type = NULL, auto_classified = 0
      WHERE auto_classified = 1
    `);
  }
};
