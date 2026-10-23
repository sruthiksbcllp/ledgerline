'use strict';
module.exports = (sequelize, DataTypes) => {
  const CostCenter = sequelize.define('CostCenter', {
    client_id: DataTypes.INTEGER,
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    parent_id: DataTypes.INTEGER,
    level: { type: DataTypes.ENUM('COMPANY','BUSINESS_UNIT','DEPARTMENT','SUB_DEPARTMENT'), defaultValue: 'DEPARTMENT' },
    owner_id: { type: DataTypes.INTEGER, allowNull: true },
    approver_id: { type: DataTypes.INTEGER, allowNull: true },
    sub_ledger: { type: DataTypes.STRING(50), allowNull: true }, // CR-P07
    allocation_owner_id: { type: DataTypes.INTEGER, allowNull: true }, // CR-P07
    owner_name: { type: DataTypes.STRING(150), allowNull: true },
    approver_name: { type: DataTypes.STRING(150), allowNull: true },
    allocation_owner_name: { type: DataTypes.STRING(150), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'cost_centers', timestamps: true, underscored: true });
  CostCenter.associate = (models) => {
    CostCenter.hasMany(models.AssetCostAllocation, { foreignKey: 'cost_center_id', as: 'allocations' });
    CostCenter.belongsTo(models.User, { foreignKey: 'owner_id', as: 'owner' });
    CostCenter.belongsTo(models.User, { foreignKey: 'approver_id', as: 'approver' });
  };
  return CostCenter;
};
