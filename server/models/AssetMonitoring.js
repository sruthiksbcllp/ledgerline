'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetMonitoring extends Model {
    static associate(models) {
      AssetMonitoring.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  AssetMonitoring.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    monitoring_type: { type: DataTypes.STRING(100), allowNull: false },
    monitored_by: { type: DataTypes.INTEGER, allowNull: false },
    monitored_date: { type: DataTypes.DATE, allowNull: false },
    next_monitoring_date: DataTypes.DATE,
    status: DataTypes.STRING(50),
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetMonitoring',
    tableName: 'assetmonitoring',
    freezeTableName: true,
    timestamps: false
  });
  return AssetMonitoring;
};
