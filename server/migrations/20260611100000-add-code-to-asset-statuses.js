'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('asset_statuses');
    if (!tableDesc.code) {
      await queryInterface.addColumn('asset_statuses', 'code', {
        type: Sequelize.STRING(30),
        allowNull: true,
        after: 'id'
      });
    }

    // Backfill codes from status_name for existing rows
    await queryInterface.sequelize.query(`
      UPDATE asset_statuses
      SET code = UPPER(REPLACE(REPLACE(TRIM(status_name), ' ', '_'), '-', '_'))
      WHERE code IS NULL
    `);

    // Add unique index (idempotent — check first)
    const [indexes] = await queryInterface.sequelize.query(
      `SHOW INDEX FROM asset_statuses WHERE Key_name = 'asset_statuses_code_unique'`
    );
    if (indexes.length === 0) {
      await queryInterface.addIndex('asset_statuses', ['code'], {
        name: 'asset_statuses_code_unique',
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('asset_statuses');
    if (tableDesc.code) {
      await queryInterface.removeColumn('asset_statuses', 'code');
    }
  }
};
