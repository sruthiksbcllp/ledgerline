'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addColumnIfMissing = async (tableName, columnName, definition) => {
      const table = await queryInterface.describeTable(tableName);
      if (!table[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition);
      }
    };

    await addColumnIfMissing('assets', 'vendor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'vendors',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await addColumnIfMissing('assets', 'po_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'purchaseorders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await addColumnIfMissing('assets', 'invoice_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'invoices',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await addColumnIfMissing('assets', 'grn_item_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'grn_items',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await addColumnIfMissing('assets', 'direct_procurement_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('assets', 'vendor_id');
    await queryInterface.removeColumn('assets', 'po_id');
    await queryInterface.removeColumn('assets', 'invoice_id');
    await queryInterface.removeColumn('assets', 'grn_item_id');
    await queryInterface.removeColumn('assets', 'direct_procurement_id');
  }
};
