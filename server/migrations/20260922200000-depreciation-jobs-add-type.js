'use strict';
/**
 * CR-DEP-01b — extend depreciation_jobs for the IT-Act annual run + CLI recompute.
 * Additive/idempotent/reversible. Adds job_type (MONTHLY/IT_ACT_ANNUAL/RECOMPUTE)
 * and makes period_month nullable (annual + recompute jobs have no single month).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = tables.map(t => (typeof t === 'string' ? t : t.tableName)).includes('depreciation_jobs');
    if (!has) return; // CR-DEP-01 migration creates the table; nothing to extend if absent
    const cols = await queryInterface.describeTable('depreciation_jobs');
    if (!cols.job_type) {
      await queryInterface.addColumn('depreciation_jobs', 'job_type', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'MONTHLY'
      });
    }
    if (cols.period_month && cols.period_month.allowNull === false) {
      await queryInterface.changeColumn('depreciation_jobs', 'period_month', {
        type: Sequelize.INTEGER, allowNull: true
      });
    }
  },
  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = tables.map(t => (typeof t === 'string' ? t : t.tableName)).includes('depreciation_jobs');
    if (!has) return;
    const cols = await queryInterface.describeTable('depreciation_jobs');
    if (cols.job_type) await queryInterface.removeColumn('depreciation_jobs', 'job_type');
    // period_month left nullable on down (narrowing could fail if null rows exist)
  },
};
