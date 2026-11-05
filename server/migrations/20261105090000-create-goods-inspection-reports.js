'use strict';

/**
 * Goods Inspection Report (GIR), one per GRN: the inspector's checklist, per-line findings (a snapshot
 * of ordered / received / accepted / rejected with a remark per line), the overall result and the
 * inspection note.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (tables.includes('goods_inspection_reports')) return;
    await queryInterface.createTable('goods_inspection_reports', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      gir_number: { type: Sequelize.STRING(50), allowNull: false },
      grn_id: { type: Sequelize.INTEGER, allowNull: false },
      po_id: { type: Sequelize.INTEGER, allowNull: true },
      vendor_id: { type: Sequelize.INTEGER, allowNull: true },
      inspection_date: { type: Sequelize.DATEONLY, allowNull: false },
      result: { type: Sequelize.STRING(30), allowNull: false }, // ACCEPTED / PARTIALLY_ACCEPTED / REJECTED
      checklist: { type: Sequelize.JSON, allowNull: true },
      line_findings: { type: Sequelize.JSON, allowNull: true },
      inspection_note: { type: Sequelize.TEXT, allowNull: false },
      inspected_by: { type: Sequelize.INTEGER, allowNull: true },
      inspected_by_name: { type: Sequelize.STRING(150), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('goods_inspection_reports', ['client_id', 'gir_number'], { unique: true, name: 'uq_gir_number' });
    await queryInterface.addIndex('goods_inspection_reports', ['client_id', 'grn_id'], { unique: true, name: 'uq_gir_grn' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('goods_inspection_reports');
  }
};
