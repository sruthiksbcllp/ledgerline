'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SsoConfig', {
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    provider: { type: DataTypes.ENUM('AZURE_AD','OKTA','GOOGLE','SAML_GENERIC','OIDC_GENERIC'), allowNull: false },
    is_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    entity_id: DataTypes.STRING(500),
    sso_url: DataTypes.STRING(500),
    certificate: DataTypes.TEXT,
    client_oidc_id: DataTypes.STRING(255),
    client_oidc_secret: DataTypes.STRING(255),
    metadata_url: DataTypes.STRING(500),
    default_role: { type: DataTypes.STRING(50), defaultValue: 'REQUESTER' },
    auto_provision: { type: DataTypes.BOOLEAN, defaultValue: true },
    group_role_mapping: DataTypes.JSON
  }, { tableName: 'sso_configs', timestamps: true, underscored: true });
};
