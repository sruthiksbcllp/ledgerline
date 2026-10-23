'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditResult extends Model {
    static associate(models) {
      AuditResult.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
      AuditResult.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AuditResult.belongsTo(models.Location, { foreignKey: 'expected_location_id', as: 'ExpectedLocation' });
      AuditResult.belongsTo(models.Location, { foreignKey: 'actual_location_id', as: 'ActualLocation' });

    }
  }
  AuditResult.init({
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_id: DataTypes.INTEGER,
    status: {
      type: DataTypes.ENUM('FOUND', 'MISSING', 'EXTRA', 'MISMATCH'),
      allowNull: false
    },
    expected_location_id: DataTypes.INTEGER,
    actual_location_id: DataTypes.INTEGER,
    remarks: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'AuditResult',
    tableName: 'audit_results',
    freezeTableName: true,
    underscored: true
  });
  return AuditResult;
};
