'use strict';

/**
 * Which LedgerLine record each external record belongs to (integration_links): e.g. vendor 12 is
 * Zoho Books contact 4600000000123, invoice 40 is bill 4600000000456. Sync looks here first so a
 * record is created once and updated after; failures keep the provider's error for the screen.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (tables.includes('integration_links')) return;
    await queryInterface.createTable('integration_links', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      provider: { type: Sequelize.STRING(40), allowNull: false },
      entity_type: { type: Sequelize.STRING(30), allowNull: false }, // VENDOR / BILL / ADVANCE / PAYMENT / SETTLEMENT / CREDIT
      local_id: { type: Sequelize.INTEGER, allowNull: false },
      external_id: { type: Sequelize.STRING(100), allowNull: true },
      external_ref: { type: Sequelize.STRING(150), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' }, // SYNCED / FAILED / PENDING
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      synced_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('integration_links', ['client_id', 'provider', 'entity_type', 'local_id'], { unique: true, name: 'uq_integration_links_local' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_links');
  }
};
