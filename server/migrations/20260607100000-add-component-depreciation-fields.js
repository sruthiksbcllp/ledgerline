'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('assets');

    if (!tableDesc.parent_asset_id) {
      await queryInterface.addColumn('assets', 'parent_asset_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: 'assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!tableDesc.is_component_parent) {
      await queryInterface.addColumn('assets', 'is_component_parent', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!tableDesc.component_name) {
      await queryInterface.addColumn('assets', 'component_name', {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null
      });
    }

    // Index for fast component lookups
    await queryInterface.addIndex('assets', ['parent_asset_id'], {
      name: 'idx_assets_parent_asset_id',
      where: { parent_asset_id: { [Sequelize.Op.ne]: null } }
    }).catch(() => {}); // ignore if exists
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('assets', 'idx_assets_parent_asset_id').catch(() => {});
    await queryInterface.removeColumn('assets', 'component_name').catch(() => {});
    await queryInterface.removeColumn('assets', 'is_component_parent').catch(() => {});
    await queryInterface.removeColumn('assets', 'parent_asset_id').catch(() => {});
  }
};
