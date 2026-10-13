'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = async (name) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?`,
        { replacements: [name] }
      );
      return Number(rows[0].c) > 0;
    };

    if (await tableExists('inventorybalances')) return;

    await queryInterface.createTable('inventorybalances', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      item_id: { type: Sequelize.INTEGER, allowNull: false },
      location_id: { type: Sequelize.INTEGER, allowNull: false },
      quantity: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await queryInterface.addIndex('inventorybalances', ['item_id', 'location_id'], {
      unique: true,
      name: 'inventorybalances_item_location_unique'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('inventorybalances').catch(() => {});
  }
};
