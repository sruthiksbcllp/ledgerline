'use strict';
/**
 * CR-DEP-P2a — IT-Act block-of-assets ledger. Additive, idempotent, reversible.
 *  - it_act_block_ledger: one row per (client_id, it_act_block, fiscal_year) — the block's
 *    opening WDV, additions (full/half), depreciation, closing WDV (carry-forward).
 *  - it_act_block_asset_alloc: presentation allocation of a block's annual depreciation to
 *    its constituent assets (the filing figure stays block-level).
 * No change to Companies Act tables. No FK constraints (house pattern).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = (t) => tables.map((x) => String(x).toLowerCase()).includes(t);

    if (!has('it_act_block_ledger')) {
      await queryInterface.createTable('it_act_block_ledger', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        it_act_block: { type: Sequelize.STRING(100), allowNull: false },
        it_act_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
        fiscal_year: { type: Sequelize.STRING(9), allowNull: false }, // e.g. "2026-27"
        opening_wdv: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        additions_full: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        additions_half: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        sale_proceeds: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 }, // P2b
        depreciation: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        closing_wdv: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        status: { type: Sequelize.ENUM('DRAFT', 'POSTED'), defaultValue: 'POSTED' },
        computed_at: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
    const idx = await queryInterface.showIndex('it_act_block_ledger').catch(() => []);
    const idxNames = idx.map((i) => i.name);
    if (!idxNames.includes('uk_itblock_client_block_fy')) {
      await queryInterface.addIndex('it_act_block_ledger', ['client_id', 'it_act_block', 'fiscal_year'], { unique: true, name: 'uk_itblock_client_block_fy' });
    }

    if (!has('it_act_block_asset_alloc')) {
      await queryInterface.createTable('it_act_block_asset_alloc', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        block_ledger_id: { type: Sequelize.INTEGER, allowNull: false },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        asset_id: { type: Sequelize.INTEGER, allowNull: false },
        fiscal_year: { type: Sequelize.STRING(9), allowNull: false },
        opening_wdv: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        addition: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        addition_flag: { type: Sequelize.ENUM('FULL', 'HALF', 'NONE'), defaultValue: 'NONE' },
        allocated_depreciation: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        closing_wdv: { type: Sequelize.DECIMAL(18, 2), defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
    const idx2 = await queryInterface.showIndex('it_act_block_asset_alloc').catch(() => []);
    if (!idx2.map((i) => i.name).includes('ix_itblock_alloc_lookup')) {
      await queryInterface.addIndex('it_act_block_asset_alloc', ['client_id', 'fiscal_year', 'asset_id'], { name: 'ix_itblock_alloc_lookup' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('it_act_block_asset_alloc').catch(() => {});
    await queryInterface.dropTable('it_act_block_ledger').catch(() => {});
  },
};
