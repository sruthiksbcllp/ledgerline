'use strict';
/**
 * Phase 3a — per-department head mapping for DOA dynamic-head resolution.
 * DYNAMIC_INITIATOR_HEAD -> department's sub-LoB head; DYNAMIC_FACILITATOR_HEAD -> facilitator head.
 * Additive/idempotent/reversible. No effect until DOA policies use the dynamic spec types.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    let exists = false;
    try { const tables = await queryInterface.showAllTables(); exists = tables.map(String).map((s) => s.toLowerCase()).includes('doa_department_heads'); } catch (e) { exists = false; }
    if (exists) return;
    await queryInterface.createTable('doa_department_heads', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      department_id: { type: Sequelize.INTEGER, allowNull: false },
      sublob_head_name: { type: Sequelize.STRING(120), allowNull: true },
      sublob_head_email: { type: Sequelize.STRING(160), allowNull: true },
      facilitator_head_name: { type: Sequelize.STRING(120), allowNull: true },
      facilitator_head_email: { type: Sequelize.STRING(160), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('doa_department_heads', ['client_id', 'department_id'], { unique: true, name: 'uk_doa_dept_head' });
  },
  async down(queryInterface) {
    try { await queryInterface.dropTable('doa_department_heads'); } catch (e) { /* ignore */ }
  },
};
