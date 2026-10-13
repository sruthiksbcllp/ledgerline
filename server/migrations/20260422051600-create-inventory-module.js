'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Tables already created by baseline — try/catch for idempotency
    try {
      await queryInterface.createTable('items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        item_name: { type: Sequelize.STRING, allowNull: false },
        sku_code: { type: Sequelize.STRING, unique: true, allowNull: false },
        category_id: { type: Sequelize.INTEGER, references: { model: 'assetcategories', key: 'id' } },
        sub_category_id: { type: Sequelize.INTEGER, references: { model: 'asset_sub_categories', key: 'id' } },
        unit: { type: Sequelize.STRING, defaultValue: 'Nos' },
        min_stock_level: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        reorder_level: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        item_description: { type: Sequelize.TEXT },
        status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    try {
      await queryInterface.createTable('inventorybalances', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'locations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    try {
      await queryInterface.addIndex('inventorybalances', ['item_id', 'location_id'], {
        unique: true,
        name: 'unique_item_location_balance'
      });
    } catch(e) { /* index exists */ }

    try {
      await queryInterface.createTable('stocktransactions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'items', key: 'id' }
        },
        transaction_type: {
          type: Sequelize.ENUM('GRN', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'),
          allowNull: false
        },
        quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        unit_cost: { type: Sequelize.DECIMAL(15, 2) },
        batch_number: { type: Sequelize.STRING },
        serial_number: { type: Sequelize.STRING },
        from_location_id: { type: Sequelize.INTEGER, references: { model: 'locations', key: 'id' } },
        to_location_id: { type: Sequelize.INTEGER, references: { model: 'locations', key: 'id' } },
        supplier_id: { type: Sequelize.INTEGER, references: { model: 'vendors', key: 'id' } },
        reference_number: { type: Sequelize.STRING },
        notes: { type: Sequelize.TEXT },
        created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }
  },

  async down (queryInterface) {
    const tables = ['stocktransactions', 'inventorybalances', 'items'];
    for (const t of tables) {
      try { await queryInterface.dropTable(t); } catch(e) { /* skip */ }
    }
  }
};
