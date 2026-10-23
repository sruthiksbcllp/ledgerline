'use strict';

/**
 * 20260504270000-fix-assetissues-and-remaining-seed-columns.js
 * Adds columns needed by the seed script that are missing from tables.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (table, col, def) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (_) {}
    };

    // ── assetissues ───────────────────────────────────────────────────────────
    await addIfMissing('assetissues', 'assigned_to_user',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assetissues', 'assigned_to_vendor', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assetissues', 'amc_id',             { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assetissues', 'vendor_id',          { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('assetissues', 'resolved_at',        { type: Sequelize.DATE, allowNull: true });
  },

  down: async () => {}
};
