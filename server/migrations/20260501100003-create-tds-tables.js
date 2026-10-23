'use strict';

const TABLES = ['tds_sections', 'tds_non_filers', 'tds_computations'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.showAllTables();
    const names = new Set(existing.map((t) => (typeof t === 'string' ? t : Object.values(t)[0])));

    if (!names.has('tds_sections')) {
      await queryInterface.createTable('tds_sections', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        section_code: { type: Sequelize.STRING(20), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        threshold_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        individual_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        company_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (!names.has('tds_non_filers')) {
      await queryInterface.createTable('tds_non_filers', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        pan: { type: Sequelize.STRING(10), allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: true },
        fy: { type: Sequelize.STRING(10), allowNull: false },
        source: { type: Sequelize.STRING(50), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    if (!names.has('tds_computations')) {
      await queryInterface.createTable('tds_computations', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false },
        vendor_id: { type: Sequelize.INTEGER, allowNull: false },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        section_code: { type: Sequelize.STRING(20), allowNull: false },
        tds_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        tds_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        is_206ab_applicable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        status: { type: Sequelize.ENUM('COMPUTED', 'APPLIED', 'REVERSED'), allowNull: false, defaultValue: 'COMPUTED' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
  },

  async down(queryInterface) {
    for (const tableName of TABLES.reverse()) {
      await queryInterface.dropTable(tableName).catch(() => {});
    }
  }
};

