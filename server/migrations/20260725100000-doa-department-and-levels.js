'use strict';
/**
 * DOA — Department routing + level-based sequential progression.
 * Additive/idempotent/reversible:
 *   - doa_policies.department_id  (INT NULL)  -> route IT vs Admin (NULL = any department)
 *   - doa_approval_steps.level    (INT def 1) -> approvers grouped into levels; levels run
 *                                                sequentially, approvers within a level in parallel
 * No data change. No live-engine change (DOA_APPROVALS flag-gated, default OFF).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const has = async (table, col) => {
      try { const d = await queryInterface.describeTable(table); return !!d[col]; } catch (e) { return false; }
    };
    if (!(await has('doa_policies', 'department_id'))) {
      await queryInterface.addColumn('doa_policies', 'department_id', { type: Sequelize.INTEGER, allowNull: true });
    }
    if (!(await has('doa_approval_steps', 'level'))) {
      await queryInterface.addColumn('doa_approval_steps', 'level', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    }
  },
  async down(queryInterface) {
    const has = async (table, col) => {
      try { const d = await queryInterface.describeTable(table); return !!d[col]; } catch (e) { return false; }
    };
    if (await has('doa_approval_steps', 'level')) await queryInterface.removeColumn('doa_approval_steps', 'level');
    if (await has('doa_policies', 'department_id')) await queryInterface.removeColumn('doa_policies', 'department_id');
  },
};
