'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const normalized = new Set(
      tables.map((t) => (typeof t === 'string' ? t : (t.tableName || t.TABLE_NAME || '')).toLowerCase())
    );

    if (!normalized.has('three_way_matches')) {
      await queryInterface.createTable('three_way_matches', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        po_id: { type: Sequelize.INTEGER, allowNull: false },
        grn_id: { type: Sequelize.INTEGER, allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        status: {
          type: Sequelize.ENUM('MATCHED', 'TOLERANCE_BREACH', 'BLOCKED', 'PENDING'),
          allowNull: false,
          defaultValue: 'PENDING'
        },
        qty_variance: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        amount_variance: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        tolerance_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        blocked_reason: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('three_way_matches', ['client_id', 'invoice_id'], { name: 'idx_twm_client_invoice' });
    }

    if (!normalized.has('ap_tolerance_rules')) {
      await queryInterface.createTable('ap_tolerance_rules', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        rule_name: { type: Sequelize.STRING(100), allowNull: false },
        tolerance_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 5 },
        tolerance_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        applies_to: {
          type: Sequelize.ENUM('QTY', 'AMOUNT', 'BOTH'),
          allowNull: false,
          defaultValue: 'BOTH'
        },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('ap_tolerance_rules', ['client_id', 'is_active'], { name: 'idx_ap_tol_client_active' });
    }
  },

  down: async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    const normalized = new Set(
      tables.map((t) => (typeof t === 'string' ? t : (t.tableName || t.TABLE_NAME || '')).toLowerCase())
    );
    if (normalized.has('three_way_matches')) await queryInterface.dropTable('three_way_matches');
    if (normalized.has('ap_tolerance_rules')) await queryInterface.dropTable('ap_tolerance_rules');
  }
};

