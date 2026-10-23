'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserMailAccount extends Model {
    static associate(models) {
      UserMailAccount.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }
  UserMailAccount.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    // SMTP = manual server settings; GOOGLE / MICROSOFT = one-click OAuth connection.
    provider: { type: DataTypes.ENUM('SMTP', 'GOOGLE', 'MICROSOFT'), allowNull: false, defaultValue: 'SMTP' },
    smtp_host: { type: DataTypes.STRING(255), allowNull: true },
    smtp_port: { type: DataTypes.INTEGER, allowNull: true },
    smtp_secure: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    smtp_user: { type: DataTypes.STRING(255), allowNull: true },
    // AES-256-GCM ciphertext; never returned by the API.
    password_enc: { type: DataTypes.TEXT, allowNull: true },
    // OAuth tokens, encrypted the same way; never returned by the API.
    oauth_refresh_enc: { type: DataTypes.TEXT, allowNull: true },
    oauth_access_enc: { type: DataTypes.TEXT, allowNull: true },
    oauth_expires_at: { type: DataTypes.DATE, allowNull: true },
    // Space-separated permissions the provider granted, e.g. "Mail.Send Mail.Read".
    oauth_scopes: { type: DataTypes.TEXT, allowNull: true },
    from_name: { type: DataTypes.STRING(255), allowNull: true },
    from_email: { type: DataTypes.STRING(255), allowNull: false },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize,
    modelName: 'UserMailAccount',
    tableName: 'user_mail_accounts',
    freezeTableName: true,
    underscored: true,
    timestamps: true
  });
  return UserMailAccount;
};
