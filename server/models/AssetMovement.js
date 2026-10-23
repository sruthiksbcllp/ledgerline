'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AssetMovement extends Model {
    static associate(models) {
      AssetMovement.belongsTo(models.Asset, { foreignKey: 'asset_id' });
      AssetMovement.belongsTo(models.Location, { as: 'FromLocation', foreignKey: 'from_location_id' });
      AssetMovement.belongsTo(models.Location, { as: 'ToLocation', foreignKey: 'to_location_id' });
      AssetMovement.belongsTo(models.Department, { as: 'FromDepartment', foreignKey: 'from_department_id' });
      AssetMovement.belongsTo(models.Department, { as: 'ToDepartment', foreignKey: 'to_department_id' });
      AssetMovement.belongsTo(models.User, { as: 'AssignedUser', foreignKey: 'assigned_to_user_id' });
      AssetMovement.belongsTo(models.User, { as: 'Approver', foreignKey: 'approved_by' });
      AssetMovement.belongsTo(models.User, { as: 'Creator', foreignKey: 'created_by' });
    }
  }
  AssetMovement.init({
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    client_id: { type: DataTypes.INTEGER, allowNull: true },
    movement_type: { 
      type: DataTypes.ENUM('TRANSFER', 'LOAN', 'REPAIR', 'DISPOSAL', 'RETURN'),
      defaultValue: 'TRANSFER'
    },
    from_location_id: DataTypes.INTEGER,
    to_location_id: DataTypes.INTEGER,
    from_department_id: DataTypes.INTEGER,
    to_department_id: DataTypes.INTEGER,
    assigned_to_user_id: DataTypes.INTEGER,
    
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'),
      defaultValue: 'PENDING'
    },
    
    movement_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approved_by: DataTypes.INTEGER,
    approved_at: DataTypes.DATE,
    remarks: DataTypes.TEXT,
    
    created_by: DataTypes.INTEGER,
    updated_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AssetMovement',
    tableName: 'asset_movements',
    freezeTableName: true,
    underscored: true
  });
  return AssetMovement;
};
