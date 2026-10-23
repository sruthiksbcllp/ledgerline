'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetMaintenance extends Model {
    static associate(models) {
      AssetMaintenance.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetMaintenance.belongsTo(models.MaintenanceType, { foreignKey: 'maintenance_type_id' });
      AssetMaintenance.belongsTo(models.ServiceProvider, { foreignKey: 'service_provider_id' });
    }
  }
  AssetMaintenance.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    maintenance_type_id: { type: DataTypes.INTEGER, allowNull: false },
    service_provider_id: { type: DataTypes.INTEGER, allowNull: false },
    scheduled_date: { type: DataTypes.DATE, allowNull: false },
    estimated_cost: DataTypes.DECIMAL(12, 2),
    actual_cost: DataTypes.DECIMAL(12, 2),
    completion_date: DataTypes.DATE,
    status: { type: DataTypes.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'SCHEDULED' },
    description: DataTypes.TEXT,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetMaintenance',
    tableName: 'assetmaintenances',
    freezeTableName: true,
    timestamps: false
  });
  return AssetMaintenance;
};
