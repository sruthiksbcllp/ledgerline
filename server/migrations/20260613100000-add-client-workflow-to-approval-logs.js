'use strict';

/**
 * FT-003/FT-004 Batch 0 — add tenant + workflow attribution to approval_logs.
 * Additive and nullable: existing reads/writes are unaffected. Reversible.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, col, def) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (e) { /* table may not exist yet */ }
    };
    await addColumnIfMissing('approval_logs', 'client_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addColumnIfMissing('approval_logs', 'workflow_id', { type: Sequelize.INTEGER, allowNull: true });
    // Best-effort read indexes for attribution/forensic queries.
    try { await queryInterface.addIndex('approval_logs', ['client_id'],   { name: 'ix_approval_logs_client_id' }); } catch (e) {}
    try { await queryInterface.addIndex('approval_logs', ['workflow_id'], { name: 'ix_approval_logs_workflow_id' }); } catch (e) {}
  },

  async down(queryInterface) {
    const removeIndex = async (t, n) => { try { await queryInterface.removeIndex(t, n); } catch (e) {} };
    const removeCol = async (t, c) => {
      try { const d = await queryInterface.describeTable(t); if (d[c]) await queryInterface.removeColumn(t, c); } catch (e) {}
    };
    await removeIndex('approval_logs', 'ix_approval_logs_client_id');
    await removeIndex('approval_logs', 'ix_approval_logs_workflow_id');
    await removeCol('approval_logs', 'client_id');
    await removeCol('approval_logs', 'workflow_id');
  }
};
