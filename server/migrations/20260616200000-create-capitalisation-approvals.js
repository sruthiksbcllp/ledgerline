'use strict';
module.exports = {
  async up(qi, Sequelize) {
    const tables = (await qi.showAllTables()).map(t => String(t).toLowerCase());
    if (tables.includes('capitalisation_approvals')) return; // idempotent
    await qi.createTable('capitalisation_approvals', {
      id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id:        { type: Sequelize.INTEGER, allowNull: false },
      source_type:      { type: Sequelize.STRING(30), allowNull: false },
      source_ref:       { type: Sequelize.STRING(64), allowNull: false },
      amount:           { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      dedupe_key:       { type: Sequelize.STRING(190), allowNull: false },
      event_date:       { type: Sequelize.DATEONLY, allowNull: false },
      fiscal_year:      { type: Sequelize.STRING(16), allowNull: true },
      period_month:     { type: Sequelize.INTEGER, allowNull: true },
      journal_payload:  { type: Sequelize.JSON, allowNull: false },
      created_by:       { type: Sequelize.INTEGER, allowNull: true },
      status:           { type: Sequelize.ENUM('PENDING_APPROVAL','IN_APPROVAL','APPROVED','REJECTED','CANCELLED','PENDING_CONFIGURATION'), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
      workflow_id:            { type: Sequelize.INTEGER, allowNull: true },
      current_level:          { type: Sequelize.INTEGER, defaultValue: 0 },
      current_approval_level: { type: Sequelize.INTEGER, defaultValue: 0 },
      total_approval_levels:  { type: Sequelize.INTEGER, defaultValue: 0 },
      status_lock:            { type: Sequelize.BOOLEAN, defaultValue: false },
      is_fully_approved:      { type: Sequelize.BOOLEAN, defaultValue: false },
      approval_date:          { type: Sequelize.DATE, allowNull: true },
      released_queue_id:      { type: Sequelize.INTEGER, allowNull: true },
      created_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:       { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('capitalisation_approvals', ['dedupe_key'], { unique: true, name: 'uk_capappr_dedupe' });
    await qi.addIndex('capitalisation_approvals', ['client_id', 'status'], { name: 'ix_capappr_client_status' });
  },
  async down(qi) { await qi.dropTable('capitalisation_approvals'); },
};
