'use strict';
/**
 * Phase 4b (#18/#19) — PO Terms & Conditions: per-PO override + per-department defaults.
 * Print resolves: PO override -> department default -> tenant po_print_config default.
 * Additive/idempotent/reversible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const has = async (tbl, col) => { try { const d = await queryInterface.describeTable(tbl); return !!d[col]; } catch (e) { return true; } };
    if (!(await has('purchaseorders', 'po_warranty'))) await queryInterface.addColumn('purchaseorders', 'po_warranty', { type: Sequelize.STRING(255), allowNull: true });
    if (!(await has('purchaseorders', 'po_payment_terms'))) await queryInterface.addColumn('purchaseorders', 'po_payment_terms', { type: Sequelize.STRING(255), allowNull: true });
    if (!(await has('purchaseorders', 'po_terms'))) await queryInterface.addColumn('purchaseorders', 'po_terms', { type: Sequelize.TEXT, allowNull: true });
    let exists = false;
    try { const tables = await queryInterface.showAllTables(); exists = tables.map(String).map((s) => s.toLowerCase()).includes('po_terms_defaults'); } catch (e) { exists = false; }
    if (!exists) {
      await queryInterface.createTable('po_terms_defaults', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        department_id: { type: Sequelize.INTEGER, allowNull: false },
        warranty: { type: Sequelize.STRING(255), allowNull: true },
        payment_terms: { type: Sequelize.STRING(255), allowNull: true },
        terms_conditions: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await queryInterface.addIndex('po_terms_defaults', ['client_id', 'department_id'], { unique: true, name: 'uk_po_terms_dept' });
    }
  },
  async down(queryInterface) {
    for (const c of ['po_warranty', 'po_payment_terms', 'po_terms']) { try { await queryInterface.removeColumn('purchaseorders', c); } catch (e) {} }
    try { await queryInterface.dropTable('po_terms_defaults'); } catch (e) {}
  },
};
