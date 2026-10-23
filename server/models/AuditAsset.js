'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditAsset extends Model {
    static associate(models) {
      AuditAsset.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
      AuditAsset.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  AuditAsset.init({
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    expected_location_id: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AuditAsset',
    tableName: 'audit_assets',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return AuditAsset;
};
