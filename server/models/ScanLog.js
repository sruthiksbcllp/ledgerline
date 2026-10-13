'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ScanLog extends Model {
    static associate(models) {
      ScanLog.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      ScanLog.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }
  ScanLog.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    client_id: { type: DataTypes.INTEGER, defaultValue: 1 },
    asset_id: { type: DataTypes.INTEGER },

    scanned_code: { type: DataTypes.STRING(100) },
    scan_type: { type: DataTypes.STRING(20) }, // KEYBOARD / CAMERA / QR
    user_id: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'ScanLog',
    tableName: 'scan_logs',
    freezeTableName: true,
    timestamps: false,
    underscored: true
  });
  return ScanLog;
};
