'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ImmutableAuditLog extends Model {}
  ImmutableAuditLog.init({
    client_id: DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    action: DataTypes.STRING(100),
    module: DataTypes.STRING(50),
    entity_type: DataTypes.STRING(50),
    entity_id: DataTypes.INTEGER,
    before_hash: DataTypes.STRING(64),
    after_hash: DataTypes.STRING(64),
    payload: DataTypes.JSON,
    ip_address: DataTypes.STRING(45),
    user_agent: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'ImmutableAuditLog',
    tableName: 'immutable_audit_log',
    underscored: true,
    updatedAt: false,
    freezeTableName: true
  });
  return ImmutableAuditLog;
};

