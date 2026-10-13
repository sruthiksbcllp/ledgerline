'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetScanLog extends Model {
    static associate(models) {
      AssetScanLog.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetScanLog.belongsTo(models.Location, { foreignKey: 'location_id' });
    }
  }
  AssetScanLog.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tag_id: { type: DataTypes.STRING(100), allowNull: false },
    asset_id: { type: DataTypes.INTEGER },
    location_id: { type: DataTypes.INTEGER },
    scanner_id: { type: DataTypes.STRING(50) },
    scan_type: { type: DataTypes.ENUM('QR', 'RFID'), allowNull: false },
    scanned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    raw_payload: { type: DataTypes.JSON }
  }, {
    sequelize,
    modelName: 'AssetScanLog',
    tableName: 'asset_scan_logs',
    freezeTableName: true,
    underscored: true,
    timestamps: false
  });
  return AssetScanLog;
};
