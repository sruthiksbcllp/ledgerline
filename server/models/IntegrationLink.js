'use strict';
const { Model } = require('sequelize');

/** A LedgerLine record and the external record it was synced to (one row per provider and record). */
module.exports = (sequelize, DataTypes) => {
  class IntegrationLink extends Model {}
  IntegrationLink.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, allowNull: false },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    entity_type: { type: DataTypes.STRING(30), allowNull: false },
    local_id: { type: DataTypes.INTEGER, allowNull: false },
    external_id: { type: DataTypes.STRING(100), allowNull: true },
    external_ref: { type: DataTypes.STRING(150), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    last_error: { type: DataTypes.STRING(500), allowNull: true },
    synced_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'IntegrationLink',
    tableName: 'integration_links',
    freezeTableName: true,
    underscored: true
  });
  return IntegrationLink;
};
