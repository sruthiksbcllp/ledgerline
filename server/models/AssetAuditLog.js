'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetAuditLog extends Model {
    static associate(models) {
      AssetAuditLog.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetAuditLog.belongsTo(models.User, { foreignKey: 'verified_by' });
    }
  }
  AssetAuditLog.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },

    status: { type: DataTypes.STRING(20), allowNull: false }, // VERIFIED / MISSING
    remarks: DataTypes.TEXT,
    verified_by: DataTypes.INTEGER,
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'AssetAuditLog',
    tableName: 'asset_audit_logs',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return AssetAuditLog;
};
