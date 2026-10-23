'use strict';
/**
 * CR-DEP-01 — Async depreciation posting. Additive, idempotent, reversible.
 * Creates `depreciation_jobs` to track background Run-Monthly-Depreciation jobs
 * (status + progress) so large tenants can run posting from the UI without an
 * HTTP timeout. NO change to any existing table, engine, ledger or GL.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const has = tables.map(t => (typeof t === 'string' ? t : t.tableName)).includes('depreciation_jobs');
    if (!has) {
      await queryInterface.createTable('depreciation_jobs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        fiscal_year: { type: Sequelize.STRING(9), allowNull: false },
        period_month: { type: Sequelize.INTEGER, allowNull: false },
        book: { type: Sequelize.STRING(30), allowNull: true, defaultValue: 'ALL' },
        status: { type: Sequelize.ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'), allowNull: false, defaultValue: 'QUEUED' },
        total_assets: { type: Sequelize.INTEGER, allowNull: true },
        processed_assets: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        posted_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        skipped_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        source: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'manual' },
        started_at: { type: Sequelize.DATE, allowNull: true },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        heartbeat_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
    // index for the concurrency guard + tenant listing (idempotent)
    try {
      const idx = await queryInterface.showIndex('depreciation_jobs');
      const names = idx.map(i => i.name);
      if (!names.includes('ix_depjob_scope')) {
        await queryInterface.addIndex('depreciation_jobs', ['client_id', 'fiscal_year', 'period_month', 'status'], { name: 'ix_depjob_scope' });
      }
    } catch (e) { /* table may not support showIndex on some engines; index is best-effort */ }
  },
  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const has = tables.map(t => (typeof t === 'string' ? t : t.tableName)).includes('depreciation_jobs');
    if (has) await queryInterface.dropTable('depreciation_jobs');
  },
};
