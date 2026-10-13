'use strict';
module.exports = (sequelize, DataTypes) => {
  const AssetCostAllocation = sequelize.define('AssetCostAllocation', {
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    cost_center_id: { type: DataTypes.INTEGER, allowNull: false },
    allocation_percentage: { type: DataTypes.DECIMAL(5,2), defaultValue: 100 },
    allocation_basis: { type: DataTypes.ENUM('MANUAL','FLOOR_SPACE','HEADCOUNT','USAGE'), defaultValue: 'MANUAL' },
    effective_from: DataTypes.DATEONLY,
    effective_to: DataTypes.DATEONLY
  }, { tableName: 'asset_cost_allocations', timestamps: true, underscored: true, updatedAt: false });
  AssetCostAllocation.associate = (models) => {
    AssetCostAllocation.belongsTo(models.CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
    AssetCostAllocation.belongsTo(models.Asset, { foreignKey: 'asset_id' });
  };
  return AssetCostAllocation;
};
