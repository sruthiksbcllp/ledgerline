'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add new columns to purchaserequisitions
    const prCols = await queryInterface.describeTable('purchaserequisitions');

    if (!prCols.entity_id) {
      await queryInterface.addColumn('purchaserequisitions', 'entity_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'entities', key: 'id' }
      });
    }

    if (!prCols.requested_by_user_id) {
      await queryInterface.addColumn('purchaserequisitions', 'requested_by_user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      });
    }

    if (!prCols.asset_id) {
      await queryInterface.addColumn('purchaserequisitions', 'asset_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!prCols.vendor_id) {
      await queryInterface.addColumn('purchaserequisitions', 'vendor_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'vendors', key: 'id' }
      });
    }

    // Create vendor_assets link table for multi-select asset tagging on vendors
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('vendor_assets')) {
      await queryInterface.createTable('vendor_assets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        vendor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'vendors', key: 'id' }, onDelete: 'CASCADE' },
        asset_id: { type: Sequelize.INTEGER, allowNull: false },
        asset_name: { type: Sequelize.STRING, allowNull: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('purchaserequisitions', 'entity_id').catch(() => {});
    await queryInterface.removeColumn('purchaserequisitions', 'requested_by_user_id').catch(() => {});
    await queryInterface.removeColumn('purchaserequisitions', 'asset_id').catch(() => {});
    await queryInterface.removeColumn('purchaserequisitions', 'vendor_id').catch(() => {});
    await queryInterface.dropTable('vendor_assets').catch(() => {});
  }
};
