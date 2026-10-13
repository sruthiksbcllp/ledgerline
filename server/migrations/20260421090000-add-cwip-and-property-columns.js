'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (tableName, columnName, definition) => {
      try {
        const table = await queryInterface.describeTable(tableName);
        if (!table[columnName]) {
          await queryInterface.addColumn(tableName, columnName, definition);
        }
      } catch(e) { /* table may not exist yet */ }
    };

    try {
      await queryInterface.createTable('cwipassets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        cwip_number: { type: Sequelize.STRING, unique: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'invoices', key: 'id' } },
        po_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'purchaseorders', key: 'id' } },
        property_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'properties', key: 'id' } },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        aging_days: { type: Sequelize.INTEGER, defaultValue: 0 },
        status: { type: Sequelize.ENUM('PARKED', 'CAPITALIZED'), defaultValue: 'PARKED' },
        put_to_use_date: { type: Sequelize.DATE },
        capitalized_asset_id: { type: Sequelize.INTEGER, references: { model: 'assets', key: 'id' } },
        capitalized_at: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
    } catch(e) { /* table exists */ }

    await addColumnIfMissing('purchaserequisitions', 'property_id', {
      type: Sequelize.INTEGER,
      references: { model: 'properties', key: 'id' }
    });
    await addColumnIfMissing('purchaseorders', 'property_id', {
      type: Sequelize.INTEGER,
      references: { model: 'properties', key: 'id' }
    });
    await addColumnIfMissing('grns', 'property_id', {
      type: Sequelize.INTEGER,
      references: { model: 'properties', key: 'id' }
    });
    await addColumnIfMissing('invoices', 'property_id', {
      type: Sequelize.INTEGER,
      references: { model: 'properties', key: 'id' }
    });
  },

  async down(queryInterface) {
    try { await queryInterface.dropTable('cwipassets'); } catch(e) { /* skip */ }
  }
};
