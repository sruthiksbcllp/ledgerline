const { Model, DataTypes } = require('sequelize');

/**
 * A company's connection to an external app (Settings → Integrations).
 * Secrets / OAuth tokens are encrypted columns and are never sent to the browser;
 * see services/integrations/connection.service.js for the public view.
 */
module.exports = (sequelize) => {
  class IntegrationConnection extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'connected_by', as: 'ConnectedBy' });
    }
  }

  IntegrationConnection.init({
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    // CONNECTED: verified against the provider. SAVED: settings stored, not verified (no live check
    // available yet). ERROR: the last check or token refresh failed.
    status: { type: DataTypes.ENUM('CONNECTED', 'SAVED', 'ERROR'), allowNull: false, defaultValue: 'SAVED' },
    account_label: { type: DataTypes.STRING(255), allowNull: true },
    external_account_id: { type: DataTypes.STRING(120), allowNull: true },
    config: { type: DataTypes.JSON, allowNull: true },
    secrets_enc: { type: DataTypes.TEXT, allowNull: true },
    access_token_enc: { type: DataTypes.TEXT, allowNull: true },
    refresh_token_enc: { type: DataTypes.TEXT, allowNull: true },
    token_expires_at: { type: DataTypes.DATE, allowNull: true },
    scopes: { type: DataTypes.STRING(1000), allowNull: true },
    connected_by: { type: DataTypes.INTEGER, allowNull: true },
    connected_at: { type: DataTypes.DATE, allowNull: true },
    last_checked_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize,
    modelName: 'IntegrationConnection',
    tableName: 'integration_connections',
    freezeTableName: true
  });

  return IntegrationConnection;
};
