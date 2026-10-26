'use strict';

/**
 * Settings → Integrations: one row per company per external app (Zoho Books, Tally, NetSuite,
 * SAP, GSP, RazorpayX, WhatsApp). Secrets and OAuth tokens are stored encrypted (AES-256-GCM);
 * `config` only ever holds non-secret settings such as an organisation ID or a server URL.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => String(t.tableName || t).toLowerCase());
    if (tables.includes('integration_connections')) return;
    await queryInterface.createTable('integration_connections', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      provider: { type: Sequelize.STRING(40), allowNull: false },
      status: {
        type: Sequelize.ENUM('CONNECTED', 'SAVED', 'ERROR'),
        allowNull: false,
        defaultValue: 'SAVED'
      },
      account_label: { type: Sequelize.STRING(255), allowNull: true },
      external_account_id: { type: Sequelize.STRING(120), allowNull: true },
      config: { type: Sequelize.JSON, allowNull: true },
      secrets_enc: { type: Sequelize.TEXT, allowNull: true },
      access_token_enc: { type: Sequelize.TEXT, allowNull: true },
      refresh_token_enc: { type: Sequelize.TEXT, allowNull: true },
      token_expires_at: { type: Sequelize.DATE, allowNull: true },
      scopes: { type: Sequelize.STRING(1000), allowNull: true },
      connected_by: { type: Sequelize.INTEGER, allowNull: true },
      connected_at: { type: Sequelize.DATE, allowNull: true },
      last_checked_at: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('integration_connections', ['client_id', 'provider'], {
      unique: true,
      name: 'uq_integration_connections_client_provider'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_connections');
  }
};
