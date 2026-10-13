'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetPerformance extends Model {
    static associate(models) {
      AssetPerformance.belongsTo(models.Asset, { foreignKey: 'asset_id' });
    }
  }
  AssetPerformance.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    down_time_hours: DataTypes.DECIMAL(8, 2),
    capacity_utilization_pct: DataTypes.DECIMAL(5, 2),
    performance_score: DataTypes.DECIMAL(5, 2),
    reason_for_downtime: DataTypes.TEXT,
    recorded_date: { type: DataTypes.DATE, allowNull: false },
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetPerformance',
    tableName: 'assetperformance',
    freezeTableName: true,
    timestamps: false
  });
  return AssetPerformance;
};
