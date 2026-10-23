'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditScan extends Model {
    static associate(models) {
      AuditScan.belongsTo(models.AuditSession, { foreignKey: 'audit_session_id' });
      AuditScan.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AuditScan.belongsTo(models.User, { foreignKey: 'scanned_by', as: 'Auditor' });
      AuditScan.belongsTo(models.Location, { foreignKey: 'scanned_location_id', as: 'ScannedLocation' });
    }
  }
  AuditScan.init({
    audit_session_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    asset_id: DataTypes.INTEGER,
    rfid_tag: DataTypes.STRING,
    qr_code: DataTypes.STRING,
    scanned_location_id: DataTypes.INTEGER,
    scanned_by: DataTypes.INTEGER,
    scanned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'AuditScan',
    tableName: 'audit_scans',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return AuditScan;
};
